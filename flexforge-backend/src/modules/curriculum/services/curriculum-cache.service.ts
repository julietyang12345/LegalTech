import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import * as crypto from 'crypto';
import {
  CurriculumCacheKey,
  CurriculumCacheVariant,
  CurriculumServe,
  SkillAlias,
  QualityStatus,
  RegenCategory,
} from '../../../database/entities/curriculum-cache.entity';
import { GenerateCurriculumDto } from '../dto/generate-curriculum.dto';

// ============================================================================
// CONFIGURATION
// ============================================================================

export const CACHE_CONFIG = {
  // Version info (update these to invalidate cache)
  promptVersion: '1.0.0',
  modelVersion: 'claude-sonnet-4',

  // Regen rate thresholds (consistent values)
  minServesForJudgment: 10,
  goodRegenRate: 0.15,       // <= 15% = good
  badRegenRate: 0.35,        // > 35% = bad, auto-deactivate
  winnerRegenRate: 0.10,     // <= 10% after 10+ serves = winner

  // Regen timing categories (seconds)
  immediateRegenSeconds: 30,   // < 30s = might be misclick
  quickRegenSeconds: 120,      // 30s - 2min = glanced, rejected
  // > 2min = considered (read it, rejected it - WORST signal)

  // Anti-spam
  maxRegensPerSession: 5,      // After 5 regens in one session, stop caching

  // Expiry
  cacheExpiryDays: 90,
};

// ============================================================================
// TYPES
// ============================================================================

export interface CacheResult {
  curriculum: any;
  variantId: string;
  fromCache: boolean;
  cacheHit?: boolean;
}

