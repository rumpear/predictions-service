import { Outcome, Pick } from './pick';

export interface PickInput {
  type: unknown;
  value: unknown;
}

export type ParsePickResult = { ok: true; pick: Pick } | { ok: false; error: string };

const EXACT_SCORE_PATTERN = /^(\d+):(\d+)$/;

function isOutcome(value: string): value is Outcome {
  return value === 'home' || value === 'away' || value === 'draw';
}

export function parsePickInput(input: PickInput): ParsePickResult {
  if (input.type === 'result') {
    if (typeof input.value === 'string' && isOutcome(input.value)) {
      return { ok: true, pick: { type: 'result', predictedOutcome: input.value } };
    }
    return { ok: false, error: 'result pick value must be one of "home", "away", "draw"' };
  }

  if (input.type === 'exact') {
    const match = typeof input.value === 'string' ? EXACT_SCORE_PATTERN.exec(input.value) : null;
    const homeStr = match?.[1];
    const awayStr = match?.[2];
    if (homeStr !== undefined && awayStr !== undefined) {
      const predictedHome = Number(homeStr);
      const predictedAway = Number(awayStr);
      if (Number.isSafeInteger(predictedHome) && Number.isSafeInteger(predictedAway)) {
        return { ok: true, pick: { type: 'exact', predictedHome, predictedAway } };
      }
      return { ok: false, error: 'exact pick score is too large to represent precisely' };
    }
    return { ok: false, error: 'exact pick value must match ^\\d+:\\d+$' };
  }

  return { ok: false, error: 'type must be "result" or "exact"' };
}
