import { Kysely, sql } from 'kysely';
import { Database } from './schema';
import {
  LeaderboardBalanceSnapshot,
  LeaderboardEntry,
  LeaderboardRebuildSource,
  LeaderboardRepository,
} from '../../app/leaderboard/leaderboard-repository.port';

interface RankedRow {
  user_id: string;
  points: string;
  rank: string;
}

function toEntry(row: RankedRow): LeaderboardEntry {
  return { userId: row.user_id, points: Number(row.points), rank: Number(row.rank) };
}

// Every user, defaulting to 0 points if they have no balances row yet (ASSUMPTIONS.md #6):
// balances rows only exist from settlement onward, but a user who's only placed unsettled
// picks should still appear. Tie-break is points DESC, earliest award ASC NULLS LAST,
// userId ASC — fully disambiguating, so ROW_NUMBER() (not RANK()) is the right window
// function: there are never true ties left to reflect as rank gaps.
const RANKED_CTE = sql`
  ranked AS (
    SELECT
      u.id AS user_id,
      COALESCE(b.points, 0)::bigint AS points,
      MIN(pa.created_at) AS first_award_at
    FROM users u
    LEFT JOIN balances b ON b.user_id = u.id
    LEFT JOIN point_awards pa ON pa.user_id = u.id
    GROUP BY u.id, b.points
  ),
  numbered AS (
    SELECT
      user_id,
      points,
      ROW_NUMBER() OVER (ORDER BY points DESC, first_award_at ASC NULLS LAST, user_id ASC) AS rank
    FROM ranked
  )
`;

export class PostgresLeaderboardRepository implements LeaderboardRepository, LeaderboardRebuildSource {
  constructor(private readonly db: Kysely<Database>) {}

  async top(limit: number): Promise<LeaderboardEntry[]> {
    const { rows } = await sql<RankedRow>`
      WITH ${RANKED_CTE}
      SELECT user_id, points, rank FROM numbered ORDER BY rank ASC LIMIT ${limit}
    `.execute(this.db);
    return rows.map(toEntry);
  }

  async rankOf(userId: string): Promise<LeaderboardEntry | null> {
    const { rows } = await sql<RankedRow>`
      WITH ${RANKED_CTE}
      SELECT user_id, points, rank FROM numbered WHERE user_id = ${userId}
    `.execute(this.db);
    const row = rows[0];
    return row ? toEntry(row) : null;
  }

  async allBalances(): Promise<LeaderboardBalanceSnapshot[]> {
    const rows = await this.db.selectFrom('balances').select(['user_id', 'points']).execute();
    return rows.map((row) => ({ userId: row.user_id, points: Number(row.points) }));
  }
}
