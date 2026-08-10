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

  it('accepts a valid exact pick', () => {
    const result = parsePickInput({ type: 'exact', value: '2:1' });
    expect(result).toEqual({ ok: true, pick: { type: 'exact', predictedHome: 2, predictedAway: 1 } });
  });

  it('accepts an exact score of 0:0', () => {
    const result = parsePickInput({ type: 'exact', value: '0:0' });
    expect(result).toEqual({ ok: true, pick: { type: 'exact', predictedHome: 0, predictedAway: 0 } });
  });

  it('accepts an exact score with a leading zero, per the spec regex ^\\d{1,2}:\\d{1,2}$', () => {
    const result = parsePickInput({ type: 'exact', value: '02:1' });
    expect(result).toEqual({ ok: true, pick: { type: 'exact', predictedHome: 2, predictedAway: 1 } });
  });

  it.each(['21', '2:1:3', '-1:2', ' 2:1', '2:1 ', 'a:b', '', '100:1', '1:100'])(
    'rejects malformed exact score %p',
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
