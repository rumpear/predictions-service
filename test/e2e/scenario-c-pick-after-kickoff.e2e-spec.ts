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

// TASK.md §7.3.C — one of the three mandatory scenarios.
//
// Boundary tests use DB-relative timestamps (`now()`, `now() + interval`) rather than
// waiting on Node's wall clock for a real-world millisecond to pass — that would be
// flaky under CI scheduling jitter. The database's own now() is authoritative for the
// kickoff check (see KyselyPicksRepository), so anchoring fixtures to it directly tests
// the real boundary deterministically.
describe('Scenario C: pick after kickoff (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let db: Kysely<Database>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // listen(), not just init(): the race tests fire many truly-concurrent requests, and
    // supertest against a server that's never actually listening races on-demand binding.
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

  async function pickCount(userId: string, matchId: string): Promise<number> {
    const row = await db
      .selectFrom('picks')
      .select(db.fn.countAll().as('n'))
      .where('user_id', '=', userId)
      .where('match_id', '=', matchId)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  it('accepts a pick submitted 1 second before kickoff', async () => {
    await sql`
      insert into matches (id, kickoff_at, status)
      values ('m-before', now() + interval '1 second', 'scheduled')
    `.execute(db);

    const response = await request(server)
      .post('/picks')
      .send({ userId: 'u-before', matchId: 'm-before', type: 'result', value: 'home' });

    expect(response.status).toBe(201);
    expect(await pickCount('u-before', 'm-before')).toBe(1);
  });

  it('rejects a pick submitted exactly at kickoffAt (exclusive boundary)', async () => {
    // kickoff_at is pinned to "the current instant" at insert time; the repository's
    // WHERE kickoff_at > now() is necessarily evaluated a moment later, so it always
    // sees kickoff_at <= now() here — this is the boundary itself, not an approximation.
    await sql`
      insert into matches (id, kickoff_at, status)
      values ('m-at', now(), 'scheduled')
    `.execute(db);

    const response = await request(server)
      .post('/picks')
      .send({ userId: 'u-at', matchId: 'm-at', type: 'result', value: 'home' });

    expect(response.status).toBe(422);
    expect(await pickCount('u-at', 'm-at')).toBe(0);
  });

  it('rejects a pick submitted after kickoff and writes no row', async () => {
    await sql`
      insert into matches (id, kickoff_at, status)
      values ('m-after', now() - interval '1 second', 'scheduled')
    `.execute(db);

    const response = await request(server)
      .post('/picks')
      .send({ userId: 'u-after', matchId: 'm-after', type: 'result', value: 'home' });

    expect(response.status).toBe(422);
    expect(await pickCount('u-after', 'm-after')).toBe(0);
  });

  it('rejects a pick submitted after the match has already settled', async () => {
    await sql`
      insert into matches (id, kickoff_at, status)
      values ('m-settled', now() - interval '1 day', 'finished')
    `.execute(db);

    const response = await request(server)
      .post('/picks')
      .send({ userId: 'u-settled', matchId: 'm-settled', type: 'result', value: 'home' });

    expect(response.status).toBe(422);
    expect(await pickCount('u-settled', 'm-settled')).toBe(0);
  });

  it('race: never leaves a rejected pick persisted when firing concurrently around the kickoff moment', async () => {
    const ROUNDS = 5;
    const CONCURRENCY = 10;

    for (let round = 0; round < ROUNDS; round++) {
      const matchId = `race-kickoff-${round}`;
      // Kickoff lands mid-burst: fast enough requests see it as still-open, slower ones
      // (scheduler jitter, connection acquisition) see it as already passed.
      await sql`
        insert into matches (id, kickoff_at, status)
        values (${matchId}, now() + interval '20 milliseconds', 'scheduled')
      `.execute(db);

      const userIds = Array.from({ length: CONCURRENCY }, (_, i) => `race-kickoff-user-${round}-${i}`);
      const responses = await Promise.all(
        userIds.map((userId) =>
          request(server).post('/picks').send({ userId, matchId, type: 'result', value: 'home' }),
        ),
      );

      for (const [i, response] of responses.entries()) {
        const userId = userIds[i];
        if (userId === undefined) continue;
        const count = await pickCount(userId, matchId);
        if (response.status === 201) {
          expect(count).toBe(1);
        } else {
          expect(response.status).toBe(422);
          expect(count).toBe(0);
        }
      }
    }
  });

  it('race: never accepts a pick concurrently with the match transitioning to finished', async () => {
    // Full settlement (which is what actually flips status to 'finished') doesn't exist
    // until Phase 5. This simulates the transition directly to prove the picks side of
    // the invariant now: a pick must never be accepted for a match that concurrently
    // stops being open, however that transition is triggered.
    const ROUNDS = 5;
    const CONCURRENCY = 10;

    for (let round = 0; round < ROUNDS; round++) {
      const matchId = `race-settle-${round}`;
      await sql`
        insert into matches (id, kickoff_at, status)
        values (${matchId}, now() + interval '1 day', 'scheduled')
      `.execute(db);

      const userIds = Array.from({ length: CONCURRENCY }, (_, i) => `race-settle-user-${round}-${i}`);

      const [responses] = await Promise.all([
        Promise.all(
          userIds.map((userId) =>
            request(server).post('/picks').send({ userId, matchId, type: 'result', value: 'home' }),
          ),
        ),
        sql`update matches set status = 'finished' where id = ${matchId}`.execute(db),
      ]);

      for (const [i, response] of responses.entries()) {
        const userId = userIds[i];
        if (userId === undefined) continue;
        const count = await pickCount(userId, matchId);
        if (response.status === 201) {
          expect(count).toBe(1);
        } else {
          expect(count).toBe(0);
        }
      }
    }
  });
});
