import { Redis } from 'ioredis';
import {
  LeaderboardEntry,
  LeaderboardRebuildSource,
  LeaderboardRepository,
} from '../../app/leaderboard/leaderboard-repository.port';

const LEADERBOARD_KEY = 'leaderboard:points';

/**
 * Redis-backed leaderboard read model (TASK.md §6). Postgres remains the source of truth;
 * this is purely a faster read path for top-N and single-user rank lookups.
 *
 * Score is stored as -points, not points: a ZSET only has one score dimension, but the
 * documented tie-break (ASSUMPTIONS.md #6) is points DESC, earliest-award ASC, userId ASC.
 * Storing -points and reading with ZRANGE (ascending) rather than ZREVRANGE makes Redis's
 * own equal-score tie-break — ascending lexicographic member order — line up with the
 * userId-ASC *final* tiebreak. The *middle* tiebreak (earliest award) has no equivalent in
 * a single-dimension sorted set and is dropped for the Redis-served path; see the Redis ADR
 * in DECISIONS.md for the full reasoning and why this is an accepted, documented gap rather
 * than a bug.
 */
export class RedisLeaderboardRepository implements LeaderboardRepository {
  constructor(
    private readonly redis: Redis,
    private readonly fallback: LeaderboardRepository,
    private readonly rebuildSource: LeaderboardRebuildSource,
  ) {}

  async top(limit: number): Promise<LeaderboardEntry[]> {
    try {
      await this.ensureWarm();
      const raw = await this.redis.zrange(LEADERBOARD_KEY, 0, limit - 1, 'WITHSCORES');
      return this.parseRange(raw);
    } catch {
      return this.fallback.top(limit);
    }
  }

  async rankOf(userId: string): Promise<LeaderboardEntry | null> {
    try {
      await this.ensureWarm();
      const rank = await this.redis.zrank(LEADERBOARD_KEY, userId);
      if (rank === null) {
        // Missing from an otherwise-populated mirror: could be a genuinely unranked user,
        // or a drifted/missed update. Postgres is the source of truth either way — ask it,
        // rather than a full rebuild just to answer one lookup.
        return this.fallback.rankOf(userId);
      }
      const score = await this.redis.zscore(LEADERBOARD_KEY, userId);
      if (score === null) {
        return this.fallback.rankOf(userId);
      }
      return { userId, points: -Number(score), rank: rank + 1 };
    } catch {
      return this.fallback.rankOf(userId);
    }
  }

  /** Full rebuild from the source of truth. Called automatically on cold start (an empty
   * sorted set); also safe to call directly, e.g. from an ops/admin path. */
  async rebuild(): Promise<void> {
    const balances = await this.rebuildSource.allBalances();
    const pipeline = this.redis.pipeline();
    pipeline.del(LEADERBOARD_KEY);
    for (const { userId, points } of balances) {
      pipeline.zadd(LEADERBOARD_KEY, -points, userId);
    }
    const results = await pipeline.exec();
    for (const [err] of results ?? []) {
      if (err) throw err;
    }
  }

  /** The post-COMMIT side effect settlement calls — never inside the settlement
   * transaction (TASK.md §5: side effects go after COMMIT). */
  async increment(userId: string, delta: number): Promise<void> {
    await this.redis.zincrby(LEADERBOARD_KEY, -delta, userId);
  }

  private async ensureWarm(): Promise<void> {
    const cardinality = await this.redis.zcard(LEADERBOARD_KEY);
    if (cardinality === 0) {
      await this.rebuild();
    }
  }

  private parseRange(raw: string[]): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const userId = raw[i];
      const score = raw[i + 1];
      if (userId === undefined || score === undefined) {
        continue;
      }
      entries.push({ userId, points: -Number(score), rank: entries.length + 1 });
    }
    return entries;
  }
}
