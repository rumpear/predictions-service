export interface LeaderboardEntry {
  userId: string;
  points: number;
  rank: number;
}

export interface LeaderboardRepository {
  top(limit: number): Promise<LeaderboardEntry[]>;
  rankOf(userId: string): Promise<LeaderboardEntry | null>;
}

export interface LeaderboardBalanceSnapshot {
  userId: string;
  points: number;
}

/** What a Redis-backed leaderboard rebuilds itself from. Deliberately narrower than
 * LeaderboardRepository: only users with a real balances row (ASSUMPTIONS.md #6 notes
 * Postgres also ranks never-played users at 0 via a LEFT JOIN; the Redis mirror doesn't
 * bother mirroring that edge case — see DECISIONS.md's Redis ADR). */
export interface LeaderboardRebuildSource {
  allBalances(): Promise<LeaderboardBalanceSnapshot[]>;
}
