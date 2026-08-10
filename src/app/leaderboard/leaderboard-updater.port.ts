/** The post-COMMIT side effect settlement applies to the leaderboard read model.
 * TASK.md §5: side effects go after COMMIT, never inside the settlement transaction. */
export interface LeaderboardUpdater {
  increment(userId: string, delta: number): Promise<void>;
}
