import { sql } from 'kysely';
import { useTestDatabase } from '../../support/integration-db';

describe('webhook_events: event_id is the primary key', () => {
  const testDb = useTestDatabase();

  beforeEach(async () => {
    await sql`insert into matches (id, kickoff_at) values ('match-1', now() - interval '1 day')`.execute(testDb.db);
  });

  it('rejects a second row with the same event_id', async () => {
    await sql`
      insert into webhook_events (event_id, match_id, raw_payload, outcome)
      values ('evt-1', 'match-1', '{}', 'applied')
    `.execute(testDb.db);

    await expect(
      sql`
        insert into webhook_events (event_id, match_id, raw_payload, outcome)
        values ('evt-1', 'match-1', '{}', 'duplicate')
      `.execute(testDb.db),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rejects an outcome outside applied/duplicate/conflict', async () => {
    await expect(
      sql`
        insert into webhook_events (event_id, match_id, raw_payload, outcome)
        values ('evt-1', 'match-1', '{}', 'nonsense')
      `.execute(testDb.db),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('allows distinct event_ids for the same match, e.g. duplicate deliveries with a different event_id', async () => {
    await sql`
      insert into webhook_events (event_id, match_id, raw_payload, outcome)
      values ('evt-1', 'match-1', '{}', 'applied')
    `.execute(testDb.db);

    await expect(
      sql`
        insert into webhook_events (event_id, match_id, raw_payload, outcome)
        values ('evt-2', 'match-1', '{}', 'duplicate')
      `.execute(testDb.db),
    ).resolves.toBeDefined();
  });
});
