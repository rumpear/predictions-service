import { Kysely } from 'kysely';
import { createDb } from '../../src/infra/db/create-db';
import { Database } from '../../src/infra/db/schema';
import { truncateAll } from './reset-database';

export function useTestDatabase(): { db: Kysely<Database> } {
  const ctx = {} as { db: Kysely<Database> };

  beforeAll(() => {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set — did the integration globalSetup run?');
    }
    ctx.db = createDb(connectionString);
  });

  afterAll(async () => {
    await ctx.db.destroy();
  });

  beforeEach(async () => {
    await truncateAll(ctx.db);
  });

  return ctx;
}
