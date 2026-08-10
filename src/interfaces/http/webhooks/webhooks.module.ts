import { Module } from '@nestjs/common';
import { Kysely } from 'kysely';
import Redis from 'ioredis';
import { KYSELY } from '../../../infra/db/database.module';
import { Database } from '../../../infra/db/schema';
import { REDIS } from '../../../infra/redis/redis.module';
import { KyselySettlementRepository } from '../../../infra/db/settlement-repository';
import { PostgresLeaderboardRepository } from '../../../infra/db/leaderboard-repository';
import { RedisLeaderboardRepository } from '../../../infra/redis/redis-leaderboard-repository';
import { WebhooksController } from './webhooks.controller';
import { LEADERBOARD_UPDATER, SETTLEMENT_REPOSITORY } from './webhooks.tokens';

@Module({
  controllers: [WebhooksController],
  providers: [
    {
      provide: SETTLEMENT_REPOSITORY,
      inject: [KYSELY],
      useFactory: (db: Kysely<Database>): KyselySettlementRepository => new KyselySettlementRepository(db),
    },
    {
      provide: LEADERBOARD_UPDATER,
      inject: [REDIS, KYSELY],
      useFactory: (redis: Redis, db: Kysely<Database>): RedisLeaderboardRepository => {
        const postgres = new PostgresLeaderboardRepository(db);
        return new RedisLeaderboardRepository(redis, postgres, postgres);
      },
    },
  ],
})
export class WebhooksModule {}
