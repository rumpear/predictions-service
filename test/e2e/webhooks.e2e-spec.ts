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

describe('POST /webhooks/match-finished (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let db: Kysely<Database>;

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
});