export interface VariantStats {
  timesServed: number;
  timesRegenerated: number;
  immediateRegens: number;
  quickRegens: number;
  consideredRegens: number;
  timesCompletedDay1: number;
  bounceCount: number;
  regenRate: number;
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class CurriculumCacheService implements OnModuleInit {
  private readonly logger = new Logger(CurriculumCacheService.name);
  private aliasMap: Map<string, string> = new Map();

  constructor(
    @InjectRepository(CurriculumCacheKey)
    private readonly keyRepo: Repository<CurriculumCacheKey>,

    @InjectRepository(CurriculumCacheVariant)
    private readonly variantRepo: Repository<CurriculumCacheVariant>,

    @InjectRepository(CurriculumServe)
    private readonly serveRepo: Repository<CurriculumServe>,

    @InjectRepository(SkillAlias)
    private readonly aliasRepo: Repository<SkillAlias>,

    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.loadAliases();
  }

  private async loadAliases(): Promise<void> {
    try {
      const aliases = await this.aliasRepo.find();
      this.aliasMap = new Map(aliases.map((a) => [a.alias, a.canonical]));
      this.logger.log(`Loaded ${this.aliasMap.size} skill aliases`);
    } catch (error) {
      this.logger.warn('Failed to load skill aliases, continuing without them');
    }
  }

  // ==========================================================================
  // MAIN: TRY TO GET FROM CACHE
  // ==========================================================================

  async tryGetFromCache(
    dto: GenerateCurriculumDto,
    userId: string,
    sessionId: string,
  ): Promise<CacheResult | null> {
    const normalizedSkill = this.normalizeSkillName(dto.skillName);
    const hash = this.generateHash(dto, normalizedSkill);

    // Find cache key (active and not expired)
    const cacheKey = await this.keyRepo.findOne({
      where: {
        cacheKeyHash: hash,
        isActive: true,
        expiresAt: MoreThan(new Date()),
      },
    });

    if (!cacheKey) {
      return null;
    }

    // Select best variant
    const variant = await this.selectVariant(cacheKey.id, cacheKey.winnerVariantId);

    if (!variant) {
      return null;
    }

    // Record serve
    await this.recordServe(variant.id, userId, sessionId);

    // Increment cache hit counter
    await this.keyRepo.increment({ id: cacheKey.id }, 'cacheHits', 1);

    this.logger.log(
      `Cache HIT: skill="${dto.skillName}" variant=${variant.id} ` +
      `(served=${variant.timesServed}, regenRate=${variant.regenRate?.toFixed(2) ?? 'N/A'})`
    );

    return {
      curriculum: variant.content,
      variantId: variant.id,
      fromCache: true,
      cacheHit: true,
    };
  }

  // ==========================================================================
  // CACHE NEW CONTENT
  // ==========================================================================

  async cacheNewContent(
    dto: GenerateCurriculumDto,
    content: any,
    userId: string,
    sessionId: string,
  ): Promise<CacheResult> {
    const normalizedSkill = this.normalizeSkillName(dto.skillName);
    const hash = this.generateHash(dto, normalizedSkill);

    const { variant } = await this.saveToCache(dto, normalizedSkill, hash, content);

    // Record serve for the new variant
    await this.recordServe(variant.id, userId, sessionId);

    this.logger.log(`Cache MISS: skill="${dto.skillName}" - created variant=${variant.id}`);

    return {
      curriculum: content,
      variantId: variant.id,
      fromCache: false,
      cacheHit: false,
    };
  }

  // ==========================================================================
  // REGENERATE (User clicked "Generate New")
  // ==========================================================================

  async markAsRegenerated(
    previousVariantId: string,
    userId: string,
    sessionId: string,
  ): Promise<void> {
    // Find the serve record
    const serve = await this.serveRepo.findOne({
      where: { variantId: previousVariantId, userId, sessionId },
    });

    if (!serve || serve.regenerated) {
      return; // Already marked or not found
    }

    const now = new Date();
    const secondsBeforeRegen = Math.floor(
      (now.getTime() - serve.servedAt.getTime()) / 1000
    );

    // Categorize the regeneration timing
    let regenCategory: RegenCategory;
    if (secondsBeforeRegen < CACHE_CONFIG.immediateRegenSeconds) {
      regenCategory = RegenCategory.IMMEDIATE;
    } else if (secondsBeforeRegen < CACHE_CONFIG.quickRegenSeconds) {
      regenCategory = RegenCategory.QUICK;
    } else {
      regenCategory = RegenCategory.CONSIDERED;
    }

    // Update serve record
    await this.serveRepo.update(serve.id, {
      regenerated: true,
      regeneratedAt: now,
      secondsBeforeRegen,
      regenCategory,
    });

    // Recompute variant stats
    await this.updateVariantStats(previousVariantId);

    this.logger.log(
      `Regen recorded: variant=${previousVariantId} category=${regenCategory} ` +
      `seconds=${secondsBeforeRegen}`
    );
  }

  // ==========================================================================
  // POSITIVE SIGNALS
  // ==========================================================================

  async recordDay1Completion(
    variantId: string,
    userId: string,
    sessionId: string,
  ): Promise<void> {
    await this.serveRepo.update(
      { variantId, userId, sessionId },
      { completedDay1: true }
    );
    await this.updateVariantStats(variantId);
    this.logger.log(`Day 1 completion recorded: variant=${variantId}`);
  }

  async recordBounce(
    variantId: string,
    userId: string,
    sessionId: string,
  ): Promise<void> {
    await this.serveRepo.update(
      { variantId, userId, sessionId },
      { bounced: true }
    );
    await this.updateVariantStats(variantId);
    this.logger.log(`Bounce recorded: variant=${variantId}`);
  }

  // ==========================================================================
  // CHECK SESSION REGEN COUNT (Anti-spam)
  // ==========================================================================

  async getSessionRegenCount(sessionId: string): Promise<number> {
    const count = await this.serveRepo.count({
      where: { sessionId, regenerated: true },
    });
    return count;
  }

  async shouldSkipCaching(sessionId: string): Promise<boolean> {
    const regenCount = await this.getSessionRegenCount(sessionId);
    return regenCount >= CACHE_CONFIG.maxRegensPerSession;
  }

  // ==========================================================================
  // VARIANT SELECTION
  // ==========================================================================

  private async selectVariant(
    cacheKeyId: string,
    winnerId: string | null,
  ): Promise<CurriculumCacheVariant | null> {
    // If winner exists, serve it
    if (winnerId) {
      const winner = await this.variantRepo.findOne({
        where: { id: winnerId, isActive: true },
      });
      if (winner) {
        return winner;
      }
    }

    // Get all active variants
    const variants = await this.variantRepo.find({
      where: { cacheKeyId, isActive: true },
      order: { timesServed: 'ASC' },
    });

    if (variants.length === 0) {
      return null;
    }

    // Priority 1: Serve "good" variants with lowest regen rate
    const goodVariants = variants.filter((v) => v.qualityStatus === QualityStatus.GOOD);
    if (goodVariants.length > 0) {
      return goodVariants.sort((a, b) => (a.regenRate ?? 1) - (b.regenRate ?? 1))[0];
    }

    // Priority 2: Serve "testing" variants
    const testingVariants = variants.filter((v) => v.qualityStatus === QualityStatus.TESTING);
    if (testingVariants.length > 0) {
      // For variants with < 5 serves, prioritize data gathering (least served first)
      // For variants with >= 5 serves, prefer lower regen rate
      return testingVariants.sort((a, b) => {
        const aHasEnoughData = a.timesServed >= 5;
        const bHasEnoughData = b.timesServed >= 5;

        if (!aHasEnoughData && !bHasEnoughData) {
          return a.timesServed - b.timesServed; // Both need data, serve least-served
        }
        if (!aHasEnoughData) return -1; // a needs data, prioritize it
        if (!bHasEnoughData) return 1;  // b needs data, prioritize it

        // Both have enough data, prefer lower regen rate
        return (a.regenRate ?? 1) - (b.regenRate ?? 1);
      })[0];
    }

    // No good or testing variants available
    return null;
  }

  // ==========================================================================
  // UPDATE VARIANT STATS & AUTO-DEACTIVATE
  // ==========================================================================

  private async updateVariantStats(variantId: string): Promise<void> {
    // Count all stats from serve logs (single source of truth)
    const stats = await this.serveRepo
      .createQueryBuilder('s')
      .select('COUNT(*)', 'served')
      .addSelect('COUNT(*) FILTER (WHERE s.regenerated = true)', 'regenerated')
      .addSelect("COUNT(*) FILTER (WHERE s.regen_category = 'immediate')", 'immediate')
      .addSelect("COUNT(*) FILTER (WHERE s.regen_category = 'quick')", 'quick')
      .addSelect("COUNT(*) FILTER (WHERE s.regen_category = 'considered')", 'considered')
      .addSelect('COUNT(*) FILTER (WHERE s.completed_day1 = true)', 'completed')
      .addSelect('COUNT(*) FILTER (WHERE s.bounced = true)', 'bounced')
      .where('s.variant_id = :variantId', { variantId })
      .getRawOne();

    const timesServed = parseInt(stats.served) || 0;
    const timesRegenerated = parseInt(stats.regenerated) || 0;
    const regenRate = timesServed > 0 ? timesRegenerated / timesServed : 0;

    // Determine quality status based on thresholds
    let qualityStatus: QualityStatus = QualityStatus.TESTING;
    if (timesServed >= CACHE_CONFIG.minServesForJudgment) {
      if (regenRate <= CACHE_CONFIG.goodRegenRate) {
        qualityStatus = QualityStatus.GOOD;
      } else if (regenRate > CACHE_CONFIG.badRegenRate) {
        qualityStatus = QualityStatus.BAD;
      }
      // Between goodRegenRate and badRegenRate stays as TESTING
    }

    // Update variant with computed stats
    await this.variantRepo.update(variantId, {
      timesServed,
      timesRegenerated,
      immediateRegens: parseInt(stats.immediate) || 0,
      quickRegens: parseInt(stats.quick) || 0,
      consideredRegens: parseInt(stats.considered) || 0,
      timesCompletedDay1: parseInt(stats.completed) || 0,
      bounceCount: parseInt(stats.bounced) || 0,
      regenRate,
      qualityStatus,
      isActive: qualityStatus !== QualityStatus.BAD, // Auto-deactivate bad variants
    });

    if (qualityStatus === QualityStatus.BAD) {
      this.logger.warn(
        `Auto-deactivated variant ${variantId}: regenRate=${(regenRate * 100).toFixed(1)}%`
      );
    }

    // Try to elect winner if this became "good"
    if (qualityStatus === QualityStatus.GOOD) {
      await this.tryElectWinner(variantId);
    }
  }

  // ==========================================================================
  // ELECT WINNER
  // ==========================================================================

  private async tryElectWinner(variantId: string): Promise<void> {
    const variant = await this.variantRepo.findOne({ where: { id: variantId } });
    if (!variant) return;

    const cacheKey = await this.keyRepo.findOne({ where: { id: variant.cacheKeyId } });
    if (!cacheKey || cacheKey.winnerVariantId) return; // Already has winner

    // Check if qualifies for winner status
    if (
      variant.qualityStatus === QualityStatus.GOOD &&
      variant.timesServed >= CACHE_CONFIG.minServesForJudgment &&
      (variant.regenRate ?? 1) <= CACHE_CONFIG.winnerRegenRate
    ) {
      await this.variantRepo.update(variantId, { qualityStatus: QualityStatus.WINNER });
      await this.keyRepo.update(cacheKey.id, { winnerVariantId: variantId });

      this.logger.log(
        `Winner elected: variant=${variantId} regenRate=${((variant.regenRate ?? 0) * 100).toFixed(1)}%`
      );
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private async recordServe(
    variantId: string,
    userId: string,
    sessionId: string,
  ): Promise<void> {
    try {
      await this.serveRepo.upsert(
        {
          variantId,
          userId,
          sessionId,
          servedAt: new Date(),
        },
        ['userId', 'variantId', 'sessionId']
      );

      // Update last_served_at on variant
      await this.variantRepo.update(variantId, { lastServedAt: new Date() });
    } catch (error) {
      // Ignore duplicate key errors (race condition on upsert)
      this.logger.debug(`Serve recording: ${error.message}`);
    }
  }

  private async saveToCache(
    dto: GenerateCurriculumDto,
    normalizedSkill: string,
    hash: string,
    content: any,
  ): Promise<{ key: CurriculumCacheKey; variant: CurriculumCacheVariant }> {
    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(content))
      .digest('hex');

    return this.dataSource.transaction(async (manager) => {
      // Find or create cache key
      let key = await manager.findOne(CurriculumCacheKey, {
        where: { cacheKeyHash: hash },
      });

      if (!key) {
        key = manager.create(CurriculumCacheKey, {
          cacheKeyHash: hash,
          skillName: dto.skillName,
          skillNameNormalized: normalizedSkill,
          durationDays: dto.durationDays,
          hoursPerDay: dto.hoursPerDay,
          skillLevel: dto.skillLevel,
          promptVersion: CACHE_CONFIG.promptVersion,
          modelVersion: CACHE_CONFIG.modelVersion,
        });
        key = await manager.save(key);
      }

      // Check for duplicate content (same hash)
      let variant = await manager.findOne(CurriculumCacheVariant, {
        where: { cacheKeyId: key.id, contentHash },
      });

      if (!variant) {
        variant = manager.create(CurriculumCacheVariant, {
          cacheKeyId: key.id,
          content,
          contentHash,
        });
        variant = await manager.save(variant);
      }

      return { key, variant };
    });
  }

  private normalizeSkillName(skillName: string): string {
    let normalized = skillName
      .toLowerCase()
      .trim()
      // Remove common filler words
      .replace(/\b(tutorial|course|learn|guide|introduction|intro|basics|how to|for beginners)\b/gi, '')
      // Remove special characters except hyphens
      .replace(/[^a-z0-9\s-]/g, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();

    // Apply aliases
    if (this.aliasMap.has(normalized)) {
      normalized = this.aliasMap.get(normalized)!;
    }

    return normalized;
  }

  private generateHash(dto: GenerateCurriculumDto, normalizedSkill: string): string {
    const components = [
      normalizedSkill,
      dto.durationDays.toString(),
      dto.hoursPerDay.toFixed(1),
      dto.skillLevel,
      CACHE_CONFIG.promptVersion,
      CACHE_CONFIG.modelVersion,
    ].join('|');

    return crypto.createHash('sha256').update(components).digest('hex');
  }

  // ==========================================================================
  // ADMIN: GET CACHE STATS
  // ==========================================================================

  async getCacheStats(): Promise<{
    totalKeys: number;
    totalVariants: number;
    activeVariants: number;
    winners: number;
    totalServes: number;
    avgRegenRate: number;
  }> {
    const [keyCount, variantStats, serveCount] = await Promise.all([
      this.keyRepo.count({ where: { isActive: true } }),
      this.variantRepo
        .createQueryBuilder('v')
        .select('COUNT(*)', 'total')
        .addSelect('COUNT(*) FILTER (WHERE v.is_active = true)', 'active')
        .addSelect("COUNT(*) FILTER (WHERE v.quality_status = 'winner')", 'winners')
        .addSelect('AVG(v.regen_rate) FILTER (WHERE v.times_served >= 10)', 'avgRate')
        .getRawOne(),
      this.serveRepo.count(),
    ]);

    return {
      totalKeys: keyCount,
      totalVariants: parseInt(variantStats.total) || 0,
      activeVariants: parseInt(variantStats.active) || 0,
      winners: parseInt(variantStats.winners) || 0,
      totalServes: serveCount,
      avgRegenRate: parseFloat(variantStats.avgRate) || 0,
    };
  }
}
