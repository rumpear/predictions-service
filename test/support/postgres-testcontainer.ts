import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { runMigrations } from '../../src/infra/db/migrate';

export async function startMigratedPostgres(): Promise<{
  container: StartedPostgreSqlContainer;
  connectionString: string;
}> {
  const container = await new PostgreSqlContainer('postgres:16').start();
  const connectionString = container.getConnectionUri();
  await runMigrations(connectionString, 'up');
  return { container, connectionString };
}
