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

// TASK.md §7.3.A — one of the three mandatory scenarios.
describe('Scenario A: duplicate webhook (e2e)', () => {
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
      values ('match-a', now() - interval '1 hour', 'scheduled')
    `.execute(db);
    await sql`insert into users (id) values ('u1'), ('u2')`.execute(db);
    // u1: correct result (10 pts). u2: wrong exact score (0 pts). Two picks total.
    await sql`
      insert into picks (user_id, match_id, type, predicted_outcome)
      values ('u1', 'match-a', 'result', 'home')
    `.execute(db);
    await sql`
      insert into picks (user_id, match_id, type, predicted_home, predicted_away)
      values ('u2', 'match-a', 'exact', 0, 0)
    `.execute(db);
  });

  afterEach(async () => {
    await assertLedgerInvariants(db);
  });

  async function settlementCount(): Promise<number> {
    const row = await db
      .selectFrom('settlements')
      .select(db.fn.countAll().as('n'))
      .where('match_id', '=', 'match-a')
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  async function pointAwardsCount(): Promise<number> {
    const row = await db
      .selectFrom('point_awards')
      .innerJoin('picks', 'picks.id', 'point_awards.pick_id')
      .select(db.fn.countAll().as('n'))
      .where('picks.match_id', '=', 'match-a')
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  async function balances(): Promise<Record<string, number>> {
    const rows = await db.selectFrom('balances').select(['user_id', 'points']).execute();
    return Object.fromEntries(rows.map((r) => [r.user_id, Number(r.points)]));
  }

  it('sending the identical webhook 5 times sequentially never credits points more than once', async () => {
    for (let call = 1; call <= 5; call++) {
      const response = await request(server)
        .post('/webhooks/match-finished')
        .send({ matchId: 'match-a', eventId: 'evt-1', homeScore: 2, awayScore: 1 });

      expect(response.status).toBe(200);
      expect(await settlementCount()).toBe(1);
      expect(await pointAwardsCount()).toBe(2); // one row per pick, always

      if (call >= 2) {
        expect(await balances()).toEqual({ u1: 10, u2: 0 });
      }

      await assertLedgerInvariants(db);
    }

    expect(await balances()).toEqual({ u1: 10, u2: 0 });
  });

  it('a repeat with a different eventId but the same matchId still credits nothing extra', async () => {
    await request(server)
      .post('/webhooks/match-finished')
      .send({ matchId: 'match-a', eventId: 'evt-1', homeScore: 2, awayScore: 1 });
    const balancesAfterFirst = await balances();

    for (const eventId of ['evt-2', 'evt-3', 'evt-4']) {
      const response = await request(server)
        .post('/webhooks/match-finished')
        .send({ matchId: 'match-a', eventId, homeScore: 2, awayScore: 1 });

      expect(response.status).toBe(200);
      expect(await settlementCount()).toBe(1);
      expect(await pointAwardsCount()).toBe(2);
      expect(await balances()).toEqual(balancesAfterFirst);
    }
  });

  it('a repeat with different scores is handled per the documented conflict policy (first-write-wins)', async () => {
    await request(server)
      .post('/webhooks/match-finished')
      .send({ matchId: 'match-a', eventId: 'evt-1', homeScore: 2, awayScore: 1 });
    const balancesAfterFirst = await balances();

    const response = await request(server)
      .post('/webhooks/match-finished')
      .send({ matchId: 'match-a', eventId: 'evt-2', homeScore: 5, awayScore: 5 });

    // ASSUMPTIONS.md #2: first-write-wins. Still a 200 (durably received, not retried),
    // but the original settlement and awards are untouched.
    expect(response.status).toBe(200);
    expect(await settlementCount()).toBe(1);
    expect(await pointAwardsCount()).toBe(2);
    expect(await balances()).toEqual(balancesAfterFirst);

    const settlement = await db
      .selectFrom('settlements')
      .select(['home_score', 'away_score'])
      .where('match_id', '=', 'match-a')
      .executeTakeFirstOrThrow();
    expect(settlement).toEqual({ home_score: 2, away_score: 1 });

    const webhookEvent = await db
      .selectFrom('webhook_events')
      .select('outcome')
      .where('event_id', '=', 'evt-2')
      .executeTakeFirstOrThrow();
    expect(webhookEvent.outcome).toBe('conflict');
  });
});
