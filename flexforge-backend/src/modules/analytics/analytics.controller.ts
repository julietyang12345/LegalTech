import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { IsString, IsObject, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { AnalyticsService } from './analytics.service';

class TrackEventDto {
  @IsString()
  action: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

// Allowed actions that can be tracked from the frontend
const ALLOWED_FRONTEND_ACTIONS = [
  // Onboarding events
  'onboarding_goal_submitted',
  'onboarding_direction_selected',
  'onboarding_feeling_submitted',
  // Session step events
  'session_step_viewed',
  'session_step_completed',
];

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * POST /api/v1/analytics/track
   * Track frontend events (onboarding steps, user actions)
   */
  @Post('track')
  @HttpCode(HttpStatus.OK)
  async trackEvent(
    @Body() dto: TrackEventDto,
    @CurrentUser() user: User,
  ): Promise<{ success: boolean }> {
    // Validate action is allowed
    if (!ALLOWED_FRONTEND_ACTIONS.includes(dto.action)) {
      throw new BadRequestException(
        `Invalid action. Allowed: ${ALLOWED_FRONTEND_ACTIONS.join(', ')}`,
      );
    }

    await this.analyticsService.trackEvent(
      user.id,
      dto.action,
      dto.metadata || {},
    );

    return { success: true };
  }
}
