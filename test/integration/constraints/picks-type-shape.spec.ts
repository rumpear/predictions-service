import { sql } from 'kysely';
import { useTestDatabase } from '../../support/integration-db';

describe('picks: CHECK ties populated columns to type', () => {
  const testDb = useTestDatabase();

  beforeEach(async () => {
    await sql`insert into users (id) values ('user-1')`.execute(testDb.db);
    await sql`insert into matches (id, kickoff_at) values ('match-1', now() + interval '1 day')`.execute(testDb.db);
  });

  it('rejects a result pick that also carries an exact score', async () => {
    await expect(
      sql`
        insert into picks (user_id, match_id, type, predicted_outcome, predicted_home, predicted_away)
        values ('user-1', 'match-1', 'result', 'home', 2, 1)
      `.execute(testDb.db),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects an exact pick with no score', async () => {
    await expect(
      sql`
        insert into picks (user_id, match_id, type)
        values ('user-1', 'match-1', 'exact')
      `.execute(testDb.db),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects a pick with an invalid type', async () => {
    await expect(
      sql`
        insert into picks (user_id, match_id, type, predicted_outcome)
        values ('user-1', 'match-1', 'nonsense', 'home')
      `.execute(testDb.db),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects a negative predicted score', async () => {
    await expect(
      sql`
        insert into picks (user_id, match_id, type, predicted_home, predicted_away)
        values ('user-1', 'match-1', 'exact', -1, 2)
      `.execute(testDb.db),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects an unrecognised predicted_outcome value', async () => {
    await expect(
      sql`
        insert into picks (user_id, match_id, type, predicted_outcome)
        values ('user-1', 'match-1', 'result', 'sideways')
      `.execute(testDb.db),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
