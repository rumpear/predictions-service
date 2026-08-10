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

describe('GET /leaderboard (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let db: Kysely<Database>;
  let matchCounter = 0;

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

  async function seedUserWithPoints(userId: string, points: number): Promise<void> {
    matchCounter += 1;
    const matchId = `lb-match-${matchCounter}`;
    await db.insertInto('users').values({ id: userId }).onConflict((oc) => oc.column('id').doNothing()).execute();
    await sql`
      insert into matches (id, kickoff_at, status) values (${matchId}, now() - interval '1 hour', 'scheduled')
    `.execute(db);
    const pick = await db
      .insertInto('picks')
      .values({ user_id: userId, match_id: matchId, type: 'result', predicted_outcome: 'home' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const settlement = await db
      .insertInto('settlements')
      .values({ match_id: matchId, event_id: `${matchId}-evt`, home_score: 1, away_score: 0 })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db
      .insertInto('point_awards')
      .values({ pick_id: pick.id, settlement_id: settlement.id, user_id: userId, points })
      .execute();
    await db
      .insertInto('balances')
      .values({ user_id: userId, points: points.toString() })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet((eb) => ({ points: eb('balances.points', '+', eb.ref('excluded.points')) })),
      )
      .execute();
  }

  it('returns an empty top list when nobody has played', async () => {
    const response = await request(server).get('/leaderboard');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ top: [], requestedUser: null });
  });

  it('returns the top players ordered by points descending', async () => {
    await seedUserWithPoints('u1', 30);
    await seedUserWithPoints('u2', 20);
    await seedUserWithPoints('u3', 10);

    const response = await request(server).get('/leaderboard');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      top: [
        { userId: 'u1', points: 30, rank: 1 },
        { userId: 'u2', points: 20, rank: 2 },
        { userId: 'u3', points: 10, rank: 3 },
      ],
      requestedUser: null,
    });
  });

  it('omits requestedUser when the queried userId is already in the top', async () => {
    await seedUserWithPoints('u1', 30);

    const response = await request(server).get('/leaderboard?userId=u1');

    expect(response.status).toBe(200);
    expect(response.body.requestedUser).toBeNull();
  });

  it('includes requestedUser with rank/points when the queried userId is outside the top 20', async () => {
    for (let i = 0; i < 21; i++) {
      await seedUserWithPoints(`player-${String(i).padStart(2, '0')}`, 100 - i);
    }

    const response = await request(server).get('/leaderboard?userId=player-20');

    expect(response.status).toBe(200);
    expect(response.body.top).toHaveLength(20);
    expect(response.body.requestedUser).toEqual({ userId: 'player-20', points: 80, rank: 21 });
  });

  it('returns requestedUser: null for a userId that has never played', async () => {
    const response = await request(server).get('/leaderboard?userId=never-seen');

    expect(response.status).toBe(200);
    expect(response.body.requestedUser).toBeNull();
  });
});
