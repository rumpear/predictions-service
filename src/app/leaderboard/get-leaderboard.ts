import { LeaderboardEntry, LeaderboardRepository } from './leaderboard-repository.port';

const TOP_N = 20;

export interface GetLeaderboardDeps {
  repository: LeaderboardRepository;
}

export interface GetLeaderboardResult {
  top: LeaderboardEntry[];
  requestedUser: LeaderboardEntry | null;
}

export async function getLeaderboard(deps: GetLeaderboardDeps, userId?: string): Promise<GetLeaderboardResult> {
  const top = await deps.repository.top(TOP_N);

  if (!userId || top.some((entry) => entry.userId === userId)) {
    return { top, requestedUser: null };
  }

  const requestedUser = await deps.repository.rankOf(userId);
  return { top, requestedUser };
}
