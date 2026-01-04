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
  async getActive(@Request() req) {
    const session = await this.sessionService.getActiveSession(req.user.id);

    if (!session) {
      return { message: 'No active session', session: null };
    }

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
   * POST /api/v1/sessions/:id/days/:dayNumber/start
   * Start a day - generates full day content (Phase 2)
   * Day 1: Always available
   * Day 2+: Requires previous day's practice project submitted
   */
  @Post(':id/days/:dayNumber/start')
  async startDay(
    @Request() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
  ) {
    const result = await this.sessionService.startDay(
      id,
      req.user.id,
      parseInt(dayNumber, 10),
    );

    return {
      message: `Day ${dayNumber} started successfully`,
      dayContent: result.dayContent,
      tokensUsed: result.tokensUsed,
    };
  }

  /**
   * POST /api/v1/sessions/:id/days/:dayNumber/skip-test
   * Submit skip test answers to skip a day
   * If passed (2/3 correct), day is marked as skipped/mastered
   */
  @Post(':id/days/:dayNumber/skip-test')
  async submitSkipTest(
    @Request() req,
    @Param('id') id: string,
    @Param('dayNumber') dayNumber: string,
    @Body() body: { answers: string[] },
  ) {
    const result = await this.sessionService.submitSkipTest(
      id,
      req.user.id,
      parseInt(dayNumber, 10),
      body.answers,
    );

    return {
      passed: result.passed,
      correctCount: result.correctCount,
      totalQuestions: result.totalQuestions,
      message: result.passed
        ? `Congratulations! You've mastered Day ${dayNumber} content. Moving to next day.`
        : `You got ${result.correctCount}/${result.totalQuestions} correct. Need ${result.passThreshold} to skip.`,
      nextDayUnlocked: result.passed,
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
}