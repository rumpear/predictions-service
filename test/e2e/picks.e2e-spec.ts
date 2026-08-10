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

describe('POST /picks (e2e)', () => {
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
      values ('future-match', now() + interval '1 day', 'scheduled')
    `.execute(db);
    await sql`
      insert into matches (id, kickoff_at, status)
      values ('past-match', now() - interval '1 day', 'scheduled')
    `.execute(db);
  });

  afterEach(async () => {
    await assertLedgerInvariants(db);
  });

  it('returns 201 for a valid result pick', async () => {
    const response = await request(server)
      .post('/picks')
      .send({ userId: 'user-1', matchId: 'future-match', type: 'result', value: 'home' });

    expect(response.status).toBe(201);
  });

  it('returns 201 for a valid exact pick', async () => {
    const response = await request(server)
      .post('/picks')
      .send({ userId: 'user-1', matchId: 'future-match', type: 'exact', value: '2:1' });

    expect(response.status).toBe(201);
  });

  it('returns 400 for a type/value mismatch', async () => {
    const response = await request(server)
      .post('/picks')
      .send({ userId: 'user-1', matchId: 'future-match', type: 'result', value: '2:1' });

    expect(response.status).toBe(400);
  });

  it('returns 400 for a missing userId', async () => {
    const response = await request(server)
      .post('/picks')
      .send({ matchId: 'future-match', type: 'result', value: 'home' });

    expect(response.status).toBe(400);
  });

  it('returns 404 for an unknown match', async () => {
    const response = await request(server)
      .post('/picks')
      .send({ userId: 'user-1', matchId: 'no-such-match', type: 'result', value: 'home' });

    expect(response.status).toBe(404);
  });

  it('returns 422 for a match past kickoff', async () => {
    const response = await request(server)
      .post('/picks')
      .send({ userId: 'user-1', matchId: 'past-match', type: 'result', value: 'home' });

    expect(response.status).toBe(422);
  });

  it('returns 409 for a duplicate (user, match, type)', async () => {
    await request(server)
      .post('/picks')
      .send({ userId: 'user-1', matchId: 'future-match', type: 'result', value: 'home' });

    const response = await request(server)
      .post('/picks')
      .send({ userId: 'user-1', matchId: 'future-match', type: 'result', value: 'away' });

    expect(response.status).toBe(409);
  });

  it('allows a brand-new userId (auto-create) rather than 404ing', async () => {
    const response = await request(server)
      .post('/picks')
      .send({ userId: 'never-seen-before', matchId: 'future-match', type: 'result', value: 'home' });

    expect(response.status).toBe(201);
  });
});
