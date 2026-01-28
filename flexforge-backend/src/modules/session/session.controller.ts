import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Header,
  Res,
} from '@nestjs/common';
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionController {
  constructor(private sessionService: SessionService) {}

  /**
   * POST /api/v1/sessions
   * Create new learning session with AI-generated curriculum
   */
  @Post()
  async create(@Request() req, @Body() createSessionDto: CreateSessionDto) {
    const result = await this.sessionService.create(
      req.user.id,
      createSessionDto,
    );

    return {
      message: 'Learning session created successfully',
      session: {
        id: result.session.id,
        skillName: result.session.skillName,
        durationDays: result.session.durationDays,
        currentDay: result.session.currentDay,
        curriculum: result.session.curriculum,
        status: result.session.status,
        startedAt: result.session.startedAt,
      },
      warnings: result.warnings,
      skillDetection: result.skillDetection,
    };
  }

  /**
   * GET /api/v1/sessions
   * Get all sessions for current user
   */
  @Get()
  async findAll(@Request() req) {
    const sessions = await this.sessionService.findAllByUser(req.user.id);

    return {
      count: sessions.length,
      sessions: sessions.map((s) => ({
        id: s.id,
        skillName: s.skillName,
        durationDays: s.durationDays,
        status: s.status,
        currentDay: s.currentDay,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      })),
    };
  }

  /**
   * GET /api/v1/sessions/active
   * Get current active session
   */
  @Get('active')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  async getActive(@Request() req, @Res({ passthrough: true }) res) {
    const session = await this.sessionService.getActiveSession(req.user.id);

    if (!session) {
      return { message: 'No active session', session: null };
    }

    console.log(
      `[getActive] Returning session ${session.id} with currentDay=${session.currentDay}`,
    );
    return { session };
  }

  /**
   * GET /api/v1/sessions/:id
   * Get single session by ID
   */
  @Get(':id')
  async findOne(@Request() req, @Param('id') id: string) {
    const session = await this.sessionService.findOne(id, req.user.id);
    return { session };
  }

  /**
   * GET /api/v1/sessions/:id/progress
   * Get session progress summary
   */
  @Get(':id/progress')
  async getProgress(@Request() req, @Param('id') id: string) {
    return this.sessionService.getProgressSummary(id, req.user.id);
  }

  /**
   * PATCH /api/v1/sessions/:id
   * Update session (status, mode, current day)
   */
  @Patch(':id')
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateSessionDto: UpdateSessionDto,
  ) {
    const session = await this.sessionService.update(
      id,
      req.user.id,
      updateSessionDto,
    );

    return {
      message: 'Session updated successfully',
      session,
    };
  }

  /**
   * DELETE /api/v1/sessions/:id
   * Delete session
   */
  @Delete(':id')
  async delete(@Request() req, @Param('id') id: string) {
    await this.sessionService.delete(id, req.user.id);
    return { message: 'Session deleted successfully' };
  }

  // ═══════════════════════════════════════════════════
  // TWO-PHASE CURRICULUM ENDPOINTS
  // ═══════════════════════════════════════════════════

  /**
   * POST /api/v1/sessions/:id/days/:dayNumber/start-core
   * Start a day - CORE content only (fast initial load)
   * Returns: prePrompt, video, foundationCards, task1
   */
  @Post(':id/days/:dayNumber/start-core')
  async startDayCore(
    @Request() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
    @Body() body?: { forceRegenerate?: boolean },
  ) {
    const result = await this.sessionService.startDayCore(
      id,
      req.user.id,
      parseInt(dayNumber, 10),
      body?.forceRegenerate,
    );

    return {
      message: `Day ${dayNumber} core content loaded`,
      coreContent: result.coreContent,
      tokensUsed: result.tokensUsed,
      fromCache: result.fromCache,
    };
  }

  /**
   * POST /api/v1/sessions/:id/days/:dayNumber/load-deferred
   * Load deferred content in background
   * Returns: reflection
   */
  @Post(':id/days/:dayNumber/load-deferred')
  async loadDayDeferred(
    @Request() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
  ) {
    const result = await this.sessionService.loadDayDeferred(
      id,
      req.user.id,
      parseInt(dayNumber, 10),
    );

    return {
      message: `Day ${dayNumber} deferred content loaded`,
      deferredContent: result.deferredContent,
      tokensUsed: result.tokensUsed,
      fromCache: result.fromCache,
    };
  }

  /**
   * POST /api/v1/sessions/:id/days/:dayNumber/practice/submit
   * Submit practice project answer - unlocks next day
   */
  @Post(':id/days/:dayNumber/practice/submit')
  async submitPracticeProject(
    @Request() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
    @Body() body: { answer: string; confidence?: number },
  ) {
    const result = await this.sessionService.submitPracticeProject(
      id,
      req.user.id,
      parseInt(dayNumber, 10),
      body.answer,
      body.confidence,
    );

    return {
      message: 'Practice project submitted successfully',
      nextDayUnlocked: result.nextDayUnlocked,
      feedback: result.feedback,
    };
  }

  /**
   * GET /api/v1/sessions/:id/days/:dayNumber
   * Get day details (if already loaded)
   */
  @Get(':id/days/:dayNumber')
  async getDayDetails(
    @Request() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
  ) {
    const result = await this.sessionService.getDayDetails(
      id,
      req.user.id,
      parseInt(dayNumber, 10),
    );

    return {
      day: result.day,
      status: result.status,
      detailsLoaded: result.detailsLoaded,
      content: result.content,
    };
  }

  /**
   * POST /api/v1/sessions/:id/days/:dayNumber/task-format
   * Get task in alternative format (quiz, fillBlank, or code)
   * Generates on-demand and caches for future use
   */
  @Post(':id/days/:dayNumber/task-format')
  async getAlternativeTaskFormat(
    @Request() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
    @Body() body: { format: 'code' | 'quiz' | 'fillBlank' },
  ) {
    const result = await this.sessionService.getAlternativeTaskFormat(
      id,
      req.user.id,
      parseInt(dayNumber, 10),
      body.format,
    );

    return {
      message: `Task converted to ${body.format} format`,
      task: result.task,
      tokensUsed: result.tokensUsed,
      fromCache: result.fromCache,
    };
  }

  /**
   * POST /api/v1/sessions/:id/days/:dayNumber/reflection
   * Save reflection data including confused concepts
   */
  @Post(':id/days/:dayNumber/reflection')
  async saveReflection(
    @Request() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
    @Body()
    body: {
      confidence: number;
      whatClicked?: string;
      whatsFoggy?: string;
      confusedConcepts?: string[];
      lockInSentence?: string;
      warmupPlan?: string;
      boostCompleted?: boolean;
      boostConcept?: string;
    },
  ) {
    const result = await this.sessionService.saveReflection(
      id,
      req.user.id,
      parseInt(dayNumber, 10),
      body,
    );

    return {
      message: 'Reflection saved successfully',
      saved: result.saved,
    };
  }

  /**
   * POST /api/v1/sessions/:id/days/:dayNumber/concept-boost
   * Generate a quick concept boost for a confused student
   */
  @Post(':id/days/:dayNumber/concept-boost')
  async generateConceptBoost(
    @Request() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
    @Body()
    body: {
      concept: string;
      originalExplanation: string;
    },
  ) {
    const result = await this.sessionService.generateConceptBoost(
      id,
      req.user.id,
      parseInt(dayNumber, 10),
      body.concept,
      body.originalExplanation,
    );

    return {
      message: 'Concept boost generated',
      boost: result.boost,
      tokensUsed: result.tokensUsed,
    };
  }

  /**
   * POST /api/v1/sessions/admin/clear-deferred
   * Clear all deferred content from all sessions (admin endpoint)
   */
  @Post('admin/clear-deferred')
  async clearAllDeferredContent(@Request() req) {
    const result = await this.sessionService.clearAllDeferredContent();
    return {
      message: 'All session deferred content cleared',
      ...result,
    };
  }
}
