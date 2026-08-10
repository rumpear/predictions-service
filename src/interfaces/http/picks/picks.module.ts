import { Module } from '@nestjs/common';
import { Kysely } from 'kysely';
import { KYSELY } from '../../../infra/db/database.module';
import { Database } from '../../../infra/db/schema';
import { KyselyPicksRepository } from '../../../infra/db/picks-repository';
import { PicksController } from './picks.controller';
import { PICKS_REPOSITORY } from './picks.tokens';

@Module({
  controllers: [PicksController],
  providers: [
    {
      provide: PICKS_REPOSITORY,
      inject: [KYSELY],
      useFactory: (db: Kysely<Database>): KyselyPicksRepository => new KyselyPicksRepository(db),
    },
  ],
})
export class PicksModule {}
