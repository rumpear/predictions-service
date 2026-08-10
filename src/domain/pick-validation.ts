import { Outcome, Pick } from './pick';

export interface PickInput {
  type: unknown;
  value: unknown;
}

export type ParsePickResult = { ok: true; pick: Pick } | { ok: false; error: string };

const EXACT_SCORE_PATTERN = /^(\d{1,2}):(\d{1,2})$/;

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
      return {
        ok: true,
        pick: { type: 'exact', predictedHome: Number(homeStr), predictedAway: Number(awayStr) },
      };
    }
    return { ok: false, error: 'exact pick value must match ^\\d{1,2}:\\d{1,2}$' };
  }

  return { ok: false, error: 'type must be "result" or "exact"' };
}
