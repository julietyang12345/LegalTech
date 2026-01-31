import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import * as crypto from 'crypto';
import {
  CurriculumCacheKey,
  CurriculumCacheVariant,
  CurriculumServe,
  SkillAlias,
  DayContentCache,
  DayContentCacheVariant,
  DayContentServe,
  QualityStatus,
  RegenCategory,
} from '../../../database/entities/curriculum-cache.entity';
import { GenerateCurriculumDto } from '../dto/generate-curriculum.dto';
import { AiService, AITask } from '../../ai/ai.service';

// ============================================================================
// CONFIGURATION
// ============================================================================

export const CACHE_CONFIG = {
  // Version info (update these to invalidate cache)
  promptVersion: '1.0.0',
  modelVersion: 'claude-sonnet-4',

  // Regen rate thresholds (consistent values) - CURRICULUM
  minServesForJudgment: 10,
  goodRegenRate: 0.15, // <= 15% = good
  badRegenRate: 0.35, // > 35% = bad, auto-deactivate
  winnerRegenRate: 0.1, // <= 10% after 10+ serves = winner

  // Regen timing categories (seconds)
  immediateRegenSeconds: 30, // < 30s = might be misclick
  quickRegenSeconds: 120, // 30s - 2min = glanced, rejected
  // > 2min = considered (read it, rejected it - WORST signal)

  // Anti-spam
  maxRegensPerSession: 5, // After 5 regens in one session, stop caching

  // Expiry
  cacheExpiryDays: 90,

  // DAY CONTENT specific thresholds (slightly more lenient)
  dayContentMaxRegensPerDay: 10, // Max 10 regens per day per session (increased for testing)
  dayContentGoodRegenRate: 0.2, // <= 20% = good (day content may have higher acceptable rate)
  dayContentBadRegenRate: 0.4, // > 40% = bad, auto-deactivate
  dayContentWinnerRegenRate: 0.12, // <= 12% after 10+ serves = winner
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

export interface DayContentCacheResult {
  content: any;
  variantId: string;
  fromCache: boolean;
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class CurriculumCacheService implements OnModuleInit {
  private readonly logger = new Logger(CurriculumCacheService.name);
  private aliasMap: Map<string, string> = new Map();
  private normalizedSkillCache: Map<string, string> = new Map(); // AI-normalized skill cache
  private dayContentCache: Map<string, { content: any; expiresAt: number }> =
    new Map(); // Day content cache
  private readonly DAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(
    @InjectRepository(CurriculumCacheKey)
    private readonly keyRepo: Repository<CurriculumCacheKey>,

    @InjectRepository(CurriculumCacheVariant)
    private readonly variantRepo: Repository<CurriculumCacheVariant>,

    @InjectRepository(CurriculumServe)
    private readonly serveRepo: Repository<CurriculumServe>,

    @InjectRepository(SkillAlias)
    private readonly aliasRepo: Repository<SkillAlias>,

    @InjectRepository(DayContentCache)
    private readonly dayContentRepo: Repository<DayContentCache>,

    @InjectRepository(DayContentCacheVariant)
    private readonly dayVariantRepo: Repository<DayContentCacheVariant>,

    @InjectRepository(DayContentServe)
    private readonly dayServeRepo: Repository<DayContentServe>,

    private readonly dataSource: DataSource,

    private readonly aiService: AiService,
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
    const normalizedSkill = await this.normalizeSkillName(dto.skillName);
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
    const variant = await this.selectVariant(
      cacheKey.id,
      cacheKey.winnerVariantId,
    );

    if (!variant) {
      return null;
    }

    // Record serve
    await this.recordServe(variant.id, userId, sessionId);

    // Increment cache hit counter
    await this.keyRepo.increment({ id: cacheKey.id }, 'cacheHits', 1);

    this.logger.log(
      `Cache HIT: skill="${dto.skillName}" variant=${variant.id} ` +
        `(served=${variant.timesServed}, regenRate=${variant.regenRate?.toFixed(2) ?? 'N/A'})`,
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
    const normalizedSkill = await this.normalizeSkillName(dto.skillName);
    const hash = this.generateHash(dto, normalizedSkill);

    const { variant } = await this.saveToCache(
      dto,
      normalizedSkill,
      hash,
      content,
    );

    // Record serve for the new variant
    await this.recordServe(variant.id, userId, sessionId);

    this.logger.log(
      `Cache MISS: skill="${dto.skillName}" - created variant=${variant.id}`,
    );

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
      (now.getTime() - serve.servedAt.getTime()) / 1000,
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
        `seconds=${secondsBeforeRegen}`,
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
      { completedDay1: true },
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
      { bounced: true },
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
    const goodVariants = variants.filter(
      (v) => v.qualityStatus === QualityStatus.GOOD,
    );
    if (goodVariants.length > 0) {
      return goodVariants.sort(
        (a, b) => (a.regenRate ?? 1) - (b.regenRate ?? 1),
      )[0];
    }

    // Priority 2: Serve "testing" variants
    const testingVariants = variants.filter(
      (v) => v.qualityStatus === QualityStatus.TESTING,
    );
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
        if (!bHasEnoughData) return 1; // b needs data, prioritize it

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
      .addSelect(
        "COUNT(*) FILTER (WHERE s.regen_category = 'immediate')",
        'immediate',
      )
      .addSelect("COUNT(*) FILTER (WHERE s.regen_category = 'quick')", 'quick')
      .addSelect(
        "COUNT(*) FILTER (WHERE s.regen_category = 'considered')",
        'considered',
      )
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
        `Auto-deactivated variant ${variantId}: regenRate=${(regenRate * 100).toFixed(1)}%`,
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
    const variant = await this.variantRepo.findOne({
      where: { id: variantId },
    });
    if (!variant) return;

    const cacheKey = await this.keyRepo.findOne({
      where: { id: variant.cacheKeyId },
    });
    if (!cacheKey || cacheKey.winnerVariantId) return; // Already has winner

    // Check if qualifies for winner status
    if (
      variant.qualityStatus === QualityStatus.GOOD &&
      variant.timesServed >= CACHE_CONFIG.minServesForJudgment &&
      (variant.regenRate ?? 1) <= CACHE_CONFIG.winnerRegenRate
    ) {
      await this.variantRepo.update(variantId, {
        qualityStatus: QualityStatus.WINNER,
      });
      await this.keyRepo.update(cacheKey.id, { winnerVariantId: variantId });

      this.logger.log(
        `Winner elected: variant=${variantId} regenRate=${((variant.regenRate ?? 0) * 100).toFixed(1)}%`,
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
        ['userId', 'variantId', 'sessionId'],
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

  /**
   * Normalize skill name for consistent caching using AI (Haiku).
   * Handles: different languages, typos, phrasings, abbreviations.
   *
   * Examples:
   * - "how to use Python to build a bot" → "python"
   * - "파이썬" (Korean) → "python"
   * - "Javascrip" (typo) → "javascript"
   * - "JS" → "javascript"
   * - "Data Structures & Algorithms" → "data structures and algorithms"
   * - "learn react hooks" → "react"
   */
  private async normalizeSkillName(skillName: string): Promise<string> {
    // Quick cleanup for cache key lookup
    const cacheKey = skillName.toLowerCase().trim();

    // Check memory cache first (fast path)
    if (this.normalizedSkillCache.has(cacheKey)) {
      return this.normalizedSkillCache.get(cacheKey)!;
    }

    // Check database aliases
    if (this.aliasMap.has(cacheKey)) {
      const aliased = this.aliasMap.get(cacheKey)!;
      this.normalizedSkillCache.set(cacheKey, aliased);
      return aliased;
    }

    // Use Haiku AI to semantically normalize the skill name
    try {
      const normalized = await this.normalizeWithAI(skillName);

      // Cache the result
      this.normalizedSkillCache.set(cacheKey, normalized);

      // LRU eviction
      if (this.normalizedSkillCache.size > 1000) {
        const firstKey = this.normalizedSkillCache.keys().next().value;
        if (firstKey) this.normalizedSkillCache.delete(firstKey);
      }

      this.logger.log(`🤖 AI Normalized: "${skillName}" → "${normalized}"`);
      return normalized;
    } catch (error) {
      // Fallback to basic normalization if AI fails
      this.logger.warn(
        `AI normalization failed for "${skillName}", using fallback: ${error.message}`,
      );
      return this.basicNormalize(skillName);
    }
  }

  /**
   * Use Haiku AI to extract the canonical skill name.
   * Fast and cheap - handles languages, typos, and semantic understanding.
   */
  private async normalizeWithAI(skillName: string): Promise<string> {
    const prompt = `Extract the core programming/technology skill from this input. Handle any language, typos, or phrasings.

Input: "${skillName}"

Rules:
1. Return ONLY the canonical English skill name in lowercase
2. Remove filler words (learn, tutorial, how to, basics, etc.)
3. Fix typos (Pythn → python, Javascrip → javascript)
4. Translate non-English to English (파이썬 → python, питон → python)
5. Expand abbreviations only if ambiguous context (JS in web context → javascript)
6. Keep compound skills together (data structures and algorithms, machine learning)
7. For specific tools/frameworks, return just the tool name (React hooks → react)
8. Maximum 4 words

Examples:
- "how to use Python to build a bot" → "python"
- "파이썬 기초" → "python"
- "Javascrip tutorial" → "javascript"
- "Data Structures & Algorithms" → "data structures and algorithms"
- "learn react hooks for beginners" → "react"
- "ML with TensorFlow" → "tensorflow machine learning"
- "build REST APIs with Node" → "nodejs rest api"

Return ONLY the normalized skill name, nothing else.`;

    const response = await this.aiService.routeRequest(
      AITask.LIGHTWEIGHT_EXTRACTION, // Fast Haiku for skill name extraction
      prompt,
      'You are a skill name normalizer. Return only the canonical skill name.',
    );

    // Clean up the response
    const normalized = response.content
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Validate - should be 1-4 words
    const words = normalized.split(' ');
    if (words.length === 0 || words.length > 4 || normalized.length > 50) {
      throw new Error(`Invalid AI response: "${normalized}"`);
    }

    return normalized;
  }

  /**
   * Basic fallback normalization (no AI)
   */
  private basicNormalize(skillName: string): string {
    return skillName
      .toLowerCase()
      .trim()
      .replace(/&/g, ' and ')
      .replace(
        /\b(tutorial|course|learn|learning|guide|introduction|intro|basics|basic|beginner|beginners|advanced|intermediate|how to|for|with|using|the|a|an)\b/gi,
        '',
      )
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Public method to normalize skill names for day content cache keys.
   * Uses the same normalization as curriculum caching to ensure consistency.
   * This ensures "how to use Python to build a bot" and "Python bot tutorial"
   * map to the same normalized key when they should share cached content.
   */
  async normalizeSkillForDayCache(skillName: string): Promise<string> {
    return this.normalizeSkillName(skillName);
  }

  private generateHash(
    dto: GenerateCurriculumDto,
    normalizedSkill: string,
  ): string {
    const components = [
      normalizedSkill.toLowerCase().trim(), // Ensure case-insensitive
      dto.durationDays.toString(),
      dto.hoursPerDay.toFixed(1),
      dto.skillLevel.toLowerCase(), // Ensure case-insensitive
      CACHE_CONFIG.promptVersion,
      CACHE_CONFIG.modelVersion,
    ].join('|');

    return crypto.createHash('sha256').update(components).digest('hex');
  }

  // ==========================================================================
  // DAY CONTENT CACHE (Database-backed with in-memory L1 cache)
  // ==========================================================================

  async getDayContent(cacheKey: string): Promise<any | null> {
    // L1: Check in-memory cache first (fast)
    const memCached = this.dayContentCache.get(cacheKey);
    if (memCached && Date.now() <= memCached.expiresAt) {
      this.logger.debug(`Day content L1 cache HIT: ${cacheKey}`);
      return memCached.content;
    }

    // L2: Check database
    try {
      const dbCached = await this.dayContentRepo.findOne({
        where: {
          cacheKey,
          isActive: true,
          expiresAt: MoreThan(new Date()),
        },
      });

      if (dbCached) {
        // Populate L1 cache for next access
        this.dayContentCache.set(cacheKey, {
          content: dbCached.content,
          expiresAt: Date.now() + this.DAY_CACHE_TTL_MS,
        });

        // Increment hit counter (fire and forget)
        this.dayContentRepo
          .increment({ id: dbCached.id }, 'cacheHits', 1)
          .catch(() => {});

        this.logger.debug(`Day content L2 cache HIT: ${cacheKey}`);
        return dbCached.content;
      }
    } catch (error) {
      this.logger.warn(`Day content cache lookup failed: ${error.message}`);
    }

    return null;
  }

  async setDayContent(cacheKey: string, content: any): Promise<void> {
    // L1: Update in-memory cache
    if (this.dayContentCache.size >= 500) {
      const firstKey = this.dayContentCache.keys().next().value;
      if (firstKey) this.dayContentCache.delete(firstKey);
    }
    this.dayContentCache.set(cacheKey, {
      content,
      expiresAt: Date.now() + this.DAY_CACHE_TTL_MS,
    });

    // L2: Persist to database (upsert)
    try {
      await this.dayContentRepo.upsert(
        {
          cacheKey,
          content,
          isActive: true,
          expiresAt: new Date(
            Date.now() + CACHE_CONFIG.cacheExpiryDays * 24 * 60 * 60 * 1000,
          ),
        },
        ['cacheKey'],
      );
      this.logger.debug(`Day content cached to DB: ${cacheKey}`);
    } catch (error) {
      this.logger.warn(`Day content cache save failed: ${error.message}`);
    }
  }

  clearDayContentCache(): void {
    this.dayContentCache.clear();
    this.logger.log('Day content in-memory cache cleared');
  }

  // ==========================================================================
  // DAY CONTENT VARIANT TRACKING (Quality-based caching like curriculum)
  // ==========================================================================

  /**
   * Get day content with variant tracking (use this instead of getDayContent for variant support)
   */
  async getDayContentWithVariant(
    cacheKey: string,
    userId: string,
    sessionId: string,
    dayNumber: number,
  ): Promise<DayContentCacheResult | null> {
    try {
      // Find cache entry
      const cacheEntry = await this.dayContentRepo.findOne({
        where: {
          cacheKey,
          isActive: true,
          expiresAt: MoreThan(new Date()),
        },
      });

      if (!cacheEntry) {
        return null;
      }

      // Select best variant
      const variant = await this.selectDayVariant(
        cacheEntry.id,
        cacheEntry.winnerVariantId,
      );

      if (!variant) {
        // No variants yet - fall back to legacy content field
        if (cacheEntry.content) {
          this.logger.debug(
            `Day content legacy cache HIT (no variants): ${cacheKey}`,
          );
          return {
            content: cacheEntry.content,
            variantId: '',
            fromCache: true,
          };
        }
        return null;
      }

      // Record serve
      await this.recordDayServe(variant.id, userId, sessionId, dayNumber);

      // Increment cache hit counter
      this.dayContentRepo
        .increment({ id: cacheEntry.id }, 'cacheHits', 1)
        .catch(() => {});

      this.logger.debug(
        `Day content variant cache HIT: ${cacheKey} variant=${variant.id}`,
      );

      return {
        content: variant.content,
        variantId: variant.id,
        fromCache: true,
      };
    } catch (error) {
      this.logger.warn(`Day content variant lookup failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Cache day content with variant creation (use this instead of setDayContent for variant support)
   */
  async cacheDayContentWithVariant(
    cacheKey: string,
    content: any,
    userId: string,
    sessionId: string,
    dayNumber: number,
  ): Promise<DayContentCacheResult> {
    const contentHash = this.generateContentHash(content);

    try {
      // Find or create cache entry
      let cacheEntry = await this.dayContentRepo.findOne({
        where: { cacheKey },
      });

      if (!cacheEntry) {
        cacheEntry = await this.dayContentRepo.save({
          cacheKey,
          content, // Keep legacy content for backward compat
          isActive: true,
          expiresAt: new Date(
            Date.now() + CACHE_CONFIG.cacheExpiryDays * 24 * 60 * 60 * 1000,
          ),
        });
      }

      // Check if variant with same content hash already exists
      let variant = await this.dayVariantRepo.findOne({
        where: { cacheKeyId: cacheEntry.id, contentHash, isActive: true },
      });

      if (!variant) {
        // Create new variant
        variant = await this.dayVariantRepo.save({
          cacheKeyId: cacheEntry.id,
          content,
          contentHash,
          timesServed: 0,
          timesRegenerated: 0,
          qualityStatus: QualityStatus.TESTING,
          isActive: true,
        });
        this.logger.log(
          `Day content variant created: ${cacheKey} variant=${variant.id}`,
        );
      }

      // Record first serve
      await this.recordDayServe(variant.id, userId, sessionId, dayNumber);

      // Update L1 cache
      this.dayContentCache.set(cacheKey, {
        content,
        expiresAt: Date.now() + this.DAY_CACHE_TTL_MS,
      });

      return {
        content,
        variantId: variant.id,
        fromCache: false,
      };
    } catch (error) {
      this.logger.warn(
        `Day content variant cache save failed: ${error.message}`,
      );
      // Return result anyway, just without variantId
      return { content, variantId: '', fromCache: false };
    }
  }

  /**
   * Mark day content as regenerated (negative signal)
   */
  async markDayContentAsRegenerated(
    previousVariantId: string,
    userId: string,
    sessionId: string,
  ): Promise<void> {
    if (!previousVariantId) return;

    try {
      const serve = await this.dayServeRepo.findOne({
        where: { variantId: previousVariantId, userId, sessionId },
      });

      if (!serve || serve.regenerated) {
        return; // Already marked or not found
      }

      const now = new Date();
      const secondsBeforeRegen = Math.floor(
        (now.getTime() - serve.servedAt.getTime()) / 1000,
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
      await this.dayServeRepo.update(serve.id, {
        regenerated: true,
        regeneratedAt: now,
        secondsBeforeRegen,
        regenCategory,
      });

      // Recompute variant stats
      await this.updateDayVariantStats(previousVariantId);

      this.logger.log(
        `Day content regen recorded: variant=${previousVariantId} after=${secondsBeforeRegen}s category=${regenCategory}`,
      );
    } catch (error) {
      this.logger.warn(`Day content regen recording failed: ${error.message}`);
    }
  }

  /**
   * Get day content regen count for rate limiting
   */
  async getDayRegenCount(
    sessionId: string,
    dayNumber: number,
  ): Promise<number> {
    try {
      const count = await this.dayServeRepo.count({
        where: { sessionId, dayNumber, regenerated: true },
      });
      return count;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Check if day content regen limit reached
   * @param sessionId - The session ID
   * @param dayNumber - The day number
   * @param userLimit - Optional user-specific limit (defaults to CACHE_CONFIG value)
   */
  async isDayRegenLimitReached(
    sessionId: string,
    dayNumber: number,
    userLimit?: number,
  ): Promise<boolean> {
    const count = await this.getDayRegenCount(sessionId, dayNumber);
    const limit = userLimit ?? CACHE_CONFIG.dayContentMaxRegensPerDay;
    return count >= limit;
  }

  // ---- Private Day Variant Methods ----

  private async selectDayVariant(
    cacheKeyId: string,
    winnerId: string | null,
  ): Promise<DayContentCacheVariant | null> {
    // Priority 1: Serve WINNER (if elected)
    if (winnerId) {
      const winner = await this.dayVariantRepo.findOne({
        where: { id: winnerId, isActive: true },
      });
      if (winner) {
        return winner;
      }
    }

    const variants = await this.dayVariantRepo.find({
      where: { cacheKeyId, isActive: true },
      order: { timesServed: 'ASC' },
    });

    if (variants.length === 0) return null;

    // Priority 2: Serve "GOOD" variants (with lowest regen rate first)
    const goodVariants = variants.filter(
      (v) => v.qualityStatus === QualityStatus.GOOD,
    );
    if (goodVariants.length > 0) {
      return goodVariants.sort(
        (a, b) => (a.regenRate ?? 1) - (b.regenRate ?? 1),
      )[0];
    }

    // Priority 3: Serve "TESTING" variants (for data gathering)
    const testingVariants = variants.filter(
      (v) => v.qualityStatus === QualityStatus.TESTING,
    );
    if (testingVariants.length > 0) {
      return testingVariants.sort((a, b) => {
        const aHasEnoughData = a.timesServed >= 5;
        const bHasEnoughData = b.timesServed >= 5;

        if (!aHasEnoughData && !bHasEnoughData) {
          return a.timesServed - b.timesServed;
        }
        if (!aHasEnoughData) return -1;
        if (!bHasEnoughData) return 1;

        return (a.regenRate ?? 1) - (b.regenRate ?? 1);
      })[0];
    }

    return null;
  }

  private async recordDayServe(
    variantId: string,
    userId: string,
    sessionId: string,
    dayNumber: number,
  ): Promise<void> {
    try {
      await this.dayServeRepo.upsert(
        {
          variantId,
          userId,
          sessionId,
          dayNumber,
          servedAt: new Date(),
        },
        ['userId', 'variantId', 'sessionId', 'dayNumber'],
      );

      await this.dayVariantRepo.update(variantId, { lastServedAt: new Date() });
    } catch (error) {
      this.logger.debug(`Day serve recording: ${error.message}`);
    }
  }

  private async updateDayVariantStats(variantId: string): Promise<void> {
    try {
      const stats = await this.dayServeRepo
        .createQueryBuilder('s')
        .select('COUNT(*)', 'served')
        .addSelect(
          'COUNT(*) FILTER (WHERE s.regenerated = true)',
          'regenerated',
        )
        .addSelect(
          "COUNT(*) FILTER (WHERE s.regen_category = 'immediate')",
          'immediate',
        )
        .addSelect(
          "COUNT(*) FILTER (WHERE s.regen_category = 'quick')",
          'quick',
        )
        .addSelect(
          "COUNT(*) FILTER (WHERE s.regen_category = 'considered')",
          'considered',
        )
        .where('s.variant_id = :variantId', { variantId })
        .getRawOne();

      const timesServed = parseInt(stats.served) || 0;
      const timesRegenerated = parseInt(stats.regenerated) || 0;
      const regenRate = timesServed > 0 ? timesRegenerated / timesServed : 0;

      // Determine quality status based on day content thresholds
      let qualityStatus: QualityStatus = QualityStatus.TESTING;
      if (timesServed >= CACHE_CONFIG.minServesForJudgment) {
        if (regenRate <= CACHE_CONFIG.dayContentGoodRegenRate) {
          qualityStatus = QualityStatus.GOOD;
        } else if (regenRate > CACHE_CONFIG.dayContentBadRegenRate) {
          qualityStatus = QualityStatus.BAD;
        }
      }

      // Update variant with computed stats
      await this.dayVariantRepo.update(variantId, {
        timesServed,
        timesRegenerated,
        immediateRegens: parseInt(stats.immediate) || 0,
        quickRegens: parseInt(stats.quick) || 0,
        consideredRegens: parseInt(stats.considered) || 0,
        regenRate,
        qualityStatus,
        isActive: qualityStatus !== QualityStatus.BAD,
      });

      if (qualityStatus === QualityStatus.BAD) {
        this.logger.warn(
          `Day variant auto-deactivated: ${variantId} regenRate=${(regenRate * 100).toFixed(1)}%`,
        );
      }

      // Try to elect winner if this became "good"
      if (qualityStatus === QualityStatus.GOOD) {
        await this.tryElectDayWinner(variantId);
      }
    } catch (error) {
      this.logger.warn(`Day variant stats update failed: ${error.message}`);
    }
  }

  private async tryElectDayWinner(variantId: string): Promise<void> {
    try {
      const variant = await this.dayVariantRepo.findOne({
        where: { id: variantId },
      });
      if (!variant) return;

      const cacheEntry = await this.dayContentRepo.findOne({
        where: { id: variant.cacheKeyId },
      });
      if (!cacheEntry || cacheEntry.winnerVariantId) return; // Already has winner

      // Check if qualifies for winner status
      if (
        variant.qualityStatus === QualityStatus.GOOD &&
        variant.timesServed >= CACHE_CONFIG.minServesForJudgment &&
        (variant.regenRate ?? 1) <= CACHE_CONFIG.dayContentWinnerRegenRate
      ) {
        await this.dayVariantRepo.update(variantId, {
          qualityStatus: QualityStatus.WINNER,
        });
        await this.dayContentRepo.update(cacheEntry.id, {
          winnerVariantId: variantId,
        });

        this.logger.log(
          `Day winner elected: variant=${variantId} regenRate=${((variant.regenRate ?? 0) * 100).toFixed(1)}%`,
        );
      }
    } catch (error) {
      this.logger.warn(`Day winner election failed: ${error.message}`);
    }
  }

  private generateContentHash(content: any): string {
    const contentStr = JSON.stringify(content);
    return crypto
      .createHash('sha256')
      .update(contentStr)
      .digest('hex')
      .substring(0, 64);
  }

  // ==========================================================================
  // ADMIN: CLEAR ALL CACHE
  // ==========================================================================

  async clearAllCache(): Promise<{ cleared: string[] }> {
    const cleared: string[] = [];

    try {
      // Clear in-memory caches
      this.dayContentCache.clear();
      this.normalizedSkillCache.clear();
      cleared.push('in-memory caches');

      // Clear day content tables
      await this.dayServeRepo.query('TRUNCATE day_content_serves CASCADE');
      cleared.push('day_content_serves');

      await this.dayVariantRepo.query('TRUNCATE day_content_variants CASCADE');
      cleared.push('day_content_variants');

      await this.dayContentRepo.query('TRUNCATE day_content_cache CASCADE');
      cleared.push('day_content_cache');

      // Clear curriculum cache tables
      await this.serveRepo.query('TRUNCATE curriculum_serves CASCADE');
      cleared.push('curriculum_serves');

      await this.variantRepo.query(
        'TRUNCATE curriculum_cache_variants CASCADE',
      );
      cleared.push('curriculum_cache_variants');

      await this.keyRepo.query('TRUNCATE curriculum_cache_keys CASCADE');
      cleared.push('curriculum_cache_keys');

      this.logger.log(`✅ All caches cleared: ${cleared.join(', ')}`);
    } catch (error) {
      this.logger.error(`Cache clear failed: ${error.message}`);
      throw error;
    }

    return { cleared };
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
        .addSelect(
          "COUNT(*) FILTER (WHERE v.quality_status = 'winner')",
          'winners',
        )
        .addSelect(
          'AVG(v.regen_rate) FILTER (WHERE v.times_served >= 10)',
          'avgRate',
        )
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
