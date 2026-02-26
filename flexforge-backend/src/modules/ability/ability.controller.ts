import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AbilityService } from './ability.service';

@Controller('ability')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class AbilityController {
  constructor(private readonly abilityService: AbilityService) {}

  @Get('profile')
  async getProfile(
    @Request() req,
    @Query('skillType') skillType?: string,
  ) {
    const profile = await this.abilityService.getProfile(
      req.user.id,
      skillType,
    );
    return { profile };
  }

  @Get('timeline')
  async getTimeline(
    @Request() req,
    @Query('dimensionId') dimensionId: string,
    @Query('limit') limit?: string,
  ) {
    const timeline = await this.abilityService.getTimeline(
      req.user.id,
      dimensionId,
      limit ? parseInt(limit, 10) : 20,
    );
    return { timeline };
  }
}
