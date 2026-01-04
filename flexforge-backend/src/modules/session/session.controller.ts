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
}