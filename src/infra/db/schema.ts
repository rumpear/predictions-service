import { Generated } from 'kysely';

export interface UsersTable {
  id: string;
  created_at: Generated<Date>;
}

export interface MatchesTable {
  id: string;
  kickoff_at: Date;
  home_score: number | null;
  away_score: number | null;
  status: Generated<'scheduled' | 'finished'>;
  settled_at: Date | null;
}

export interface PicksTable {
  id: Generated<string>;
  user_id: string;
  match_id: string;
  type: 'result' | 'exact';
  predicted_outcome: 'home' | 'away' | 'draw' | null;
  predicted_home: number | null;
  predicted_away: number | null;
  created_at: Generated<Date>;
}

export interface SettlementsTable {
  id: Generated<string>;
  match_id: string;
  event_id: string;
  home_score: number;
  away_score: number;
  settled_at: Generated<Date>;
}

export interface PointAwardsTable {
  id: Generated<string>;
  pick_id: string;
  settlement_id: string;
  user_id: string;
  points: number;
  created_at: Generated<Date>;
}

export interface BalancesTable {
  user_id: string;
  points: Generated<string>;
}

export interface Database {
  users: UsersTable;
  matches: MatchesTable;
  picks: PicksTable;
  settlements: SettlementsTable;
  point_awards: PointAwardsTable;
  balances: BalancesTable;
}
