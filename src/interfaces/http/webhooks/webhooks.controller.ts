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
import { SETTLEMENT_REPOSITORY } from './webhooks.tokens';

@Controller('webhooks')
export class WebhooksController {
  constructor(@Inject(SETTLEMENT_REPOSITORY) private readonly repository: SettlementRepository) {}

  @Post('match-finished')
  @HttpCode(HttpStatus.OK)
  async matchFinished(@Body() body: unknown): Promise<void> {
    const result = await settleMatch({ repository: this.repository }, body);

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
