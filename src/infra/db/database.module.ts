import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely } from 'kysely';
import { createDb } from './create-db';
import { Database } from './schema';

export const KYSELY = Symbol('KYSELY');

@Injectable()
class KyselyLifecycle implements OnModuleDestroy {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: KYSELY,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Kysely<Database> => {
        const connectionString = config.getOrThrow<string>('DATABASE_URL');
        return createDb(connectionString);
      },
    },
    KyselyLifecycle,
  ],
  exports: [KYSELY],
})
export class DatabaseModule {}
