import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { IsString, IsObject, IsOptional } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { AnalyticsService } from './analytics.service';
import { AiService } from '../ai/ai.service';

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
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * GET /api/v1/analytics/spending
   * Get current AI spending status (requires admin secret)
   * Usage: GET /api/v1/analytics/spending?secret=YOUR_EDGE_SIGNING_SECRET
   */
  @Get('spending')
  async getSpendingStatus(
    @Query('secret') secret: string,
  ) {
    // Use EDGE_SIGNING_SECRET as admin auth (reuse existing secret)
    const adminSecret = this.configService.get<string>('EDGE_SIGNING_SECRET');
    if (!adminSecret || secret !== adminSecret) {
      throw new UnauthorizedException('Invalid admin secret');
    }

    const status = this.aiService.getSpendingStatus();
    return {
      ...status,
      percentUsed: status.daily.limit > 0 ? Math.round((status.daily.spending / status.daily.limit) * 100) : 0,
    };
  }

  /**
   * POST /api/v1/analytics/spending/reset
   * Reset daily spending counter (requires admin secret)
   */
  @Post('spending/reset')
  @HttpCode(HttpStatus.OK)
  async resetSpending(
    @Query('secret') secret: string,
  ): Promise<{ success: boolean; message: string }> {
    const adminSecret = this.configService.get<string>('EDGE_SIGNING_SECRET');
    if (!adminSecret || secret !== adminSecret) {
      throw new UnauthorizedException('Invalid admin secret');
    }

    this.aiService.resetSpending();
    return { success: true, message: 'Spending reset successfully' };
  }

  /**
   * GET /api/v1/analytics/spending/users
   * Get per-user daily AI spending (requires admin secret)
   * Usage: GET /api/v1/analytics/spending/users?secret=YOUR_EDGE_SIGNING_SECRET
   */
  @Get('spending/users')
  async getUsersSpending(
    @Query('secret') secret: string,
  ) {
    const adminSecret = this.configService.get<string>('EDGE_SIGNING_SECRET');
    if (!adminSecret || secret !== adminSecret) {
      throw new UnauthorizedException('Invalid admin secret');
    }

    const globalStatus = this.aiService.getSpendingStatus();
    const users = await this.analyticsService.getUsersDailySpending();

    return {
      globalSpending: globalStatus,
      users,
    };
  }

  /**
   * POST /api/v1/analytics/track
   * Track frontend events (onboarding steps, user actions)
   */
  @Post('track')
  @UseGuards(JwtAuthGuard)
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
