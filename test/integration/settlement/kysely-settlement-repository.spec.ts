import { sql } from 'kysely';
import { useTestDatabase } from '../../support/integration-db';
import { KyselySettlementRepository } from '../../../src/infra/db/settlement-repository';

describe('KyselySettlementRepository.settleMatch', () => {
  const testDb = useTestDatabase();

  function repository(): KyselySettlementRepository {
    return new KyselySettlementRepository(testDb.db);
  }

  async function seedMatchWithPicks(matchId: string): Promise<void> {
    await sql`insert into matches (id, kickoff_at, status) values (${matchId}, now() - interval '1 hour', 'scheduled')`.execute(
      testDb.db,
    );
    await sql`insert into users (id) values ('u1'), ('u2'), ('u3')`.execute(testDb.db);
    await sql`
      insert into picks (user_id, match_id, type, predicted_outcome)
      values ('u1', ${matchId}, 'result', 'home')
    `.execute(testDb.db);
    await sql`
      insert into picks (user_id, match_id, type, predicted_home, predicted_away)
      values ('u2', ${matchId}, 'exact', 2, 1)
    `.execute(testDb.db);
    await sql`
      insert into picks (user_id, match_id, type, predicted_outcome)
      values ('u3', ${matchId}, 'result', 'away')
    `.execute(testDb.db);
  }

  async function balanceOf(userId: string): Promise<number> {
    const row = await testDb.db
      .selectFrom('balances')
      .select('points')
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return row ? Number(row.points) : 0;
  }

  it('settles a match with no picks: settlement recorded, match finished, no awards', async () => {
    await sql`insert into matches (id, kickoff_at, status) values ('empty-match', now() - interval '1 hour', 'scheduled')`.execute(
      testDb.db,
    );

    const result = await repository().settleMatch({
      matchId: 'empty-match',
      eventId: 'evt-1',
      homeScore: 2,
      awayScore: 1,
      rawPayload: {},
    });

    expect(result.kind).toBe('applied');

    const settlement = await testDb.db
      .selectFrom('settlements')
      .select(['home_score', 'away_score', 'event_id'])
      .where('match_id', '=', 'empty-match')
      .executeTakeFirstOrThrow();
    expect(settlement).toEqual({ home_score: 2, away_score: 1, event_id: 'evt-1' });

    const match = await testDb.db
      .selectFrom('matches')
      .select(['status', 'home_score', 'away_score', 'settled_at'])
      .where('id', '=', 'empty-match')
      .executeTakeFirstOrThrow();
    expect(match.status).toBe('finished');
    expect(match.home_score).toBe(2);
    expect(match.away_score).toBe(1);
    expect(match.settled_at).not.toBeNull();

    const awardCount = await testDb.db
      .selectFrom('point_awards')
      .select(testDb.db.fn.countAll().as('n'))
      .executeTakeFirstOrThrow();
    expect(awardCount.n).toBe('0');
  });

  it('scores every pick correctly and credits balances (including a zero-point row)', async () => {
    await seedMatchWithPicks('scored-match');

    const result = await repository().settleMatch({
      matchId: 'scored-match',
      eventId: 'evt-1',
      homeScore: 2,
      awayScore: 1,
      rawPayload: {},
    });

    expect(result.kind).toBe('applied');

    const awards = await testDb.db
      .selectFrom('point_awards')
      .select(['user_id', 'points'])
      .orderBy('user_id')
      .execute();
    expect(awards).toEqual([
      { user_id: 'u1', points: 10 }, // correct result
      { user_id: 'u2', points: 30 }, // correct exact score
      { user_id: 'u3', points: 0 }, // wrong result — zero-point row still exists
    ]);

    expect(await balanceOf('u1')).toBe(10);
    expect(await balanceOf('u2')).toBe(30);
    expect(await balanceOf('u3')).toBe(0);
  });

  it('a repeat call with the same eventId never credits points twice', async () => {
    await seedMatchWithPicks('repeat-match');
    const params = { matchId: 'repeat-match', eventId: 'evt-1', homeScore: 2, awayScore: 1, rawPayload: {} };

    const first = await repository().settleMatch(params);
    expect(first.kind).toBe('applied');
    const second = await repository().settleMatch(params);
    expect(second.kind).toBe('duplicate');

    expect(await balanceOf('u1')).toBe(10);
    const settlementCount = await testDb.db
      .selectFrom('settlements')
      .select(testDb.db.fn.countAll().as('n'))
      .where('match_id', '=', 'repeat-match')
      .executeTakeFirstOrThrow();
    expect(settlementCount.n).toBe('1');
  });

  it('a repeat call with a different eventId but the same scores is still a duplicate, not a re-credit', async () => {
    await seedMatchWithPicks('repeat-diff-event-match');
    const first = await repository().settleMatch({
      matchId: 'repeat-diff-event-match',
      eventId: 'evt-1',
      homeScore: 2,
      awayScore: 1,
      rawPayload: {},
    });
    expect(first.kind).toBe('applied');

    const second = await repository().settleMatch({
      matchId: 'repeat-diff-event-match',
      eventId: 'evt-2',
      homeScore: 2,
      awayScore: 1,
      rawPayload: {},
    });
    expect(second.kind).toBe('duplicate');

    expect(await balanceOf('u1')).toBe(10);
  });

  it('a repeat call with different scores is a conflict, not a re-settlement (first-write-wins)', async () => {
    await seedMatchWithPicks('conflict-match');
    const first = await repository().settleMatch({
      matchId: 'conflict-match',
      eventId: 'evt-1',
      homeScore: 2,
      awayScore: 1,
      rawPayload: {},
    });
    expect(first.kind).toBe('applied');

    const second = await repository().settleMatch({
      matchId: 'conflict-match',
      eventId: 'evt-2',
      homeScore: 0,
      awayScore: 0,
      rawPayload: {},
    });
    expect(second.kind).toBe('conflict');

    // original scores and awards stand — first-write-wins
    const settlement = await testDb.db
      .selectFrom('settlements')
      .select(['home_score', 'away_score'])
      .where('match_id', '=', 'conflict-match')
      .executeTakeFirstOrThrow();
    expect(settlement).toEqual({ home_score: 2, away_score: 1 });
    expect(await balanceOf('u1')).toBe(10);
  });

  it('rejects settlement of an unknown match and writes nothing', async () => {
    const result = await repository().settleMatch({
      matchId: 'no-such-match',
      eventId: 'evt-1',
      homeScore: 1,
      awayScore: 0,
      rawPayload: {},
    });

    expect(result.kind).toBe('unknown_match');

    const settlementCount = await testDb.db
      .selectFrom('settlements')
      .select(testDb.db.fn.countAll().as('n'))
      .executeTakeFirstOrThrow();
    expect(settlementCount.n).toBe('0');
  });

  it('still settles exactly once with the fast path and lock both disabled (sequential calls)', async () => {
    await seedMatchWithPicks('no-layers-match');
    const params = { matchId: 'no-layers-match', eventId: 'evt-1', homeScore: 2, awayScore: 1, rawPayload: {} };
    const options = { skipFastPath: true, skipLock: true };

    const first = await repository().settleMatch(params, options);
    expect(first.kind).toBe('applied');
    const second = await repository().settleMatch(params, options);
    expect(second.kind).toBe('duplicate');

    expect(await balanceOf('u1')).toBe(10);
  });
});
