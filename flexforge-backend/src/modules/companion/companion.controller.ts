import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanionService, CompanionContext } from './companion.service';

@Controller('companion')
@UseGuards(JwtAuthGuard)
export class CompanionController {
  constructor(private readonly companionService: CompanionService) {}

  /**
   * Get personalized greeting for the user
   */
  @Get('greeting')
  async getGreeting(@Request() req) {
    const context = await this.companionService.getUserContext(req.user.id);
    return this.companionService.getGreeting(context);
  }

  /**
   * Get progress message based on current progress
   */
  @Post('progress')
  async getProgress(
    @Request() req,
    @Body() body: { progress: number; topic?: string },
  ) {
    const baseContext = await this.companionService.getUserContext(req.user.id);
    const context: CompanionContext = {
      ...baseContext,
      currentProgress: body.progress,
      currentTopic: body.topic,
    };
    return this.companionService.getProgressMessage(context);
  }

  /**
   * Get support message when struggling
   */
  @Post('support')
  async getSupport(
    @Request() req,
    @Body() body: { consecutiveFailures?: number; topic?: string },
  ) {
    const baseContext = await this.companionService.getUserContext(req.user.id);
    const context: CompanionContext = {
      ...baseContext,
      consecutiveFailures: body.consecutiveFailures,
      currentTopic: body.topic,
      recentStruggle: true,
    };
    return this.companionService.getStruggleSupport(context);
  }

  /**
   * Get celebration message for achievements
   */
  @Post('celebrate')
  async getCelebration(
    @Request() req,
    @Body()
    body: {
      type:
        | 'quickWin'
        | 'streakMilestone'
        | 'newSkill'
        | 'personalBest'
        | 'moduleComplete';
      skill?: string;
      topic?: string;
    },
  ) {
    const baseContext = await this.companionService.getUserContext(req.user.id);
    const context: CompanionContext = {
      ...baseContext,
      currentTopic: body.topic,
    };
    return this.companionService.getCelebration(body.type, context, {
      skill: body.skill,
    });
  }

  /**
   * Detect mood and get appropriate response
   */
  @Post('mood')
  async detectMoodAndRespond(
    @Request() req,
    @Body() body: { message: string; topic?: string },
  ) {
    const baseContext = await this.companionService.getUserContext(req.user.id);
    const mood = this.companionService.detectMood(body.message);

    const context: CompanionContext = {
      ...baseContext,
      mood,
      currentTopic: body.topic,
    };

    const response = this.companionService.getEmotionalResponse(context);

    return {
      detectedMood: mood,
      ...response,
    };
  }

  /**
   * Get nudge message for re-engagement
   */
  @Post('nudge')
  async getNudge(
    @Request() req,
    @Body()
    body: {
      type: 'idle' | 'suggestion' | 'reviewReminder';
      suggestion?: string;
      topic?: string;
    },
  ) {
    const baseContext = await this.companionService.getUserContext(req.user.id);
    const context: CompanionContext = {
      ...baseContext,
      currentTopic: body.topic,
    };
    return this.companionService.getNudge(body.type, context, {
      suggestion: body.suggestion,
    });
  }

  /**
   * Get session sign-off message
   */
  @Get('signoff')
  async getSignOff(@Request() req) {
    const context = await this.companionService.getUserContext(req.user.id);
    return this.companionService.getSignOff(context);
  }

  /**
   * Get companion system prompt for AI integration
   */
  @Post('system-prompt')
  async getSystemPrompt(
    @Request() req,
    @Body() body: { topic?: string; progress?: number },
  ) {
    const baseContext = await this.companionService.getUserContext(req.user.id);
    const context: CompanionContext = {
      ...baseContext,
      currentTopic: body.topic,
      currentProgress: body.progress,
    };
    return {
      systemPrompt: this.companionService.getCompanionSystemPrompt(context),
    };
  }

  /**
   * Get full companion context for the user
   */
  @Get('context')
  async getContext(@Request() req) {
    return this.companionService.getUserContext(req.user.id);
  }
}
