import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { StartedRedisContainer } from '@testcontainers/redis';
import { startMigratedPostgres } from '../support/postgres-testcontainer';
import { startRedis } from '../support/redis-testcontainer';

declare global {
  // eslint-disable-next-line no-var
  var __INTEGRATION_PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
  // eslint-disable-next-line no-var
  var __INTEGRATION_REDIS_CONTAINER__: StartedRedisContainer | undefined;
}

// Deliberately distinct names from test/e2e/global-setup.ts (INTEGRATION_DATABASE_URL, not
// DATABASE_URL; __INTEGRATION_PG_CONTAINER__, not __PG_CONTAINER__). globalSetup for every
// Jest project runs in the same main process before any project's tests start, so both
// projects' setups were previously last-write-wins on the *same* process.env keys and the
// *same* globalThis keys — whichever project's setup ran second silently won, and which
// container/connection a given test file actually talked to depended on Jest's scheduling
// order. That caused a real, intermittent cross-project leak (a corrupted-ledger fixture
// from an integration test showing up under an e2e test's invariant check). Distinct names
// per project removes the collision outright instead of relying on scheduling luck.
export default async function globalSetup(): Promise<void> {
  const [postgres, redis] = await Promise.all([startMigratedPostgres(), startRedis()]);
  process.env['INTEGRATION_DATABASE_URL'] = postgres.connectionString;
  process.env['INTEGRATION_REDIS_URL'] = redis.connectionString;
  globalThis.__INTEGRATION_PG_CONTAINER__ = postgres.container;
  globalThis.__INTEGRATION_REDIS_CONTAINER__ = redis.container;
}
