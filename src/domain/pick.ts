export type Outcome = 'home' | 'away' | 'draw';

export type Pick =
  | { type: 'result'; predictedOutcome: Outcome }
  | { type: 'exact'; predictedHome: number; predictedAway: number };
