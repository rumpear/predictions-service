export interface MatchFinishedPayload {
  matchId: string;
  eventId: string;
  homeScore: number;
  awayScore: number;
}

export type ParseMatchFinishedResult =
  | { ok: true; payload: MatchFinishedPayload }
  | { ok: false; error: string };

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function parseMatchFinishedPayload(input: unknown): ParseMatchFinishedResult {
  const record = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const { matchId, eventId, homeScore, awayScore } = record;

  if (typeof matchId !== 'string' || matchId.length === 0) {
    return { ok: false, error: 'matchId must be a non-empty string' };
  }
  if (typeof eventId !== 'string' || eventId.length === 0) {
    return { ok: false, error: 'eventId must be a non-empty string' };
  }
  if (!isNonNegativeSafeInteger(homeScore)) {
    return { ok: false, error: 'homeScore must be a non-negative integer' };
  }
  if (!isNonNegativeSafeInteger(awayScore)) {
    return { ok: false, error: 'awayScore must be a non-negative integer' };
  }

  return { ok: true, payload: { matchId, eventId, homeScore, awayScore } };
}
