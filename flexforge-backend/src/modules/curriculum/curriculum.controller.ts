import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { CurriculumCacheService } from './services/curriculum-cache.service';
import { GenerateCurriculumDto } from './dto/generate-curriculum.dto';
import {
  GenerateCurriculumWithCacheDto,
  RegenerateCurriculumDto,
  RecordCompletionDto,
  RecordBounceDto,
  CurriculumCacheResponse,
} from './dto/curriculum-cache.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';

@Controller('curriculum')
@UseGuards(JwtAuthGuard)
export class CurriculumController {
  constructor(
    private curriculumService: CurriculumService,
    private cacheService: CurriculumCacheService,
  ) {}

  /**
   * POST /api/v1/curriculum/generate
   * Generate curriculum (for preview, not saved to session)
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
   * POST /api/v1/curriculum/starter-code
   * Generate starter code template
   */
  @Post('starter-code')
  async generateStarterCode(
    @Body()
    body: {
      projectTitle: string;
      projectDescription: string;
      language: string;
    },
  ) {
    const result = await this.curriculumService.generateStarterCode(body);

    return {
      message: 'Starter code generated successfully',
      code: result.code,
      metadata: {
        tokensUsed: result.tokensUsed,
        cost: result.cost,
      },
    };
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
      const cached = await this.cacheService.tryGetFromCache(dto, user.id, dto.sessionId);

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
      const skipCaching = await this.cacheService.shouldSkipCaching(dto.sessionId);

      // Generate new curriculum
      const result = await this.curriculumService.generateCurriculum(dto, user.quotaTier);

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
      throw new BadRequestException(error.message || 'Failed to generate curriculum');
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
      const skipCaching = await this.cacheService.shouldSkipCaching(dto.sessionId);

      // Generate new curriculum
      const result = await this.curriculumService.generateCurriculum(dto, user.quotaTier);

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
      throw new BadRequestException(error.message || 'Failed to regenerate curriculum');
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
      await this.cacheService.recordDay1Completion(dto.variantId, user.id, dto.sessionId);
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
  async recordBounce(
    @Body() dto: RecordBounceDto,
    @CurrentUser() user: User,
  ) {
    try {
      await this.cacheService.recordBounce(dto.variantId, user.id, dto.sessionId);
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
}