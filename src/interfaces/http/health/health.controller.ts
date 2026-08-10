import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'kysely';
import { Kysely } from 'kysely';
import { KYSELY } from '../../../infra/db/database.module';
import { Database } from '../../../infra/db/schema';

@Controller('health')
export class HealthController {
  constructor(@Inject(KYSELY) private readonly db: Kysely<Database>) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    await sql`select 1`.execute(this.db);
    return { status: 'ok' };
  }
}
