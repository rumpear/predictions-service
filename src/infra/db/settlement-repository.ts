import { Kysely, sql } from 'kysely';
import { Database } from './schema';
import { Pick } from '../../domain/pick';
import { scorePick } from '../../domain/scoring';
import { isPostgresError } from './postgres-error';
import {
  AwardedPoints,
  SettleMatchOutcome,
  SettleMatchParams,
  SettlementOptions,
  SettlementRepository,
} from '../../app/settlement/settlement-repository.port';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

interface PickRow {
  id: string;
  user_id: string;
  type: 'result' | 'exact';
  predicted_outcome: 'home' | 'away' | 'draw' | null;
  predicted_home: number | null;
  predicted_away: number | null;
}

function toPick(row: PickRow): Pick {
  if (row.type === 'result') {
    // Non-null by the picks_type_shape_check CHECK constraint (migration 0001).
    return { type: 'result', predictedOutcome: row.predicted_outcome as 'home' | 'away' | 'draw' };
  }
  return { type: 'exact', predictedHome: row.predicted_home as number, predictedAway: row.predicted_away as number };
}

function advisoryLockKey(matchId: string): string {
  return `settle:match:${matchId}`;
}

export class KyselySettlementRepository implements SettlementRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async settleMatch(params: SettleMatchParams, options: SettlementOptions = {}): Promise<SettleMatchOutcome> {
    const { matchId, eventId, homeScore, awayScore, rawPayload } = params;

    // Layer 1 (weakest): a fast-path read. Pure optimization — two concurrent requests can
    // both pass it, which is exactly why layers 2 and 3 exist. Skippable only for the
    // constraints-only test (TASK.md §7.3.B variant).
    if (!options.skipFastPath) {
      const existing = await this.db
        .selectFrom('settlements')
        .select(['home_score', 'away_score'])
        .where('match_id', '=', matchId)
        .executeTakeFirst();
      if (existing) {
        const outcome = this.classify(existing, homeScore, awayScore);
        await this.logWebhookEvent(this.db, eventId, matchId, outcome, rawPayload);
        return { kind: outcome };
      }
    }

    try {
      return await this.db.transaction().execute(async (trx) => {
        // Layer 2: serialize settlement of this one match. Skippable only for the
        // constraints-only test — real requests always take the lock.
        if (!options.skipLock) {
          await sql`select pg_advisory_xact_lock(hashtext(${advisoryLockKey(matchId)}))`.execute(trx);
        }

        // Layer 3 (final arbiter): the unique constraint on settlements.match_id. This INSERT
        // is what actually decides "did this request get to settle the match" — even with
        // both layers above disabled, only one concurrent transaction can win here.
        const settlement = await trx
          .insertInto('settlements')
          .values({ match_id: matchId, event_id: eventId, home_score: homeScore, away_score: awayScore })
          .returning('id')
          .executeTakeFirstOrThrow();

        await trx
          .updateTable('matches')
          .set({ status: 'finished', home_score: homeScore, away_score: awayScore, settled_at: sql`now()` })
          .where('id', '=', matchId)
          .execute();

        const picks = await trx
          .selectFrom('picks')
          .select(['id', 'user_id', 'type', 'predicted_outcome', 'predicted_home', 'predicted_away'])
          .where('match_id', '=', matchId)
          .execute();

        let awards: AwardedPoints[] = [];

        if (picks.length > 0) {
          const matchResult = { homeScore, awayScore };
          const awardValues = picks.map((pick) =>
            sql`(${pick.id}, ${settlement.id}, ${pick.user_id}, ${scorePick(toPick(pick), matchResult)})`,
          );

          // One multi-row insert, aggregated per user, applied as one atomic balance
          // increment — never read-modify-write. ORDER BY user_id makes lock acquisition
          // order deterministic across concurrent settlements touching overlapping users,
          // which is what makes deadlocks structurally impossible here.
          //
          // balance_upsert is a data-modifying CTE that the outer SELECT never reads from
          // — Postgres still executes it exactly once regardless (documented behavior for
          // WITH). That's what lets the final SELECT return the *deltas* themselves (what
          // the caller needs to replay onto the Redis mirror after commit) rather than
          // post-update totals; `excluded.points` isn't a valid RETURNING reference at the
          // top level of an INSERT, only within the ON CONFLICT DO UPDATE clause itself.
          const { rows } = await sql<{ user_id: string; delta: string }>`
            with inserted_awards as (
              insert into point_awards (pick_id, settlement_id, user_id, points)
              values ${sql.join(awardValues)}
              on conflict (pick_id) do nothing
              returning user_id, points
            ),
            deltas as (
              select user_id, sum(points) as delta from inserted_awards group by user_id order by user_id
            ),
            balance_upsert as (
              insert into balances (user_id, points)
              select user_id, delta from deltas
              on conflict (user_id) do update set points = balances.points + excluded.points
              returning 1
            )
            select user_id, delta from deltas
          `.execute(trx);

          awards = rows.map((row) => ({ userId: row.user_id, points: Number(row.delta) }));
        }

        await this.logWebhookEvent(trx, eventId, matchId, 'applied', rawPayload);

        return { kind: 'applied', awards };
      });
    } catch (err) {
      if (isPostgresError(err) && err.code === FOREIGN_KEY_VIOLATION) {
        return { kind: 'unknown_match' };
      }
      if (isPostgresError(err) && err.code === UNIQUE_VIOLATION) {
        // The transaction rolled back already (Kysely does this automatically when the
        // callback throws) — this is a fresh read/write outside that aborted transaction,
        // not a continuation of it.
        const existing = await this.db
          .selectFrom('settlements')
          .select(['home_score', 'away_score'])
          .where('match_id', '=', matchId)
          .executeTakeFirstOrThrow();
        const outcome = this.classify(existing, homeScore, awayScore);
        await this.logWebhookEvent(this.db, eventId, matchId, outcome, rawPayload);
        return { kind: outcome };
      }
      throw err;
    }
  }

  private classify(
    existing: { home_score: number; away_score: number },
    homeScore: number,
    awayScore: number,
  ): 'duplicate' | 'conflict' {
    return existing.home_score === homeScore && existing.away_score === awayScore ? 'duplicate' : 'conflict';
  }

  private async logWebhookEvent(
    db: Kysely<Database>,
    eventId: string,
    matchId: string,
    outcome: 'applied' | 'duplicate' | 'conflict',
    rawPayload: unknown,
  ): Promise<void> {
    await db
      .insertInto('webhook_events')
      .values({
        event_id: eventId,
        match_id: matchId,
        raw_payload: JSON.stringify(rawPayload),
        outcome,
        processed_at: sql`now()`,
      })
      .onConflict((oc) => oc.column('event_id').doNothing())
      .execute();
  }
}
