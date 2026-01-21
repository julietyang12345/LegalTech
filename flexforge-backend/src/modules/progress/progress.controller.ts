import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ProgressService } from './progress.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanionService, CompanionContext } from '../companion/companion.service';

@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(
    private progressService: ProgressService,
    private companionService: CompanionService,
  ) {}

  @Get('session/:sessionId')
  async getSessionProgress(@Request() req, @Param('sessionId') sessionId: string) {
    const progress = await this.progressService.findBySession(sessionId, req.user.id);
    return { progress };
  }

  @Get('session/:sessionId/stats')
  async getStats(@Request() req, @Param('sessionId') sessionId: string) {
    const stats = await this.progressService.getStats(sessionId, req.user.id);
    return { stats };
  }

  @Patch('session/:sessionId/task/:taskId')
  async updateTask(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Param('taskId') taskId: string,
    @Body() updates: { completed?: boolean; confidenceScore?: number; timeSpentMinutes?: number; notes?: string; topic?: string },
  ) {
    const progress = await this.progressService.updateTask(
      sessionId,
      taskId,
      req.user.id,
      updates,
    );

    // Get companion context for personalized response
    const companionContext = await this.companionService.getUserContext(req.user.id);
    const enrichedContext: CompanionContext = {
      ...companionContext,
      currentTopic: updates.topic,
    };

    // Add companion message based on completion
    let companionMessage = null;
    if (updates.completed) {
      companionMessage = this.companionService.getCelebration('quickWin', enrichedContext);
    } else if (updates.confidenceScore && updates.confidenceScore < 3) {
      companionMessage = this.companionService.getStruggleSupport({
        ...enrichedContext,
        recentStruggle: true,
      });
    }

    return {
      message: 'Progress updated successfully',
      progress,
      companionMessage,
    };
  }

  /**
   * Submit answer and get companion feedback
   */
  @Post('session/:sessionId/answer')
  async submitAnswer(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Body() body: {
      taskId: string;
      answer: string;
      topic?: string;
      isCorrect?: boolean;
      consecutiveFailures?: number;
    },
  ) {
    // Get companion context for personalized response
    const companionContext = await this.companionService.getUserContext(req.user.id);
    const enrichedContext: CompanionContext = {
      ...companionContext,
      currentTopic: body.topic,
    };

    // Update progress
    const progress = await this.progressService.updateTask(
      sessionId,
      body.taskId,
      req.user.id,
      {
        completed: body.isCorrect,
        submittedCode: body.answer,
      },
    );

    // Add companion response based on result
    let companionMessage;
    if (body.isCorrect) {
      companionMessage = this.companionService.getCelebration('quickWin', enrichedContext);
    } else {
      // Track failures for support
      companionMessage = this.companionService.getStruggleSupport({
        ...enrichedContext,
        consecutiveFailures: body.consecutiveFailures || 1,
        recentStruggle: true,
      });
    }

    return {
      correct: body.isCorrect,
      progress,
      companionMessage,
    };
  }

  /**
   * Get companion encouragement for current session
   */
  @Get('session/:sessionId/companion')
  async getCompanionEncouragement(
    @Request() req,
    @Param('sessionId') sessionId: string,
  ) {
    const stats = await this.progressService.getStats(sessionId, req.user.id);
    const companionContext = await this.companionService.getUserContext(req.user.id);

    const enrichedContext: CompanionContext = {
      ...companionContext,
      currentProgress: stats.completionPercentage,
    };

    const progressMessage = this.companionService.getProgressMessage(enrichedContext);

    return {
      stats,
      companionMessage: progressMessage,
    };
  }

  /**
   * AI-powered evaluation for open-ended questions
   * Pro users: Unlimited | Free users: 1/day
   */
  @Post('evaluate-open-ended')
  async evaluateOpenEnded(
    @Request() req,
    @Body() body: {
      questionId: string;
      question: string;
      category: string;
      scenario?: string;
      constraints?: string[];
      response: string;
      evaluationDimensions: {
        id: string;
        label: string;
        hint: string;
        required?: boolean;
        keywords?: string[];
      }[];
    },
  ) {
    return this.progressService.evaluateOpenEndedWithAI(req.user.id, body);
  }

  /**
   * Get remaining AI evaluations for today
   */
  @Get('ai-evaluations/remaining')
  async getAIEvaluationRemaining(@Request() req) {
    return this.progressService.getAIEvaluationRemaining(req.user.id);
  }
}
