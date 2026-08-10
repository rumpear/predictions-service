import { Kysely, sql } from 'kysely';

export async function truncateAll<DB>(db: Kysely<DB>): Promise<void> {
  const { rows } = await sql<{ tablename: string }>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('kysely_migration', 'kysely_migration_lock')
  `.execute(db);

  if (rows.length === 0) {
    return;
  }

  const tableList = rows.map((row) => `"${row.tablename}"`).join(', ');
  await sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`).execute(db);
}
