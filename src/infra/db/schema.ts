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

export interface Database {
  users: UsersTable;
  matches: MatchesTable;
  picks: PicksTable;
}
