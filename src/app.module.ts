import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infra/db/database.module';
import { HealthController } from './interfaces/http/health/health.controller';
import { PicksModule } from './interfaces/http/picks/picks.module';
import { WebhooksModule } from './interfaces/http/webhooks/webhooks.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, PicksModule, WebhooksModule],
  controllers: [HealthController],
})
export class AppModule {}
