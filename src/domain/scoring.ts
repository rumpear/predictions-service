import { Outcome, Pick } from './pick';

export interface MatchResult {
  homeScore: number;
  awayScore: number;
}

const OUTCOME_POINTS = 10;
const EXACT_SCORE_POINTS = 30;

function outcomeOf(result: MatchResult): Outcome {
  if (result.homeScore > result.awayScore) return 'home';
  if (result.awayScore > result.homeScore) return 'away';
  return 'draw';
}

export function scorePick(pick: Pick, result: MatchResult): number {
  if (pick.type === 'result') {
    return pick.predictedOutcome === outcomeOf(result) ? OUTCOME_POINTS : 0;
  }
  const isExactMatch = pick.predictedHome === result.homeScore && pick.predictedAway === result.awayScore;
  return isExactMatch ? EXACT_SCORE_POINTS : 0;
}
