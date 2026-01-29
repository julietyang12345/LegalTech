import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { OnboardingService } from './onboarding.service';
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
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  /**
   * Generate 4-6 learning directions based on user's goal.
   * Can be called multiple times with refinement context to regenerate.
   */
  @Post('generate-directions')
  @HttpCode(HttpStatus.OK)
  async generateDirections(
    @Body() dto: GenerateDirectionsDto,
    @CurrentUser() _user: User, // Required for auth guard
  ): Promise<DirectionsResponse> {
    return this.onboardingService.generateDirections(dto.goal, dto.refinement);
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
   * Classify a skill to determine if it supports project-based learning.
   * Used by onboarding UI to conditionally show learning style options.
   */
  @Post('classify-skill')
  @HttpCode(HttpStatus.OK)
  async classifySkill(
    @Body() dto: ClassifySkillDto,
  ): Promise<{ supportsProjectBased: boolean; skillType: string }> {
    return this.onboardingService.classifySkill(dto.skillName);
  }
}
