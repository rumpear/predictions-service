import { sql } from 'kysely';
import { useTestDatabase } from '../../support/integration-db';

describe('settlements: I6 — a match settles at most once', () => {
  const testDb = useTestDatabase();

  beforeEach(async () => {
    await sql`insert into matches (id, kickoff_at) values ('match-1', now() - interval '1 day')`.execute(testDb.db);
  });

  it('rejects a second settlement row for the same match', async () => {
    await sql`
      insert into settlements (match_id, event_id, home_score, away_score)
      values ('match-1', 'evt-1', 2, 1)
    `.execute(testDb.db);

    await expect(
      sql`
        insert into settlements (match_id, event_id, home_score, away_score)
        values ('match-1', 'evt-2', 3, 3)
      `.execute(testDb.db),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('allows settlements for two different matches', async () => {
    await sql`insert into matches (id, kickoff_at) values ('match-2', now() - interval '1 day')`.execute(testDb.db);
    await sql`
      insert into settlements (match_id, event_id, home_score, away_score)
      values ('match-1', 'evt-1', 2, 1)
    `.execute(testDb.db);

    await expect(
      sql`
        insert into settlements (match_id, event_id, home_score, away_score)
        values ('match-2', 'evt-2', 0, 0)
      `.execute(testDb.db),
    ).resolves.toBeDefined();
  });

  it('rejects a settlement for a match that does not exist', async () => {
    await expect(
      sql`
        insert into settlements (match_id, event_id, home_score, away_score)
        values ('no-such-match', 'evt-1', 1, 0)
      `.execute(testDb.db),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
