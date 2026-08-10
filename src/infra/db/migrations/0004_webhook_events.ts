import { Kysely, sql } from 'kysely';
import { Database } from '../schema';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('webhook_events')
    .addColumn('event_id', 'text', (col) => col.primaryKey())
    .addColumn('match_id', 'text', (col) => col.notNull().references('matches.id'))
    .addColumn('raw_payload', 'jsonb', (col) => col.notNull())
    .addColumn('received_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('processed_at', 'timestamptz')
    .addColumn('outcome', 'text', (col) => col.notNull())
    .addCheckConstraint(
      'webhook_events_outcome_check',
      sql`outcome IN ('applied', 'duplicate', 'conflict')`,
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('webhook_events').execute();
}
