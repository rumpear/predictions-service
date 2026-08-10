import type { Server } from 'http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Kysely, sql } from 'kysely';
import fc from 'fast-check';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { KYSELY } from '../../src/infra/db/database.module';
import { Database } from '../../src/infra/db/schema';
import { assertLedgerInvariants } from '../support/assert-ledger-invariants';

// TASK.md §7.4 bonus — "the single most convincing test in the suite." Generates a random
// set of picks and a random sequence of duplicate webhook deliveries (mixing "redeliver the
// same eventId" with "retry under a new eventId", per §2.2's "don't assume eventId is
// stable") for one match, and asserts I3 (no pick ever awarded twice) + I4 (every balance
// reconciles against its awards) hold after *every* generated history — not just the
// hand-picked cases in Scenarios A/B/C.
//
// Scores are held constant across all deliveries in a given run, deliberately: this isolates
// the duplicate-delivery guarantee from score-conflict handling, which Scenario A already
// covers explicitly and deterministically.
describe('Property: settlement invariants hold under any duplicate-webhook history', () => {
  let app: INestApplication;
  let server: Server;
  let db: Kysely<Database>;
  let scenarioCounter = 0;

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

  const pickArb = fc.oneof(
    fc.record({ type: fc.constant('result' as const), value: fc.constantFrom('home', 'away', 'draw') }),
    fc.record({
      type: fc.constant('exact' as const),
      value: fc
        .tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 }))
        .map(([home, away]) => `${home}:${away}`),
    }),
  );

  const scenarioArb = fc.record({
    picks: fc.array(pickArb, { minLength: 1, maxLength: 4 }),
    actualHomeScore: fc.integer({ min: 0, max: 5 }),
    actualAwayScore: fc.integer({ min: 0, max: 5 }),
    // true = this delivery uses a brand-new eventId; false = redeliver the first eventId.
    deliveries: fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }),
  });

  it('never double-credits a pick and balances always reconcile, for any generated history', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ picks, actualHomeScore, actualAwayScore, deliveries }) => {
        scenarioCounter += 1;
        const matchId = `prop-match-${scenarioCounter}`;
        const userIds = picks.map((_pick, i) => `prop-user-${scenarioCounter}-${i}`);

        // kickoff_at must be in the future for POST /picks to accept anything below —
        // settlement itself doesn't care about kickoff_at, only status, so this doesn't
        // affect the webhook deliveries that follow.
        await sql`
          insert into matches (id, kickoff_at, status) values (${matchId}, now() + interval '1 day', 'scheduled')
        `.execute(db);

        for (const [i, pick] of picks.entries()) {
          const userId = userIds[i];
          const response = await request(server)
            .post('/picks')
            .send({ userId, matchId, type: pick.type, value: pick.value });
          if (response.status !== 201) {
            throw new Error(`pick creation returned ${response.status}: ${JSON.stringify(response.body)}`);
          }
        }

        let firstEventId: string | undefined;
        let eventCounter = 0;
        for (const useNewEventId of deliveries) {
          eventCounter += 1;
          const eventId =
            firstEventId === undefined || useNewEventId ? `prop-evt-${matchId}-${eventCounter}` : firstEventId;
          firstEventId ??= eventId;

          const response = await request(server)
            .post('/webhooks/match-finished')
            .send({ matchId, eventId, homeScore: actualHomeScore, awayScore: actualAwayScore });

          if (response.status >= 500) {
            throw new Error(`webhook returned ${response.status}: ${JSON.stringify(response.body)}`);
          }
        }

        await assertLedgerInvariants(db);

        const settlementCount = await db
          .selectFrom('settlements')
          .select(db.fn.countAll().as('n'))
          .where('match_id', '=', matchId)
          .executeTakeFirstOrThrow();
        expect(Number(settlementCount.n)).toBe(1);

        const awardCount = await db
          .selectFrom('point_awards')
          .innerJoin('picks', 'picks.id', 'point_awards.pick_id')
          .select(db.fn.countAll().as('n'))
          .where('picks.match_id', '=', matchId)
          .executeTakeFirstOrThrow();
        expect(Number(awardCount.n)).toBe(picks.length);
      }),
      { numRuns: 30 },
    );
  });
});
