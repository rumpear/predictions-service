import * as path from 'path';
import { promises as fs } from 'fs';
import { FileMigrationProvider, Migrator } from 'kysely';
import { createDb } from './create-db';

export async function runMigrations(connectionString: string, direction: 'up' | 'down'): Promise<void> {
  const db = createDb(connectionString);
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  });

  const { error, results } = direction === 'up' ? await migrator.migrateToLatest() : await migrator.migrateDown();

  for (const result of results ?? []) {
    if (result.status === 'Success') {
      // eslint-disable-next-line no-console
      console.log(`migration ${direction} succeeded: ${result.migrationName}`);
    } else if (result.status === 'Error') {
      // eslint-disable-next-line no-console
      console.error(`migration ${direction} failed: ${result.migrationName}`);
    }
  }

  await db.destroy();

  if (error) {
    throw error instanceof Error ? error : new Error(JSON.stringify(error));
  }
}

async function main(): Promise<void> {
  const direction = process.argv[2];
  if (direction !== 'up' && direction !== 'down') {
    throw new Error('usage: migrate.ts <up|down>');
  }
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  await runMigrations(connectionString, direction);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  });
}
