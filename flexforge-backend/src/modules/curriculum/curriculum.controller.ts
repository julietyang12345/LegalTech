import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { QuotaTier } from '../../database/entities/user.entity';
import { CurriculumService } from './curriculum.service';
import { CurriculumCacheService } from './services/curriculum-cache.service';
import { SkillDetectorService } from './services/skill-detector.service';
import { UserService } from '../user/user.service';
import { GenerateCurriculumDto } from './dto/generate-curriculum.dto';
import {
  GenerateCurriculumWithCacheDto,
  RegenerateCurriculumDto,
  RecordCompletionDto,
  RecordBounceDto,
  RecordRegenerationDto,
  RefreshVideoDto,
  GetTranscriptSummaryDto,
  CurriculumCacheResponse,
} from './dto/curriculum-cache.dto';
import { VideoMatchingService } from './services/youtube/video-matching.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';

@Controller('curriculum')
@UseGuards(JwtAuthGuard)
export class CurriculumController {
  constructor(
    private curriculumService: CurriculumService,
    private cacheService: CurriculumCacheService,
    private videoMatcher: VideoMatchingService,
    private skillDetector: SkillDetectorService,
    private userService: UserService,
  ) {}

  /**
   * POST /api/v1/curriculum/generate
   * Generate full curriculum skeleton
   */
  @Post('generate')
  async generate(@Body() dto: GenerateCurriculumDto) {
    try {
      const result = await this.curriculumService.generateCurriculum(dto);

      return {
        message: 'Curriculum generated successfully',
        curriculum: result.curriculum,
        metadata: {
          tokensUsed: result.tokensUsed,
          cost: result.cost,
        },
      };
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to generate curriculum',
      );
    }
  }

  /**
   * POST /api/v1/curriculum/estimate-days
   * Get AI estimation for how many days a skill will take to learn
   */
  @Post('estimate-days')
  async estimateDays(@Body() body: { skillName: string }) {
    try {
      const result = await this.skillDetector.detectSkillType(body.skillName);

      return {
        skillType: result.skillType,
        complexity: result.complexity,
        estimatedDaysNeeded: result.estimatedDaysNeeded,
        reasoning: result.reasoning,
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'Failed to estimate days');
    }
  }

  /**
   * POST /api/v1/curriculum/ai-tutor
   * Ask the AI tutor for help with a task
   * Daily limits: FREE=5, PRO=10, PREMIUM/ADMIN=unlimited
   */
  @Post('ai-tutor')
  async askAiTutor(
    @Body()
    body: {
      message: string;
      dayNumber: number;
      context: {
        taskTitle?: string;
        taskDescription?: string;
        currentCode?: string;
        concept?: string;
      };
      conversationHistory?: Array<{ role: string; content: string }>;
    },
    @CurrentUser() user: User,
  ) {
    // Check daily AI tutor limit
    const dailyLimit = await this.userService.checkDailyAiTutorLimit(user.id);
    if (!dailyLimit.allowed) {
      throw new ForbiddenException(
        `Daily AI tutor limit reached (${dailyLimit.limit}/day). ` +
          (user.getEffectiveTier() === QuotaTier.FREE
            ? 'Upgrade to Pro for more messages.'
            : user.getEffectiveTier() === QuotaTier.PRO
              ? 'Upgrade to Premium for unlimited messages.'
              : 'Try again tomorrow.'),
      );
    }

    try {
      const result = await this.curriculumService.askAiTutor(body);

      // Increment daily usage after successful response
      await this.userService.incrementDailyAiTutorUsage(user.id);

      return {
        reply: result.reply,
        metadata: {
          tokensUsed: result.tokensUsed,
          cost: result.cost,
        },
        dailyUsage: {
          used: dailyLimit.used + 1,
          limit: dailyLimit.limit,
          remaining: Math.max(0, dailyLimit.remaining - 1),
        },
      };
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to get AI tutor response',
      );
    }
  }

  // ==========================================================================
  // CACHED CURRICULUM ENDPOINTS
  // ==========================================================================

  /**
   * POST /api/v1/curriculum/generate-cached
   * Generate curriculum with caching support
   * Returns cached content if available, otherwise generates new
   */
  @Post('generate-cached')
  async generateWithCache(
    @Body() dto: GenerateCurriculumWithCacheDto,
    @CurrentUser() user: User,
  ): Promise<CurriculumCacheResponse> {
    try {
      // Try to get from cache first
      const cached = await this.cacheService.tryGetFromCache(
        dto,
        user.id,
        dto.sessionId,
      );

      if (cached) {
        return {
          message: 'Curriculum retrieved from cache',
          curriculum: cached.curriculum,
          variantId: cached.variantId,
          fromCache: true,
          metadata: { cacheHit: true },
        };
      }

      // Check if we should skip caching (too many regens in this session)
      const skipCaching = await this.cacheService.shouldSkipCaching(
        dto.sessionId,
      );

      // Generate new curriculum
      const result = await this.curriculumService.generateCurriculum(
        dto,
        user.getEffectiveTier(),
      );

      // Cache if not skipping
      if (!skipCaching) {
        const cacheResult = await this.cacheService.cacheNewContent(
          dto,
          result.curriculum,
          user.id,
          dto.sessionId,
        );

        return {
          message: 'Curriculum generated successfully',
          curriculum: result.curriculum,
          variantId: cacheResult.variantId,
          fromCache: false,
          metadata: {
            tokensUsed: result.tokensUsed,
            cost: result.cost,
            cacheHit: false,
          },
          warnings: result.warnings,
        };
      }

      // Skipped caching due to too many regens
      return {
        message: 'Curriculum generated (caching skipped)',
        curriculum: result.curriculum,
        variantId: '', // No variant ID when not cached
        fromCache: false,
        metadata: {
          tokensUsed: result.tokensUsed,
          cost: result.cost,
        },
        warnings: result.warnings,
      };
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to generate curriculum',
      );
    }
  }

  /**
   * POST /api/v1/curriculum/regenerate
   * User clicked "Generate New" - records negative signal and generates new
   */
  @Post('regenerate')
  async regenerate(
    @Body() dto: RegenerateCurriculumDto,
    @CurrentUser() user: User,
  ): Promise<CurriculumCacheResponse> {
    try {
      // Record the negative signal (regeneration) for the previous variant
      await this.cacheService.markAsRegenerated(
        dto.previousVariantId,
        user.id,
        dto.sessionId,
      );

      // Check if we should skip caching
      const skipCaching = await this.cacheService.shouldSkipCaching(
        dto.sessionId,
      );

      // Generate new curriculum
      const result = await this.curriculumService.generateCurriculum(
        dto,
        user.getEffectiveTier(),
      );

      if (!skipCaching) {
        const cacheResult = await this.cacheService.cacheNewContent(
          dto,
          result.curriculum,
          user.id,
          dto.sessionId,
        );

        return {
          message: 'Curriculum regenerated successfully',
          curriculum: result.curriculum,
          variantId: cacheResult.variantId,
          fromCache: false,
          metadata: {
            tokensUsed: result.tokensUsed,
            cost: result.cost,
          },
          warnings: result.warnings,
        };
      }

      return {
        message: 'Curriculum regenerated (caching skipped)',
        curriculum: result.curriculum,
        variantId: '',
        fromCache: false,
        metadata: {
          tokensUsed: result.tokensUsed,
          cost: result.cost,
        },
        warnings: result.warnings,
      };
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to regenerate curriculum',
      );
    }
  }

  /**
   * POST /api/v1/curriculum/mark-regenerated
   * Records regeneration signal without generating new curriculum
   * User will navigate to /start to create new session with possibly different params
   */
  @Post('mark-regenerated')
  async markRegenerated(
    @Body() dto: RecordRegenerationDto,
    @CurrentUser() user: User,
  ) {
    try {
      await this.cacheService.markAsRegenerated(
        dto.previousVariantId,
        user.id,
        dto.sessionId,
      );
      return { message: 'Regeneration signal recorded' };
    } catch (error) {
      // Don't fail the request if recording fails
      return { message: 'Signal noted' };
    }
  }

  /**
   * POST /api/v1/curriculum/complete-day
   * User completed Day 1 - records positive signal
   */
  @Post('complete-day')
  async completeDay(
    @Body() dto: RecordCompletionDto,
    @CurrentUser() user: User,
  ) {
    try {
      await this.cacheService.recordDay1Completion(
        dto.variantId,
        user.id,
        dto.sessionId,
      );
      return { message: 'Completion recorded' };
    } catch (error) {
      // Don't fail the request if recording fails
      return { message: 'Completion noted' };
    }
  }

  /**
   * POST /api/v1/curriculum/bounce
   * User bounced (left quickly) - records negative signal
   * Called via navigator.sendBeacon from frontend
   */
  @Post('bounce')
  async recordBounce(@Body() dto: RecordBounceDto, @CurrentUser() user: User) {
    try {
      await this.cacheService.recordBounce(
        dto.variantId,
        user.id,
        dto.sessionId,
      );
      return { message: 'Bounce recorded' };
    } catch (error) {
      return { message: 'Bounce noted' };
    }
  }

  /**
   * GET /api/v1/curriculum/cache-stats
   * Get cache statistics (admin/debug endpoint)
   */
  @Get('cache-stats')
  async getCacheStats() {
    const stats = await this.cacheService.getCacheStats();
    return { stats };
  }

  /**
   * POST /api/v1/curriculum/clear-cache
   * Clear all curriculum and day content caches (admin endpoint)
   */
  @Post('clear-cache')
  async clearAllCache() {
    const result = await this.cacheService.clearAllCache();
    return { message: 'All caches cleared', ...result };
  }

  /**
   * POST /api/v1/curriculum/refresh-video
   * Find a new video for a day using Layer 3 deep verification
   * Called when user exhausts the alternative and clicks "Find New Video" again
   */
  @Post('refresh-video')
  async refreshVideo(@Body() dto: RefreshVideoDto) {
    try {
      const levelMap: Record<string, 'beginner' | 'intermediate' | 'advanced'> =
        {
          BEGINNER: 'beginner',
          INTERMEDIATE: 'intermediate',
          ADVANCED: 'advanced',
        };

      const videoResult = await this.videoMatcher.findBestVideo(
        {
          concept: dto.concept,
          userSlot: 6, // Default 6 minutes
          userLevel: levelMap[dto.skillLevel] || 'beginner',
        },
        {
          deepVerify: true, // Layer 3 AI verification
          excludeVideoIds: dto.excludeVideoIds || [],
        },
      );

      if (!videoResult.success || !videoResult.video) {
        throw new BadRequestException(
          videoResult.error || 'No suitable video found',
        );
      }

      const video = videoResult.video;
      const watchPlan = videoResult.watchPlan;

      // Build alternatives array (up to 2)
      const alternatives = (videoResult.alternatives || [])
        .slice(0, 2)
        .map((alt) => ({
          videoId: alt.video.videoId,
          title: alt.video.title,
          channelName: alt.video.channelName,
          startTime: this.secondsToTime(
            alt.watchPlan.primarySegment.startSeconds,
          ),
          endTime: this.secondsToTime(alt.watchPlan.primarySegment.endSeconds),
          estimatedMinutes: Math.round(
            (alt.watchPlan.primarySegment.endSeconds -
              alt.watchPlan.primarySegment.startSeconds) /
              60,
          ),
          differentiator: alt.differentiator,
          matchPercent: alt.matchPercent,
          contentType: alt.contentType,
        }));

      return {
        message: 'New video found',
        video: {
          videoId: video.videoId,
          title: video.title,
          channelName: video.channelName,
          url: `https://www.youtube.com/watch?v=${video.videoId}`,
          startTime: watchPlan
            ? this.secondsToTime(watchPlan.primarySegment.startSeconds)
            : undefined,
          endTime: watchPlan
            ? this.secondsToTime(watchPlan.primarySegment.endSeconds)
            : undefined,
          watchInstructions: watchPlan?.watchInstructions,
          estimatedMinutes: watchPlan
            ? Math.round(
                (watchPlan.primarySegment.endSeconds -
                  watchPlan.primarySegment.startSeconds) /
                  60,
              )
            : 6,
          matchPercent: videoResult.matchPercent,
          keyTopics: video.chapters?.slice(0, 5).map((c) => c.title),
          whyThisVideo: videoResult.whyThisVideo,
          contentType: videoResult.contentType,
          alternatives,
        },
      };
    } catch (error) {
      console.error('[refresh-video] Error:', error.message);
      throw new BadRequestException(
        error.message || 'Failed to find new video',
      );
    }
  }

  /**
   * POST /api/v1/curriculum/transcript-summary
   * Get AI-generated summary of a YouTube video's transcript
   * PRO feature only
   */
  @Post('transcript-summary')
  async getTranscriptSummary(
    @Body() dto: GetTranscriptSummaryDto,
    @CurrentUser() user: User,
  ) {
    // Check PRO tier access
    const tierHierarchy = {
      [QuotaTier.FREE]: 0,
      [QuotaTier.PRO]: 1,
      [QuotaTier.PREMIUM]: 2,
      [QuotaTier.UNLIMITED]: 3,
    };

    if (tierHierarchy[user.getEffectiveTier()] < tierHierarchy[QuotaTier.PRO]) {
      throw new ForbiddenException('Transcript summary is a PRO feature');
    }

    try {
      const result = await this.videoMatcher.getTranscriptSummary(
        dto.videoId,
        dto.concept,
      );

      if (!result.success) {
        throw new BadRequestException(
          result.error || 'Failed to get transcript summary',
        );
      }

      return {
        message: 'Transcript summary generated',
        summary: result.summary,
        keyPoints: result.keyPoints,
      };
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(
        error.message || 'Failed to generate transcript summary',
      );
    }
  }

  private secondsToTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
