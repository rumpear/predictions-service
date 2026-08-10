import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createPick } from '../../../app/picks/create-pick';
import { PicksRepository } from '../../../app/picks/picks-repository.port';
import { PICKS_REPOSITORY } from './picks.tokens';

@Controller('picks')
export class PicksController {
  constructor(@Inject(PICKS_REPOSITORY) private readonly repository: PicksRepository) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown): Promise<void> {
    const result = await createPick({ repository: this.repository }, body);

    switch (result.outcome) {
      case 'created':
        return;
      case 'invalid':
        throw new BadRequestException(result.error);
      case 'unknown_match':
        throw new NotFoundException('unknown match');
      case 'not_open_for_picks':
        throw new UnprocessableEntityException('match is not open for picks');
      case 'duplicate':
        throw new ConflictException('duplicate pick for this user, match, and type');
    }
  }
}
