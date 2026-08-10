import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { StartedRedisContainer } from '@testcontainers/redis';
import { startMigratedPostgres } from '../support/postgres-testcontainer';
import { startRedis } from '../support/redis-testcontainer';

declare global {
  // eslint-disable-next-line no-var
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
  // eslint-disable-next-line no-var
  var __REDIS_CONTAINER__: StartedRedisContainer | undefined;
}

export default async function globalSetup(): Promise<void> {
  const [postgres, redis] = await Promise.all([startMigratedPostgres(), startRedis()]);
  process.env['DATABASE_URL'] = postgres.connectionString;
  process.env['REDIS_URL'] = redis.connectionString;
  globalThis.__PG_CONTAINER__ = postgres.container;
  globalThis.__REDIS_CONTAINER__ = redis.container;
}
