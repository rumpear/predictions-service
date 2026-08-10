import { Pick } from '../../domain/pick';

export type InsertPickOutcome =
  | { kind: 'created'; pickId: string }
  | { kind: 'rejected_unknown_match' }
  | { kind: 'rejected_not_open' }
  | { kind: 'rejected_duplicate' };

export interface InsertPickParams {
  userId: string;
  matchId: string;
  pick: Pick;
}

export interface PicksRepository {
  insertPickIfAllowed(params: InsertPickParams): Promise<InsertPickOutcome>;
}
