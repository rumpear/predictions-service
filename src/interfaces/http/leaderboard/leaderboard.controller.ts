import { Controller, Get, Inject, Query } from '@nestjs/common';
import { getLeaderboard, GetLeaderboardResult } from '../../../app/leaderboard/get-leaderboard';
import { LeaderboardRepository } from '../../../app/leaderboard/leaderboard-repository.port';
import { LEADERBOARD_REPOSITORY } from './leaderboard.tokens';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(@Inject(LEADERBOARD_REPOSITORY) private readonly repository: LeaderboardRepository) {}

  @Get()
  async get(@Query('userId') userId?: string): Promise<GetLeaderboardResult> {
    return getLeaderboard({ repository: this.repository }, userId);
  }
}
