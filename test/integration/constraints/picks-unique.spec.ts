import { sql } from 'kysely';
import { useTestDatabase } from '../../support/integration-db';

describe('picks: I1 — at most one pick per (user_id, match_id, type)', () => {
  const testDb = useTestDatabase();

  beforeEach(async () => {
    await sql`insert into users (id) values ('user-1')`.execute(testDb.db);
    await sql`insert into matches (id, kickoff_at) values ('match-1', now() + interval '1 day')`.execute(testDb.db);
  });

  it('rejects a second result pick for the same (user, match, type)', async () => {
    await sql`
      insert into picks (user_id, match_id, type, predicted_outcome)
      values ('user-1', 'match-1', 'result', 'home')
    `.execute(testDb.db);

    await expect(
      sql`
        insert into picks (user_id, match_id, type, predicted_outcome)
        values ('user-1', 'match-1', 'result', 'away')
      `.execute(testDb.db),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('allows one result pick and one exact pick for the same user and match', async () => {
    await sql`
      insert into picks (user_id, match_id, type, predicted_outcome)
      values ('user-1', 'match-1', 'result', 'home')
    `.execute(testDb.db);

    await expect(
      sql`
        insert into picks (user_id, match_id, type, predicted_home, predicted_away)
        values ('user-1', 'match-1', 'exact', 2, 1)
      `.execute(testDb.db),
    ).resolves.toBeDefined();
  });
});
