export interface AwardedPoints {
  userId: string;
  points: number;
}

export type SettleMatchOutcome =
  | { kind: 'applied'; awards: AwardedPoints[] }
  | { kind: 'duplicate' }
  | { kind: 'conflict' }
  | { kind: 'unknown_match' };

export interface SettleMatchParams {
  matchId: string;
  eventId: string;
  homeScore: number;
  awayScore: number;
  rawPayload: unknown;
}

export interface SettlementOptions {
  /**
   * Test-only seam for Scenario B's constraints-only variant (TASK.md §7.3.B): skip the
   * application fast-path check and/or the advisory lock, so the unique constraints alone
   * must carry correctness. Never wired to the HTTP layer — real requests always run with
   * every layer enabled.
   */
  skipFastPath?: boolean;
  skipLock?: boolean;
}

export interface SettlementRepository {
  settleMatch(params: SettleMatchParams, options?: SettlementOptions): Promise<SettleMatchOutcome>;
}
