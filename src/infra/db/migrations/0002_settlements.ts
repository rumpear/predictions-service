import { Kysely, sql } from 'kysely';
import { Database } from '../schema';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('settlements')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('match_id', 'text', (col) => col.notNull().unique().references('matches.id'))
    .addColumn('event_id', 'text', (col) => col.notNull())
    .addColumn('home_score', 'integer', (col) => col.notNull())
    .addColumn('away_score', 'integer', (col) => col.notNull())
    .addColumn('settled_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      'settlements_scores_nonnegative_check',
      sql`home_score >= 0 AND away_score >= 0`,
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('settlements').execute();
}
