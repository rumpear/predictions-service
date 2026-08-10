import type { Server } from 'http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Kysely } from 'kysely';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { KYSELY } from '../../src/infra/db/database.module';
import { Database } from '../../src/infra/db/schema';
import { assertLedgerInvariants } from '../support/assert-ledger-invariants';

describe('GET /health (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let db: Kysely<Database>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
    db = app.get(KYSELY);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports ok after a round trip through the containerised database', async () => {
    const response = await request(server).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });

    await assertLedgerInvariants(db);
  });
});
