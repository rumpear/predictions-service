import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infra/db/database.module';
import { RedisModule } from './infra/redis/redis.module';
import { HealthController } from './interfaces/http/health/health.controller';
import { PicksModule } from './interfaces/http/picks/picks.module';
import { WebhooksModule } from './interfaces/http/webhooks/webhooks.module';
import { LeaderboardModule } from './interfaces/http/leaderboard/leaderboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    RedisModule,
    PicksModule,
    WebhooksModule,
    LeaderboardModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
