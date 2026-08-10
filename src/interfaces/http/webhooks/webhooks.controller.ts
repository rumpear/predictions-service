import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { settleMatch } from '../../../app/settlement/settle-match';
import { SettlementRepository } from '../../../app/settlement/settlement-repository.port';
import { LeaderboardUpdater } from '../../../app/leaderboard/leaderboard-updater.port';
import { LEADERBOARD_UPDATER, SETTLEMENT_REPOSITORY } from './webhooks.tokens';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    @Inject(SETTLEMENT_REPOSITORY) private readonly repository: SettlementRepository,
    @Inject(LEADERBOARD_UPDATER) private readonly leaderboardUpdater: LeaderboardUpdater,
  ) {}

  @Post('match-finished')
  @HttpCode(HttpStatus.OK)
  async matchFinished(@Body() body: unknown): Promise<void> {
    const result = await settleMatch({ repository: this.repository, leaderboardUpdater: this.leaderboardUpdater }, body);

    switch (result.outcome) {
      case 'processed':
        return;
      case 'invalid':
        throw new BadRequestException(result.error);
      case 'unknown_match':
        throw new NotFoundException('unknown match');
    }
  }
}
