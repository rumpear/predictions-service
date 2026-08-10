import { parseMatchFinishedPayload } from '../../../src/domain/webhook-validation';

describe('parseMatchFinishedPayload', () => {
  it('accepts a valid payload', () => {
    const result = parseMatchFinishedPayload({
      matchId: 'match-1',
      eventId: 'evt-1',
      homeScore: 2,
      awayScore: 1,
    });

    expect(result).toEqual({
      ok: true,
      payload: { matchId: 'match-1', eventId: 'evt-1', homeScore: 2, awayScore: 1 },
    });
  });

  it('accepts 0:0', () => {
    const result = parseMatchFinishedPayload({ matchId: 'm', eventId: 'e', homeScore: 0, awayScore: 0 });
    expect(result.ok).toBe(true);
  });

  it('accepts scores beyond a two-digit range (no digit-length cap here — these are JSON numbers, not parsed strings)', () => {
    const result = parseMatchFinishedPayload({ matchId: 'm', eventId: 'e', homeScore: 150, awayScore: 3 });
    expect(result).toEqual({ ok: true, payload: { matchId: 'm', eventId: 'e', homeScore: 150, awayScore: 3 } });
  });

  it('rejects a missing matchId', () => {
    const result = parseMatchFinishedPayload({ eventId: 'e', homeScore: 1, awayScore: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects a missing eventId', () => {
    const result = parseMatchFinishedPayload({ matchId: 'm', homeScore: 1, awayScore: 0 });
    expect(result.ok).toBe(false);
  });

  it.each([1.5, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2', null, undefined])(
    'rejects an invalid homeScore: %p',
    (homeScore) => {
      const result = parseMatchFinishedPayload({ matchId: 'm', eventId: 'e', homeScore, awayScore: 0 });
      expect(result.ok).toBe(false);
    },
  );

  it.each([1.5, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2', null, undefined])(
    'rejects an invalid awayScore: %p',
    (awayScore) => {
      const result = parseMatchFinishedPayload({ matchId: 'm', eventId: 'e', homeScore: 0, awayScore });
      expect(result.ok).toBe(false);
    },
  );

  it('rejects a non-object body', () => {
    const result = parseMatchFinishedPayload(null);
    expect(result.ok).toBe(false);
  });
});
