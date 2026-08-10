import { isPickAllowed } from '../../../src/domain/kickoff-policy';
import { Clock } from '../../../src/domain/clock';

function fixedClock(at: Date): Clock {
  return { now: () => at };
}

describe('isPickAllowed', () => {
  const kickoffAt = new Date('2026-08-10T18:00:00.000Z');

  it('allows a pick submitted 1 second before kickoff', () => {
    const clock = fixedClock(new Date(kickoffAt.getTime() - 1000));
    expect(isPickAllowed(clock, kickoffAt)).toBe(true);
  });

  it('rejects a pick submitted exactly at kickoff (exclusive boundary)', () => {
    const clock = fixedClock(new Date(kickoffAt.getTime()));
    expect(isPickAllowed(clock, kickoffAt)).toBe(false);
  });

  it('rejects a pick submitted after kickoff', () => {
    const clock = fixedClock(new Date(kickoffAt.getTime() + 1000));
    expect(isPickAllowed(clock, kickoffAt)).toBe(false);
  });
});
