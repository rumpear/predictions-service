import type { Server } from 'http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Kysely, sql } from 'kysely';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { KYSELY } from '../../src/infra/db/database.module';
import { Database } from '../../src/infra/db/schema';
import { assertLedgerInvariants } from '../support/assert-ledger-invariants';
import { truncateAll } from '../support/reset-database';

describe('POST /webhooks/match-finished (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let db: Kysely<Database>;
  let redis: Redis;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    server = app.getHttpServer() as Server;
    db = app.get(KYSELY);

    const redisUrl = process.env['REDIS_URL'];
    if (!redisUrl) {
      throw new Error('REDIS_URL is not set — did the e2e globalSetup run?');
    }
    redis = new Redis(redisUrl);
  });

  afterAll(async () => {
    await app.close();
    await redis.quit();
  });

  beforeEach(async () => {
    await truncateAll(db);
    await redis.flushall();
    await sql`
      insert into matches (id, kickoff_at, status)
      values ('match-1', now() - interval '1 hour', 'scheduled')
    `.execute(db);
  });

  afterEach(async () => {
    await assertLedgerInvariants(db);
  });

  it('returns 200 for a valid webhook', async () => {
    const response = await request(server)
      .post('/webhooks/match-finished')
      .send({ matchId: 'match-1', eventId: 'evt-1', homeScore: 2, awayScore: 1 });

    expect(response.status).toBe(200);
  });

  it('returns 200 for a duplicate delivery', async () => {
    await request(server)
      .post('/webhooks/match-finished')
      .send({ matchId: 'match-1', eventId: 'evt-1', homeScore: 2, awayScore: 1 });

    const response = await request(server)
      .post('/webhooks/match-finished')
      .send({ matchId: 'match-1', eventId: 'evt-2', homeScore: 2, awayScore: 1 });

    expect(response.status).toBe(200);
  });

  it('returns 200 for a conflicting delivery (first-write-wins, not an error)', async () => {
    await request(server)
      .post('/webhooks/match-finished')
      .send({ matchId: 'match-1', eventId: 'evt-1', homeScore: 2, awayScore: 1 });

    const response = await request(server)
      .post('/webhooks/match-finished')
      .send({ matchId: 'match-1', eventId: 'evt-2', homeScore: 0, awayScore: 0 });

    expect(response.status).toBe(200);
  });

  it('returns 400 for an invalid payload', async () => {
    const response = await request(server)
      .post('/webhooks/match-finished')
      .send({ matchId: 'match-1', eventId: 'evt-1', homeScore: -1, awayScore: 0 });

    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown match', async () => {
    const response = await request(server)
      .post('/webhooks/match-finished')
      .send({ matchId: 'no-such-match', eventId: 'evt-1', homeScore: 1, awayScore: 0 });

    expect(response.status).toBe(404);
  });

  it('updates the Redis leaderboard mirror after commit, via the increment path specifically', async () => {
    // Direct SQL, not POST /picks: match-1's kickoff_at is in the past (this file's other
    // tests need an already-startable match to settle), which the real endpoint would
    // correctly reject. This test is about the settlement's Redis side effect, not the
    // kickoff gate — already covered in Scenario C.
    await sql`insert into users (id) values ('subject-user')`.execute(db);
    await sql`
      insert into picks (user_id, match_id, type, predicted_outcome)
      values ('subject-user', 'match-1', 'result', 'home')
    `.execute(db);

    const response = await request(server)
      .post('/webhooks/match-finished')
      .send({ matchId: 'match-1', eventId: 'evt-1', homeScore: 2, awayScore: 1 });
    expect(response.status).toBe(200);

    // Direct Redis read — never via GET /leaderboard, whose ensureWarm() would rebuild
    // from Postgres and could coincidentally produce the right answer even if the
    // post-commit ZINCRBY never fired. increment() never calls ensureWarm()/rebuild, so
    // this key can only be populated by the settlement's own post-commit call.
    const score = await redis.zscore('leaderboard:points', 'subject-user');
    expect(score).not.toBeNull();
    expect(-Number(score)).toBe(10);
  });
});
