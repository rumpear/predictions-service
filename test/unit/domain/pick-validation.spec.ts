import { parsePickInput } from '../../../src/domain/pick-validation';

describe('parsePickInput', () => {
  it.each(['home', 'away', 'draw'] as const)('accepts a valid result pick: %s', (value) => {
    const result = parsePickInput({ type: 'result', value });
    expect(result).toEqual({ ok: true, pick: { type: 'result', predictedOutcome: value } });
  });

  it('rejects a result pick carrying a score-shaped value', () => {
    const result = parsePickInput({ type: 'result', value: '2:1' });
    expect(result.ok).toBe(false);
  });

  it.each([
    { value: '2:1', predictedHome: 2, predictedAway: 1 },
    { value: '0:0', predictedHome: 0, predictedAway: 0 },
    { value: '5:3', predictedHome: 5, predictedAway: 3 },
    { value: '9:0', predictedHome: 9, predictedAway: 0 },
    { value: '0:9', predictedHome: 0, predictedAway: 9 },
    { value: '10:20', predictedHome: 10, predictedAway: 20 },
    { value: '99:0', predictedHome: 99, predictedAway: 0 },
    { value: '0:99', predictedHome: 0, predictedAway: 99 },
    { value: '99:99', predictedHome: 99, predictedAway: 99 },
    // beyond football's realistic range on purpose: value is a scoreline for any
    // X:Y sport (basketball points, best-of-series set counts, ...), not just football
    { value: '102:98', predictedHome: 102, predictedAway: 98 },
    { value: '150:3', predictedHome: 150, predictedAway: 3 },
    { value: '1000:2', predictedHome: 1000, predictedAway: 2 },
  ])('accepts a valid exact pick: $value', ({ value, predictedHome, predictedAway }) => {
    const result = parsePickInput({ type: 'exact', value });
    expect(result).toEqual({ ok: true, pick: { type: 'exact', predictedHome, predictedAway } });
  });

  it('accepts an exact score with a leading zero, e.g. "02:1"', () => {
    const result = parsePickInput({ type: 'exact', value: '02:1' });
    expect(result).toEqual({ ok: true, pick: { type: 'exact', predictedHome: 2, predictedAway: 1 } });
  });

  it.each(['21', '2:1:3', '-1:2', ' 2:1', '2:1 ', 'a:b', ''])(
    'rejects malformed exact score %p',
    (value) => {
      const result = parsePickInput({ type: 'exact', value });
      expect(result.ok).toBe(false);
    },
  );

  it.each(['99999999999999999999:1', '1:99999999999999999999'])(
    'rejects an absurdly large score that would lose integer precision: %p',
    (value) => {
      const result = parsePickInput({ type: 'exact', value });
      expect(result.ok).toBe(false);
    },
  );

  it('rejects an unknown type', () => {
    const result = parsePickInput({ type: 'guess', value: 'home' });
    expect(result.ok).toBe(false);
  });

  it('rejects a missing type', () => {
    const result = parsePickInput({ type: undefined, value: 'home' });
    expect(result.ok).toBe(false);
  });

  it('rejects a missing value', () => {
    const result = parsePickInput({ type: 'result', value: undefined });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-string value', () => {
    const result = parsePickInput({ type: 'exact', value: 21 });
    expect(result.ok).toBe(false);
  });

  it('rejects an unrecognised result outcome string', () => {
    const result = parsePickInput({ type: 'result', value: 'homee' });
    expect(result.ok).toBe(false);
  });
});
