import { Kysely, sql } from 'kysely';
import { useTestDatabase } from '../../support/integration-db';
import { PostgresLeaderboardRepository } from '../../../src/infra/db/leaderboard-repository';
import { Database } from '../../../src/infra/db/schema';

describe('PostgresLeaderboardRepository', () => {
  const testDb = useTestDatabase();
  let matchCounter = 0;

  function repository(): PostgresLeaderboardRepository {
    return new PostgresLeaderboardRepository(testDb.db);
  }

  /** Seeds a user with a real, FK-satisfying point_awards row so created_at (the tie-break
   * column) can be controlled via agoInterval. Keeps balances consistent with point_awards
   * so the harness's automatic assertLedgerInvariants (I4) still holds. */
  async function seedUserWithPoints(
    db: Kysely<Database>,
    userId: string,
    points: number,
    agoInterval = '0 seconds',
  ): Promise<void> {
    matchCounter += 1;
    const matchId = `tie-match-${matchCounter}`;

    await db.insertInto('users').values({ id: userId }).onConflict((oc) => oc.column('id').doNothing()).execute();
    await sql`
      insert into matches (id, kickoff_at, status) values (${matchId}, now() - interval '1 hour', 'scheduled')
    `.execute(db);
    const pick = await db
      .insertInto('picks')
      .values({ user_id: userId, match_id: matchId, type: 'result', predicted_outcome: 'home' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const settlement = await db
      .insertInto('settlements')
      .values({ match_id: matchId, event_id: `${matchId}-evt`, home_score: 1, away_score: 0 })
      .returning('id')
      .executeTakeFirstOrThrow();
    await sql`
      insert into point_awards (pick_id, settlement_id, user_id, points, created_at)
      values (${pick.id}, ${settlement.id}, ${userId}, ${points}, now() - ${agoInterval}::interval)
    `.execute(db);
    await db
      .insertInto('balances')
      .values({ user_id: userId, points: points.toString() })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet((eb) => ({ points: eb('balances.points', '+', eb.ref('excluded.points')) })),
      )
      .execute();
  }

  async function seedBareUser(db: Kysely<Database>, userId: string): Promise<void> {
    await db.insertInto('users').values({ id: userId }).execute();
  }

  it('ranks users by points descending', async () => {
    await seedUserWithPoints(testDb.db, 'u1', 30);
    await seedUserWithPoints(testDb.db, 'u2', 20);
    await seedUserWithPoints(testDb.db, 'u3', 10);

    const top = await repository().top(20);

    expect(top).toEqual([
      { userId: 'u1', points: 30, rank: 1 },
      { userId: 'u2', points: 20, rank: 2 },
      { userId: 'u3', points: 10, rank: 3 },
    ]);
  });

  it('breaks a points tie by earliest award time', async () => {
    await seedUserWithPoints(testDb.db, 'later', 20, '1 hour');
    await seedUserWithPoints(testDb.db, 'earlier', 20, '2 hours');

    const top = await repository().top(20);

    expect(top).toEqual([
      { userId: 'earlier', points: 20, rank: 1 },
      { userId: 'later', points: 20, rank: 2 },
    ]);
  });

  it('breaks a tie between two users with no award history at all by userId', async () => {
    await seedBareUser(testDb.db, 'zzz');
    await seedBareUser(testDb.db, 'aaa');

    const top = await repository().top(20);

    expect(top).toEqual([
      { userId: 'aaa', points: 0, rank: 1 },
      { userId: 'zzz', points: 0, rank: 2 },
    ]);
  });

  it('ranks a user with a real (even zero-point) award above one with none at all, at equal points', async () => {
    await seedUserWithPoints(testDb.db, 'has-played', 0);
    await seedBareUser(testDb.db, 'never-played');

    const top = await repository().top(20);

    expect(top).toEqual([
      { userId: 'has-played', points: 0, rank: 1 },
      { userId: 'never-played', points: 0, rank: 2 },
    ]);
  });

  it('limits top() to the requested count and still ranks everyone correctly via rankOf', async () => {
    for (let i = 0; i < 25; i++) {
      // zero-padded so string userId ordering matches numeric ordering for the assertion below
      await seedUserWithPoints(testDb.db, `player-${String(i).padStart(2, '0')}`, 100 - i);
    }

    const top = await repository().top(20);
    expect(top).toHaveLength(20);
    expect(top[0]).toEqual({ userId: 'player-00', points: 100, rank: 1 });
    expect(top[19]).toEqual({ userId: 'player-19', points: 81, rank: 20 });

    const outsideTop = await repository().rankOf('player-24');
    expect(outsideTop).toEqual({ userId: 'player-24', points: 76, rank: 25 });
  });

  it('returns null from rankOf for a user that does not exist', async () => {
    const result = await repository().rankOf('no-such-user');
    expect(result).toBeNull();
  });
});
