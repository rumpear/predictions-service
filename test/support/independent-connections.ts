import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { Database } from '../../src/infra/db/schema';

/**
 * N genuinely separate Kysely instances, each backed by its own single-connection pg Pool
 * (max: 1). Used where a test must prove operations ran over distinct database connections
 * rather than relying on a shared pool's incidental concurrency — per TASK.md §7.3.B:
 * "a Promise.all that shares one connection or a pool of size 1 proves nothing."
 */
export function createIndependentConnections(count: number, connectionString: string): Kysely<Database>[] {
  return Array.from(
    { length: count },
    () =>
      new Kysely<Database>({
        dialect: new PostgresDialect({ pool: new Pool({ connectionString, max: 1 }) }),
      }),
  );
}

export async function destroyConnections(connections: Kysely<Database>[]): Promise<void> {
  await Promise.all(connections.map((db) => db.destroy()));
}
