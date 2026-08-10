import { parseMatchFinishedPayload } from '../../domain/webhook-validation';
import { LeaderboardUpdater } from '../leaderboard/leaderboard-updater.port';
import { SettlementRepository } from './settlement-repository.port';

export type SettleMatchResult =
  | { outcome: 'processed' }
  | { outcome: 'invalid'; error: string }
  | { outcome: 'unknown_match' };

export interface SettleMatchDeps {
  repository: SettlementRepository;
  /** Optional: no-op (fine — the leaderboard endpoint self-heals via cold-start rebuild
   * and per-user fallback) if not supplied, e.g. from tests that don't care about it. */
  leaderboardUpdater?: LeaderboardUpdater;
}

export async function settleMatch(deps: SettleMatchDeps, body: unknown): Promise<SettleMatchResult> {
  const parsed = parseMatchFinishedPayload(body);
  if (!parsed.ok) {
    return { outcome: 'invalid', error: parsed.error };
  }

  const result = await deps.repository.settleMatch({ ...parsed.payload, rawPayload: body });

  switch (result.kind) {
    case 'applied':
      // By the time this promise resolved, the settlement transaction had already
      // committed — this runs strictly after COMMIT, per TASK.md §5. Best-effort: a
      // failure here doesn't fail the request (the settlement already succeeded), and
      // doesn't leave the read model permanently wrong either — see
      // RedisLeaderboardRepository's cold-start rebuild and per-user fallback.
      await updateLeaderboard(deps.leaderboardUpdater, result.awards);
      return { outcome: 'processed' };
    case 'duplicate':
    case 'conflict':
      return { outcome: 'processed' };
    case 'unknown_match':
      return { outcome: 'unknown_match' };
  }
}

async function updateLeaderboard(
  updater: LeaderboardUpdater | undefined,
  awards: Array<{ userId: string; points: number }>,
): Promise<void> {
  if (!updater) {
    return;
  }
  try {
    for (const award of awards) {
      await updater.increment(award.userId, award.points);
    }
  } catch {
    // Swallowed deliberately: this is the accepted eventual-consistency window (TASK.md
    // §6), not an error being hidden. The next cold-start rebuild or per-user fallback
    // read self-heals it.
  }
}
