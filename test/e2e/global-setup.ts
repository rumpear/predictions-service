import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { startMigratedPostgres } from '../support/postgres-testcontainer';

declare global {
  // eslint-disable-next-line no-var
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

export default async function globalSetup(): Promise<void> {
  const { container, connectionString } = await startMigratedPostgres();
  process.env['DATABASE_URL'] = connectionString;
  globalThis.__PG_CONTAINER__ = container;
}
