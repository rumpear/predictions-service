import { sql } from 'kysely';
import { useTestDatabase } from '../../support/integration-db';

// TASK.md §8 Definition of Done: "No float/numeric/double anywhere near points; verified
// by a test that inspects information_schema.columns." Scoped to the whole schema, not
// just columns literally named "points" (which assertLedgerInvariants already checks on
// every integration/e2e test run) — this is the standalone, explicit guard the DoD asks
// for, and it's stronger: nothing in this schema has a legitimate reason to be
// floating-point, so a blanket ban is the correct bar, not just a targeted one.
const FORBIDDEN_TYPES = ['real', 'double precision', 'numeric', 'decimal'];

describe('schema: no floating-point column anywhere', () => {
  const testDb = useTestDatabase();

  it('has no real/double precision/numeric/decimal column in the public schema', async () => {
    const { rows } = await sql<{ table_name: string; column_name: string; data_type: string }>`
      select table_name, column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
    `.execute(testDb.db);

    expect(rows.length).toBeGreaterThan(0);

    const offenders = rows.filter((row) => FORBIDDEN_TYPES.includes(row.data_type));
    expect(offenders).toEqual([]);
  });
});
