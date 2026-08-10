import type { Server } from 'http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Kysely, sql } from 'kysely';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { KYSELY } from '../../src/infra/db/database.module';
import { Database } from '../../src/infra/db/schema';
import { assertLedgerInvariants } from '../support/assert-ledger-invariants';
import { truncateAll } from '../support/reset-database';

// Complements test/integration/settlement/scenario-b-concurrent-settlement.spec.ts, which
// carries the full rigor (20 iterations, provably distinct connections, constraints-only
// variant). This is the full-stack version: real concurrent HTTP requests through the
// actual endpoint, proving the controller/app layers don't introduce their own race —
// fewer iterations since the hard correctness proof already lives in the repository test.
describe('Scenario B: concurrent settlement via real HTTP requests (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let db: Kysely<Database>;

  const CONCURRENCY = 10;
  const ITERATIONS = 5;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    server = app.getHttpServer() as Server;
    db = app.get(KYSELY);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  afterEach(async () => {
    await assertLedgerInvariants(db);
  });

  it(`fires ${CONCURRENCY} identical webhook HTTP requests in parallel with a start barrier, ${ITERATIONS} iterations, no request 5xx`, async () => {
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const matchId = `http-scenario-b-${iteration}`;
      await sql`
        insert into matches (id, kickoff_at, status) values (${matchId}, now() - interval '1 hour', 'scheduled')
      `.execute(db);
      await sql`insert into users (id) values (${`${matchId}-u1`})`.execute(db);
      await sql`
        insert into picks (user_id, match_id, type, predicted_outcome)
        values (${`${matchId}-u1`}, ${matchId}, 'result', 'home')
      `.execute(db);

      let releaseBarrier: () => void = () => undefined;
      const barrier = new Promise<void>((resolve) => {
        releaseBarrier = resolve;
      });

      const attempts = Array.from({ length: CONCURRENCY }, () =>
        barrier.then(() =>
          request(server)
            .post('/webhooks/match-finished')
            .send({ matchId, eventId: 'evt-1', homeScore: 2, awayScore: 1 }),
        ),
      );

      releaseBarrier();
      const responses = await Promise.all(attempts);

      for (const response of responses) {
        expect(response.status).toBeLessThan(500);
        expect(response.status).toBe(200);
      }

      const settlementCount = await db
        .selectFrom('settlements')
        .select(db.fn.countAll().as('n'))
        .where('match_id', '=', matchId)
        .executeTakeFirstOrThrow();
      expect(Number(settlementCount.n)).toBe(1);

      const balance = await db
        .selectFrom('balances')
        .select('points')
        .where('user_id', '=', `${matchId}-u1`)
        .executeTakeFirstOrThrow();
      expect(Number(balance.points)).toBe(10);
    }
  });
});
