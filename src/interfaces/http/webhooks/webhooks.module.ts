import { Module } from '@nestjs/common';
import { Kysely } from 'kysely';
import { KYSELY } from '../../../infra/db/database.module';
import { Database } from '../../../infra/db/schema';
import { KyselySettlementRepository } from '../../../infra/db/settlement-repository';
import { WebhooksController } from './webhooks.controller';
import { SETTLEMENT_REPOSITORY } from './webhooks.tokens';

@Module({
  controllers: [WebhooksController],
  providers: [
    {
      provide: SETTLEMENT_REPOSITORY,
      inject: [KYSELY],
      useFactory: (db: Kysely<Database>): KyselySettlementRepository => new KyselySettlementRepository(db),
    },
  ],
})
export class WebhooksModule {}
