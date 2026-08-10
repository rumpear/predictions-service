import { sql } from 'kysely';
import { useTestDatabase } from '../../support/integration-db';

describe('point_awards: I3 — every pick receives at most one award, ever', () => {
  const testDb = useTestDatabase();

  beforeEach(async () => {
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
  });

  it('rejects a second award for the same pick', async () => {
    await sql`
      insert into point_awards (pick_id, settlement_id, user_id, points)
      select p.id, s.id, 'user-1', 10
      from picks p, settlements s
      where p.user_id = 'user-1' and p.match_id = 'match-1' and s.match_id = 'match-1'
    `.execute(testDb.db);
    await sql`insert into balances (user_id, points) values ('user-1', 10)`.execute(testDb.db);

    await expect(
      sql`
        insert into point_awards (pick_id, settlement_id, user_id, points)
        select p.id, s.id, 'user-1', 10
        from picks p, settlements s
        where p.user_id = 'user-1' and p.match_id = 'match-1' and s.match_id = 'match-1'
      `.execute(testDb.db),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('allows a zero-point award row (settlement is a recorded fact even when nothing was earned)', async () => {
    await expect(
      sql`
        insert into point_awards (pick_id, settlement_id, user_id, points)
        select p.id, s.id, 'user-1', 0
        from picks p, settlements s
        where p.user_id = 'user-1' and p.match_id = 'match-1' and s.match_id = 'match-1'
      `.execute(testDb.db),
    ).resolves.toBeDefined();
    await sql`insert into balances (user_id, points) values ('user-1', 0)`.execute(testDb.db);
  });
});

describe('point_awards and balances: I5 — points columns are integer end to end', () => {
  const testDb = useTestDatabase();

  it('has no float/real/double precision/numeric column anywhere near points', async () => {
    const { rows } = await sql<{ table_name: string; column_name: string; data_type: string }>`
      select table_name, column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and column_name in ('points')
    `.execute(testDb.db);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(['integer', 'bigint', 'smallint']).toContain(row.data_type);
    }
  });
});
