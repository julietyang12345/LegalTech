import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { OnboardingService } from './onboarding.service';
import { SkillDetectorService } from '../curriculum/services/skill-detector.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  GenerateDirectionsDto,
  CompleteOnboardingDto,
  DirectionsResponse,
} from '../curriculum/types/learner-prefs.interface';

class ClassifySkillDto {
  @IsString()
  skillName: string;
}

@Controller('onboarding')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly skillDetector: SkillDetectorService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  /**
   * Generate 4-6 learning directions based on user's goal.
   * Can be called multiple times with refinement context to regenerate.
   */
  @Post('generate-directions')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async generateDirections(
    @Body() dto: GenerateDirectionsDto,
    @CurrentUser() user: User,
  ): Promise<DirectionsResponse> {
    // Content moderation check first
    const moderationResult = await this.skillDetector.moderateContent(dto.goal);
    if (!moderationResult.isAllowed) {
      throw new BadRequestException({
        message: 'This topic violates AI content policy. Please choose a different learning goal.',
        error: 'AI_CONTENT_POLICY_VIOLATION',
        flaggedCategories: moderationResult.flaggedCategories,
      });
    }

    const result = await this.onboardingService.generateDirections(dto.goal, dto.refinement, dto.goalType);

    // Track directions shown
    await this.analyticsService.onboardingDirectionsShown(
      user.id,
      result.directions.length,
    );

    return result;
  }

  /**
   * Complete onboarding and save learner preferences.
   * Called after user selects a direction and depth.
   */
  @Post('complete')
  @HttpCode(HttpStatus.OK)
  async completeOnboarding(
    @Body() dto: CompleteOnboardingDto,
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    await this.onboardingService.savePreferences(user.id, dto);

    // Track onboarding completion (duration is tracked client-side)
    await this.analyticsService.onboardingCompleted(
      user.id,
      dto.durationSeconds || 0,
    );

    return { message: 'Onboarding completed successfully' };
  }

  /**
   * Check if user has completed onboarding.
   */
  @Get('status')
  async getOnboardingStatus(
    @CurrentUser() user: User,
  ): Promise<{ completedOnboarding: boolean; needsOnboarding: boolean }> {
    return this.onboardingService.getOnboardingStatus(user.id);
  }

  /**
   * Reset onboarding - clears learner preferences so user can start over.
   */
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async resetOnboarding(
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    await this.onboardingService.resetOnboarding(user.id);
    return { message: 'Onboarding reset successfully' };
  }

  /**
   * Skip onboarding - marks as complete with defaults for returning users.
   */
  @Post('skip')
  @HttpCode(HttpStatus.OK)
  async skipOnboarding(
    @CurrentUser() user: User,
  ): Promise<{ message: string }> {
    await this.onboardingService.skipOnboarding(user.id);
    return { message: 'Onboarding skipped successfully' };
  }

  /**
   * Classify a skill to determine if it supports project-based learning.
   * Used by onboarding UI to conditionally show learning style options.
   */
  @Post('classify-skill')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async classifySkill(
    @Body() dto: ClassifySkillDto,
  ): Promise<{ supportsProjectBased: boolean; skillType: string }> {
    return this.onboardingService.classifySkill(dto.skillName);
  }
}
