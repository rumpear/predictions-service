import { sql } from 'kysely';
import { useTestDatabase } from '../../support/integration-db';
import { createIndependentConnections, destroyConnections } from '../../support/independent-connections';
import { KyselySettlementRepository } from '../../../src/infra/db/settlement-repository';
import { SettlementOptions } from '../../../src/app/settlement/settlement-repository.port';

// TASK.md §7.3.B — one of the three mandatory scenarios. Tested at the repository layer
// (not through HTTP) specifically so "≥10 distinct database connections" is provable, not
// assumed: each of the CONCURRENCY attempts below runs on its own single-connection Kysely
// instance (test/support/independent-connections.ts), not a shared pool.
describe('Scenario B: concurrent settlement of one match', () => {
  const testDb = useTestDatabase();

  const CONCURRENCY = 10;
  const ITERATIONS = 20;

  function connectionString(): string {
    const value = process.env['DATABASE_URL'];
    if (!value) {
      throw new Error('DATABASE_URL is not set — did the integration globalSetup run?');
    }
    return value;
  }

  async function seedMatchWithPicks(matchId: string, pickCount: number): Promise<void> {
    await sql`
      insert into matches (id, kickoff_at, status) values (${matchId}, now() - interval '1 hour', 'scheduled')
    `.execute(testDb.db);
    for (let i = 0; i < pickCount; i++) {
      const userId = `${matchId}-user-${i}`;
      await sql`insert into users (id) values (${userId})`.execute(testDb.db);
      await sql`
        insert into picks (user_id, match_id, type, predicted_outcome)
        values (${userId}, ${matchId}, 'result', 'home')
      `.execute(testDb.db);
    }
  }

  async function assertSettledExactlyOnce(matchId: string, pickCount: number): Promise<void> {
    const settlementCount = await testDb.db
      .selectFrom('settlements')
      .select(testDb.db.fn.countAll().as('n'))
      .where('match_id', '=', matchId)
      .executeTakeFirstOrThrow();
    expect(Number(settlementCount.n)).toBe(1);

    const awardCount = await testDb.db
      .selectFrom('point_awards')
      .innerJoin('picks', 'picks.id', 'point_awards.pick_id')
      .select(testDb.db.fn.countAll().as('n'))
      .where('picks.match_id', '=', matchId)
      .executeTakeFirstOrThrow();
    expect(Number(awardCount.n)).toBe(pickCount);

    const userIds = Array.from({ length: pickCount }, (_, i) => `${matchId}-user-${i}`);
    for (const userId of userIds) {
      const balance = await testDb.db
        .selectFrom('balances')
        .select('points')
        .where('user_id', '=', userId)
        .executeTakeFirst();
      const awarded = await testDb.db
        .selectFrom('point_awards')
        .select((eb) => eb.fn.sum('points').as('total'))
        .where('user_id', '=', userId)
        .executeTakeFirstOrThrow();
      expect(Number(balance?.points ?? 0)).toBe(Number(awarded.total ?? 0));
    }
  }

  async function fireConcurrently(
    matchId: string,
    options?: SettlementOptions,
  ): Promise<Array<'applied' | 'duplicate' | 'conflict' | 'unknown_match'>> {
    const connections = createIndependentConnections(CONCURRENCY, connectionString());
    try {
      let releaseBarrier: () => void = () => undefined;
      const barrier = new Promise<void>((resolve) => {
        releaseBarrier = resolve;
      });

      // All CONCURRENCY attempts are constructed and awaiting the same barrier before any
      // of them fires, to maximise overlap once released.
      const attempts = connections.map((conn) => {
        const repo = new KyselySettlementRepository(conn);
        return barrier.then(() =>
          repo.settleMatch({ matchId, eventId: 'evt-1', homeScore: 2, awayScore: 1, rawPayload: {} }, options),
        );
      });

      releaseBarrier();
      const results = await Promise.all(attempts);
      return results.map((r) => r.kind);
    } finally {
      await destroyConnections(connections);
    }
  }

  it(`fires ${CONCURRENCY} identical settlements truly in parallel over ${CONCURRENCY} distinct connections, ${ITERATIONS} iterations (lock + fast path enabled)`, async () => {
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const matchId = `scenario-b-${iteration}`;
      await seedMatchWithPicks(matchId, 3);

      const outcomes = await fireConcurrently(matchId);

      // "no request returned 5xx": every attempt resolved to a recognised outcome — none
      // threw an unexpected error out of settleMatch.
      for (const outcome of outcomes) {
        expect(['applied', 'duplicate', 'conflict']).toContain(outcome);
      }
      expect(outcomes.filter((o) => o === 'applied')).toHaveLength(1);

      await assertSettledExactlyOnce(matchId, 3);
    }
  });

  it(`same assertions hold with the lock and fast path both disabled, ${ITERATIONS} iterations — proves constraints, not locks, carry correctness`, async () => {
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const matchId = `scenario-b-nolayers-${iteration}`;
      await seedMatchWithPicks(matchId, 3);

      const outcomes = await fireConcurrently(matchId, { skipFastPath: true, skipLock: true });

      for (const outcome of outcomes) {
        expect(['applied', 'duplicate', 'conflict']).toContain(outcome);
      }
      expect(outcomes.filter((o) => o === 'applied')).toHaveLength(1);

      await assertSettledExactlyOnce(matchId, 3);
    }
  });
});
