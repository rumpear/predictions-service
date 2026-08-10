import { Kysely, sql } from 'kysely';
import { Database } from '../schema';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('point_awards')
    .addColumn('id', 'bigserial', (col) => col.primaryKey())
    .addColumn('pick_id', 'bigint', (col) => col.notNull().unique().references('picks.id'))
    .addColumn('settlement_id', 'bigint', (col) => col.notNull().references('settlements.id'))
    .addColumn('user_id', 'text', (col) => col.notNull().references('users.id'))
    .addColumn('points', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('point_awards_points_nonnegative_check', sql`points >= 0`)
    .execute();

  await db.schema
    .createTable('balances')
    .addColumn('user_id', 'text', (col) => col.primaryKey().references('users.id'))
    .addColumn('points', 'bigint', (col) => col.notNull().defaultTo(0))
    .addCheckConstraint('balances_points_nonnegative_check', sql`points >= 0`)
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('balances').execute();
  await db.schema.dropTable('point_awards').execute();
}
