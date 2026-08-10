import { scorePick } from '../../../src/domain/scoring';
import { Pick } from '../../../src/domain/pick';

describe('scorePick', () => {
  const cases: Array<{
    name: string;
    pick: Pick;
    result: { homeScore: number; awayScore: number };
    expected: number;
  }> = [
    {
      name: 'result pick, correct home outcome',
      pick: { type: 'result', predictedOutcome: 'home' },
      result: { homeScore: 2, awayScore: 1 },
      expected: 10,
    },
    {
      name: 'result pick, correct away outcome',
      pick: { type: 'result', predictedOutcome: 'away' },
      result: { homeScore: 0, awayScore: 3 },
      expected: 10,
    },
    {
      name: 'result pick, correct draw outcome',
      pick: { type: 'result', predictedOutcome: 'draw' },
      result: { homeScore: 1, awayScore: 1 },
      expected: 10,
    },
    {
      name: 'result pick, incorrect outcome',
      pick: { type: 'result', predictedOutcome: 'home' },
      result: { homeScore: 0, awayScore: 0 },
      expected: 0,
    },
    {
      name: 'exact pick, correct 0:0 draw',
      pick: { type: 'exact', predictedHome: 0, predictedAway: 0 },
      result: { homeScore: 0, awayScore: 0 },
      expected: 30,
    },
    {
      name: 'exact pick, correct high score',
      pick: { type: 'exact', predictedHome: 15, predictedAway: 12 },
      result: { homeScore: 15, awayScore: 12 },
      expected: 30,
    },
    {
      name: 'exact pick, correct outcome but wrong score never falls back to 10',
      pick: { type: 'exact', predictedHome: 2, predictedAway: 1 },
      result: { homeScore: 3, awayScore: 1 },
      expected: 0,
    },
    {
      name: 'exact pick, wrong outcome and wrong score',
      pick: { type: 'exact', predictedHome: 2, predictedAway: 1 },
      result: { homeScore: 0, awayScore: 2 },
      expected: 0,
    },
  ];

  it.each(cases)('$name', ({ pick, result, expected }) => {
    expect(scorePick(pick, result)).toBe(expected);
  });
});
