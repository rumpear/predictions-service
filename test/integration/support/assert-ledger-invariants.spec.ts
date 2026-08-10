import { sql } from 'kysely';
import { useTestDatabase } from '../../support/integration-db';
import { assertLedgerInvariants } from '../../support/assert-ledger-invariants';

describe('assertLedgerInvariants', () => {
  const testDb = useTestDatabase();

  it('passes on an empty database', async () => {
    await expect(assertLedgerInvariants(testDb.db)).resolves.toBeUndefined();
  });

  it('passes when balances reconcile exactly against point_awards (I4)', async () => {
    await sql`insert into users (id) values ('user-1')`.execute(testDb.db);
    await sql`insert into matches (id, kickoff_at) values ('match-1', now() - interval '1 day')`.execute(testDb.db);
    await sql`
      insert into picks (user_id, match_id, type, predicted_outcome)
      values ('user-1', 'match-1', 'result', 'home')
    `.execute(testDb.db);
    await sql`
      insert into settlements (match_id, event_id, home_score, away_score)
      values ('match-1', 'evt-1', 2, 1)
    `.execute(testDb.db);
    await sql`
      insert into point_awards (pick_id, settlement_id, user_id, points)
      select p.id, s.id, 'user-1', 10
      from picks p, settlements s
      where p.match_id = 'match-1' and s.match_id = 'match-1'
    `.execute(testDb.db);
    await sql`insert into balances (user_id, points) values ('user-1', 10)`.execute(testDb.db);

    await expect(assertLedgerInvariants(testDb.db)).resolves.toBeUndefined();
  });

  it('fails I4 when a balance does not reconcile against its point_awards', async () => {
    await sql`insert into users (id) values ('user-1')`.execute(testDb.db);
    await sql`insert into balances (user_id, points) values ('user-1', 999)`.execute(testDb.db);

    await expect(assertLedgerInvariants(testDb.db)).rejects.toThrow();
  });

  it('fails I4 when point_awards exist for a user with no balances row', async () => {
    await sql`insert into users (id) values ('user-1')`.execute(testDb.db);
    await sql`insert into matches (id, kickoff_at) values ('match-1', now() - interval '1 day')`.execute(testDb.db);
    await sql`
      insert into picks (user_id, match_id, type, predicted_outcome)
      values ('user-1', 'match-1', 'result', 'home')
    `.execute(testDb.db);
    await sql`
      insert into settlements (match_id, event_id, home_score, away_score)
      values ('match-1', 'evt-1', 2, 1)
    `.execute(testDb.db);
    await sql`
      insert into point_awards (pick_id, settlement_id, user_id, points)
      select p.id, s.id, 'user-1', 10
      from picks p, settlements s
      where p.match_id = 'match-1' and s.match_id = 'match-1'
    `.execute(testDb.db);
    // deliberately no balances row for user-1

    await expect(assertLedgerInvariants(testDb.db)).rejects.toThrow();
  });
});
