import { Kysely } from 'kysely';
import { createDb } from '../../src/infra/db/create-db';
import { Database } from '../../src/infra/db/schema';
import { truncateAll } from './reset-database';
import { assertLedgerInvariants } from './assert-ledger-invariants';

export interface UseTestDatabaseOptions {
  /**
   * Runs assertLedgerInvariants after every test, per TASK.md §7's shared-helper rule.
   * Defaults to true. Only the assertLedgerInvariants spec itself should disable this —
   * it deliberately leaves the ledger corrupted to prove the helper detects it.
   */
  checkInvariants?: boolean;
}

export function useTestDatabase(options: UseTestDatabaseOptions = {}): { db: Kysely<Database> } {
  const checkInvariants = options.checkInvariants ?? true;
  const ctx = {} as { db: Kysely<Database> };

  beforeAll(() => {
    const connectionString = process.env['INTEGRATION_DATABASE_URL'];
    if (!connectionString) {
      throw new Error('INTEGRATION_DATABASE_URL is not set — did the integration globalSetup run?');
    }
    ctx.db = createDb(connectionString);
  });

  afterAll(async () => {
    await ctx.db.destroy();
  });

  beforeEach(async () => {
    await truncateAll(ctx.db);
  });

  if (checkInvariants) {
    afterEach(async () => {
      await assertLedgerInvariants(ctx.db);
    });
  }

  return ctx;
}
