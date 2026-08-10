import { Kysely, sql } from 'kysely';
import { Database } from '../../src/infra/db/schema';

const POINTS_COLUMN_TYPES = ['integer', 'bigint', 'smallint'];

interface BalanceReconciliationRow {
  user_id: string;
  balance_points: string;
  awarded_points: string;
}

interface DuplicateRow {
  key: string;
  count: string;
}

interface PointsColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
}

async function assertI4BalancesReconcile(db: Kysely<Database>): Promise<void> {
  const { rows } = await sql<BalanceReconciliationRow>`
    select
      coalesce(b.user_id, a.user_id) as user_id,
      coalesce(b.points, 0)::bigint as balance_points,
      coalesce(a.total, 0)::bigint as awarded_points
    from balances b
    full outer join (
      select user_id, sum(points) as total from point_awards group by user_id
    ) a on a.user_id = b.user_id
  `.execute(db);

  for (const row of rows) {
    if (row.balance_points !== row.awarded_points) {
      throw new Error(
        `I4 violated for user "${row.user_id}": balances.points=${row.balance_points} but ` +
          `SUM(point_awards.points)=${row.awarded_points}`,
      );
    }
  }
}

async function assertI3NoPickAwardedTwice(db: Kysely<Database>): Promise<void> {
  const { rows } = await sql<DuplicateRow>`
    select pick_id::text as key, count(*)::text as count
    from point_awards
    group by pick_id
    having count(*) > 1
  `.execute(db);

  if (rows.length > 0) {
    throw new Error(`I3 violated: pick_id(s) awarded more than once: ${rows.map((r) => r.key).join(', ')}`);
  }
}

async function assertI6MatchSettledAtMostOnce(db: Kysely<Database>): Promise<void> {
  const { rows } = await sql<DuplicateRow>`
    select match_id as key, count(*)::text as count
    from settlements
    group by match_id
    having count(*) > 1
  `.execute(db);

  if (rows.length > 0) {
    throw new Error(`I6 violated: match_id(s) settled more than once: ${rows.map((r) => r.key).join(', ')}`);
  }
}

async function assertI5PointsColumnsAreIntegers(db: Kysely<Database>): Promise<void> {
  const { rows } = await sql<PointsColumnRow>`
    select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and column_name = 'points'
  `.execute(db);

  for (const row of rows) {
    if (!POINTS_COLUMN_TYPES.includes(row.data_type)) {
      throw new Error(
        `I5 violated: ${row.table_name}.${row.column_name} has non-integer type "${row.data_type}"`,
      );
    }
  }
}

export async function assertLedgerInvariants(db: Kysely<Database>): Promise<void> {
  await assertI4BalancesReconcile(db);
  await assertI3NoPickAwardedTwice(db);
  await assertI6MatchSettledAtMostOnce(db);
  await assertI5PointsColumnsAreIntegers(db);
}
