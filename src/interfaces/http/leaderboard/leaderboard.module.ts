import { Module } from '@nestjs/common';
import { Kysely } from 'kysely';
import { KYSELY } from '../../../infra/db/database.module';
import { Database } from '../../../infra/db/schema';
import { PostgresLeaderboardRepository } from '../../../infra/db/leaderboard-repository';
import { LeaderboardController } from './leaderboard.controller';
import { LEADERBOARD_REPOSITORY } from './leaderboard.tokens';

@Module({
  controllers: [LeaderboardController],
  providers: [
    {
      provide: LEADERBOARD_REPOSITORY,
      inject: [KYSELY],
      useFactory: (db: Kysely<Database>): PostgresLeaderboardRepository => new PostgresLeaderboardRepository(db),
    },
  ],
})
export class LeaderboardModule {}
