export interface LeaderboardEntry {
  userId: string;
  points: number;
  rank: number;
}

export interface LeaderboardRepository {
  top(limit: number): Promise<LeaderboardEntry[]>;
  rankOf(userId: string): Promise<LeaderboardEntry | null>;
}
