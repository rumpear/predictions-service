import { Kysely, sql } from 'kysely';
import { Database } from './schema';
import { InsertPickOutcome, InsertPickParams, PicksRepository } from '../../app/picks/picks-repository.port';
import { isPostgresError } from './postgres-error';

const UNIQUE_VIOLATION = '23505';

export class KyselyPicksRepository implements PicksRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async insertPickIfAllowed(params: InsertPickParams): Promise<InsertPickOutcome> {
    const { userId, matchId, pick } = params;

    // Idempotent upsert, not itself race-sensitive: worst case two concurrent first-picks
    // from the same new user both attempt this; ON CONFLICT DO NOTHING makes it safe.
    await sql`insert into users (id) values (${userId}) on conflict (id) do nothing`.execute(this.db);

    const predictedOutcome = pick.type === 'result' ? pick.predictedOutcome : null;
    const predictedHome = pick.type === 'exact' ? pick.predictedHome : null;
    const predictedAway = pick.type === 'exact' ? pick.predictedAway : null;

    try {
      // The kickoff/status check is atomic with the insert (a conditional INSERT...SELECT,
      // not read-then-write) — the database's own now(), not the app's, decides eligibility.
      const { rows } = await sql<{ id: string }>`
        insert into picks (user_id, match_id, type, predicted_outcome, predicted_home, predicted_away)
        select ${userId}, ${matchId}, ${pick.type}, ${predictedOutcome}, ${predictedHome}, ${predictedAway}
        from matches
        where id = ${matchId} and kickoff_at > now() and status = 'scheduled'
        returning id
      `.execute(this.db);

      const created = rows[0];
      if (created) {
        return { kind: 'created', pickId: created.id };
      }

      // Zero rows: the WHERE clause matched nothing. Diagnose why, for the response only —
      // this lookup happens after the authoritative decision, so it can't introduce a race.
      const match = await this.db.selectFrom('matches').select('id').where('id', '=', matchId).executeTakeFirst();
      return match ? { kind: 'rejected_not_open' } : { kind: 'rejected_unknown_match' };
    } catch (err) {
      if (isPostgresError(err) && err.code === UNIQUE_VIOLATION) {
        return { kind: 'rejected_duplicate' };
      }
      throw err;
    }
  }
}
