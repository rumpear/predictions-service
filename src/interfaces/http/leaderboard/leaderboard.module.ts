import { Module } from '@nestjs/common';
import { Kysely } from 'kysely';
import Redis from 'ioredis';
import { KYSELY } from '../../../infra/db/database.module';
import { Database } from '../../../infra/db/schema';
import { REDIS } from '../../../infra/redis/redis.module';
import { PostgresLeaderboardRepository } from '../../../infra/db/leaderboard-repository';
import { RedisLeaderboardRepository } from '../../../infra/redis/redis-leaderboard-repository';
import { LeaderboardController } from './leaderboard.controller';
import { LEADERBOARD_REPOSITORY } from './leaderboard.tokens';

@Module({
  controllers: [LeaderboardController],
  providers: [
    {
      provide: LEADERBOARD_REPOSITORY,
      inject: [REDIS, KYSELY],
      useFactory: (redis: Redis, db: Kysely<Database>): RedisLeaderboardRepository => {
        const postgres = new PostgresLeaderboardRepository(db);
        return new RedisLeaderboardRepository(redis, postgres, postgres);
      },
    },
  ],
})
export class LeaderboardModule {}
