import { sql } from 'kysely';
import { useTestDatabase } from '../../support/integration-db';
import { KyselyPicksRepository } from '../../../src/infra/db/picks-repository';

describe('KyselyPicksRepository.insertPickIfAllowed', () => {
  const testDb = useTestDatabase();

  function repository(): KyselyPicksRepository {
    return new KyselyPicksRepository(testDb.db);
  }

  beforeEach(async () => {
    await sql`insert into matches (id, kickoff_at, status) values ('future-match', now() + interval '1 day', 'scheduled')`.execute(
      testDb.db,
    );
    await sql`insert into matches (id, kickoff_at, status) values ('past-match', now() - interval '1 day', 'scheduled')`.execute(
      testDb.db,
    );
    await sql`insert into matches (id, kickoff_at, status) values ('finished-match', now() - interval '2 day', 'finished')`.execute(
      testDb.db,
    );
  });

  it('creates a result pick for an eligible match and auto-creates the user', async () => {
    const result = await repository().insertPickIfAllowed({
      userId: 'brand-new-user',
      matchId: 'future-match',
      pick: { type: 'result', predictedOutcome: 'home' },
    });

    expect(result.kind).toBe('created');

    const user = await testDb.db
      .selectFrom('users')
      .select('id')
      .where('id', '=', 'brand-new-user')
      .executeTakeFirst();
    expect(user).toBeDefined();

    const pick = await testDb.db
      .selectFrom('picks')
      .select(['user_id', 'match_id', 'type', 'predicted_outcome', 'predicted_home', 'predicted_away'])
      .where('user_id', '=', 'brand-new-user')
      .where('match_id', '=', 'future-match')
      .executeTakeFirst();
    expect(pick).toEqual({
      user_id: 'brand-new-user',
      match_id: 'future-match',
      type: 'result',
      predicted_outcome: 'home',
      predicted_home: null,
      predicted_away: null,
    });
  });

  it('creates an exact pick with predicted_home/predicted_away persisted', async () => {
    const result = await repository().insertPickIfAllowed({
      userId: 'user-exact',
      matchId: 'future-match',
      pick: { type: 'exact', predictedHome: 5, predictedAway: 3 },
    });

    expect(result.kind).toBe('created');

    const pick = await testDb.db
      .selectFrom('picks')
      .select(['type', 'predicted_outcome', 'predicted_home', 'predicted_away'])
      .where('user_id', '=', 'user-exact')
      .where('match_id', '=', 'future-match')
      .executeTakeFirst();
    expect(pick).toEqual({
      type: 'exact',
      predicted_outcome: null,
      predicted_home: 5,
      predicted_away: 3,
    });
  });

  it('rejects an unknown match and writes no row', async () => {
    const result = await repository().insertPickIfAllowed({
      userId: 'user-1',
      matchId: 'no-such-match',
      pick: { type: 'result', predictedOutcome: 'home' },
    });

    expect(result.kind).toBe('rejected_unknown_match');

    const count = await testDb.db
      .selectFrom('picks')
      .select(testDb.db.fn.countAll().as('n'))
      .where('user_id', '=', 'user-1')
      .executeTakeFirstOrThrow();
    expect(count.n).toBe('0');
  });

  it('rejects a pick after kickoff has passed and writes no row', async () => {
    const result = await repository().insertPickIfAllowed({
      userId: 'user-1',
      matchId: 'past-match',
      pick: { type: 'result', predictedOutcome: 'home' },
    });

    expect(result.kind).toBe('rejected_not_open');

    const count = await testDb.db
      .selectFrom('picks')
      .select(testDb.db.fn.countAll().as('n'))
      .where('user_id', '=', 'user-1')
      .executeTakeFirstOrThrow();
    expect(count.n).toBe('0');
  });

  it('rejects a pick on an already-finished match and writes no row', async () => {
    const result = await repository().insertPickIfAllowed({
      userId: 'user-1',
      matchId: 'finished-match',
      pick: { type: 'result', predictedOutcome: 'home' },
    });

    expect(result.kind).toBe('rejected_not_open');

    const count = await testDb.db
      .selectFrom('picks')
      .select(testDb.db.fn.countAll().as('n'))
      .where('user_id', '=', 'user-1')
      .executeTakeFirstOrThrow();
    expect(count.n).toBe('0');
  });

  it('rejects a duplicate (user, match, type) and leaves the original untouched', async () => {
    const first = await repository().insertPickIfAllowed({
      userId: 'user-1',
      matchId: 'future-match',
      pick: { type: 'result', predictedOutcome: 'home' },
    });
    expect(first.kind).toBe('created');

    const second = await repository().insertPickIfAllowed({
      userId: 'user-1',
      matchId: 'future-match',
      pick: { type: 'result', predictedOutcome: 'away' },
    });
    expect(second.kind).toBe('rejected_duplicate');

    const stored = await testDb.db
      .selectFrom('picks')
      .select('predicted_outcome')
      .where('user_id', '=', 'user-1')
      .where('match_id', '=', 'future-match')
      .executeTakeFirstOrThrow();
    expect(stored.predicted_outcome).toBe('home');
  });

  it('allows one result pick and one exact pick for the same user and match', async () => {
    const resultPick = await repository().insertPickIfAllowed({
      userId: 'user-1',
      matchId: 'future-match',
      pick: { type: 'result', predictedOutcome: 'home' },
    });
    const exactPick = await repository().insertPickIfAllowed({
      userId: 'user-1',
      matchId: 'future-match',
      pick: { type: 'exact', predictedHome: 2, predictedAway: 1 },
    });

    expect(resultPick.kind).toBe('created');
    expect(exactPick.kind).toBe('created');
  });
});
