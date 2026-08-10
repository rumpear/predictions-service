import { Kysely, sql } from 'kysely';
import { Database } from '../schema';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('matches')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('kickoff_at', 'timestamptz', (col) => col.notNull())
    .addColumn('home_score', 'integer')
    .addColumn('away_score', 'integer')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('scheduled'))
    .addColumn('settled_at', 'timestamptz')
    .addCheckConstraint('matches_status_check', sql`status IN ('scheduled', 'finished')`)
    .execute();

  await db.schema
    .createTable('picks')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) => col.notNull().references('users.id'))
    .addColumn('match_id', 'text', (col) => col.notNull().references('matches.id'))
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('predicted_outcome', 'text')
    .addColumn('predicted_home', 'integer')
    .addColumn('predicted_away', 'integer')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('picks_user_match_type_unique', ['user_id', 'match_id', 'type'])
    .addCheckConstraint('picks_type_check', sql`type IN ('result', 'exact')`)
    .addCheckConstraint(
      'picks_predicted_outcome_check',
      sql`predicted_outcome IS NULL OR predicted_outcome IN ('home', 'away', 'draw')`,
    )
    .addCheckConstraint(
      'picks_predicted_scores_nonnegative_check',
      sql`(predicted_home IS NULL OR predicted_home >= 0) AND (predicted_away IS NULL OR predicted_away >= 0)`,
    )
    .addCheckConstraint(
      'picks_type_shape_check',
      sql`
        (type = 'result' AND predicted_outcome IS NOT NULL AND predicted_home IS NULL AND predicted_away IS NULL)
        OR
        (type = 'exact' AND predicted_outcome IS NULL AND predicted_home IS NOT NULL AND predicted_away IS NOT NULL)
      `,
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('picks').execute();
  await db.schema.dropTable('matches').execute();
  await db.schema.dropTable('users').execute();
}
