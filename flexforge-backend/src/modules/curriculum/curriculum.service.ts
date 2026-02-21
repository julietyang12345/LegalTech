import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService, AITask } from '../ai/ai.service';
import { GenerateCurriculumDto } from './dto/generate-curriculum.dto';
import {
  SkillDetectorService,
  SkillType,
} from './services/skill-detector.service';
import { VideoMatchingService } from './services/youtube/video-matching.service';
import { CurriculumCacheService } from './services/curriculum-cache.service';
import { UniversityResourceService } from './services/university/university-resource.service';
import {
  DocumentationFetchService,
  DocFetchResult,
} from './services/docs/documentation-fetch.service';
import {
  buildCacheableCurriculumPrompt,
  buildCacheableDayDetailCorePrompt,
  buildDayDetailDeferredPrompt,
  buildDeferredLightweightPrompt,
  buildBossDetailPrompt,
  usesProjectBasedLearning,
  DayDetailParams,
  BossDetailParams,
} from './prompts/curriculum-prompt';
import {
  ContentGenerationContext,
  buildContentGenerationContext,
  extractTask1Concepts,
  normalizeSectionIds,
  normalizeTask1Sections,
} from './prompts/content-generation-context';
import { formatTime, LRUCache } from './utils/shared.utils';

export interface CurriculumResult {
  curriculum: any; // Overview curriculum (skeleton)
  tokensUsed: number;
  cost: number;
  skillDetection: any;
  warnings?: string[];
}

export interface DayDetailResult {
  dayContent: any;
  tokensUsed: number;
  cost: number;
}

export interface BossDetailResult {
  bossContent: any;
  tokensUsed: number;
  cost: number;
}

export interface DayCoreResult {
  coreContent: any;
  tokensUsed: number;
  cost: number;
  fromCache?: boolean;
  variantId?: string;
  /** Concepts from task1 questions, passed to deferred generation for consistency */
  task1Concepts?: string[];
}

export interface DayDeferredResult {
  deferredContent: any;
  tokensUsed: number;
  cost: number;
  fromCache?: boolean;
}

// Abstract skill types that often need AI-assisted query generation
const ABSTRACT_SKILL_TYPES = new Set([
  'SOFT_SKILL',
  'CRITICAL_THINKING',
  'LEADERSHIP',
  'COMMUNICATION',
  'CREATIVITY',
  'PROBLEM_SOLVING',
  'EMOTIONAL_INTELLIGENCE',
  'MINDFULNESS',
]);

// Generic words that signal a weak search query
const GENERIC_QUERY_WORDS = new Set([
  'understanding',
  'introduction',
  'overview',
  'thinking',
  'principles',
  'concepts',
  'basics',
  'fundamentals',
  'learning',
  'mastering',
  'exploring',
  'developing',
  'building',
  'creating',
  'improving',
  'advanced',
  'essential',
]);

@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);

  // Minimum confidence threshold for accepting video matches
  private readonly MIN_VIDEO_CONFIDENCE = 40;

  // Cache for AI-generated search queries: key = "skillName:dayNumber:level"
  // LRU with 7-day TTL — cross-user (service is a singleton)
  private searchQueryCache = new LRUCache<string>({ maxSize: 1000, ttl: 7 * 24 * 60 * 60 * 1000 });

  // Cache for concept boost results: key = "skillName:concept:level"
  // Cross-user — same concept boost can serve multiple students
  private conceptBoostCache = new LRUCache<any>({ maxSize: 500, ttl: 7 * 24 * 60 * 60 * 1000 });

  /**
   * Extract search query from day content for video search
   * HYBRID: Uses deterministic extraction first, falls back to AI for abstract/weak queries
   */
  private async extractSearchQuery(
    dayContent: any,
    fallbackTitle: string,
    skillName?: string,
    context?: {
      dayNumber?: number;
      skillLevel?: string;
      skillType?: string;
      dayObjectives?: string[];
    },
  ): Promise<string> {
    // Step 1: Try deterministic extraction (FREE)
    // Map skill level to user level for YouTube search modifiers
    const levelMap: Record<string, 'beginner' | 'intermediate' | 'advanced'> = {
      BEGINNER: 'beginner',
      INTERMEDIATE: 'intermediate',
      ADVANCED: 'advanced',
    };
    const userLevel = levelMap[context?.skillLevel || ''] || 'beginner';

    const deterministicQuery = this.extractSearchQueryDeterministic(
      dayContent,
      fallbackTitle,
      skillName,
      userLevel,
    );

    // Step 2: Detect if query is likely to fail
    const isLikelyWeak = this.isWeakSearchQuery(
      deterministicQuery,
      skillName,
      context?.skillType,
    );

    if (!isLikelyWeak) {
      return deterministicQuery;
    }

    // Step 3: Check cache before calling AI
    const cacheKey = this.buildSearchQueryCacheKey(
      skillName || '',
      context?.dayNumber || 0,
      context?.skillLevel || 'BEGINNER',
    );

    const cached = this.searchQueryCache.get(cacheKey);
    if (cached) {
      this.logger.log(`🔍 Search query cache HIT: "${cached}"`);
      return cached;
    }

    // Step 4: Fall back to AI for better query generation
    this.logger.log(
      `🤖 Weak query detected ("${deterministicQuery}"), using AI fallback...`,
    );

    try {
      const aiQuery = await this.generateSearchQueryWithAI({
        skillName: skillName || '',
        dayTitle: fallbackTitle,
        foundationConcepts: this.extractTopConcepts(dayContent, 3),
        taskTitle: dayContent.task1?.title,
        skillLevel: context?.skillLevel || 'BEGINNER',
        dayObjectives: context?.dayObjectives || [],
      });

      if (aiQuery && aiQuery.length >= 8) {
        // Cache the AI result
        this.searchQueryCache.set(cacheKey, aiQuery);
        this.logger.log(`✅ AI query generated and cached: "${aiQuery}"`);
        return aiQuery;
      }
    } catch (error) {
      this.logger.warn(`⚠️ AI query generation failed: ${error.message}`);
    }

    // Fallback to deterministic if AI fails
    return deterministicQuery;
  }

  /**
   * Deterministic search query extraction (FREE, no AI)
   * Improved V3: proper normalization, more signals, level modifiers
   */
  private extractSearchQueryDeterministic(
    dayContent: any,
    fallbackTitle: string,
    skillName?: string,
    userLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner',
  ): string {
    // Normalize text: lowercase, alphanumeric only, single spaces
    const norm = (s: string) =>
      (s ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Strip question prefixes and leading articles
    const stripLead = (s: string) =>
      s
        .replace(/^(what is|what are|how to|why|when to use)\s*/i, '')
        .replace(/\?$/, '')
        .replace(/^(a|an|the)\s+/i, '')
        .trim();

    // Generic words that don't help YouTube search
    const GENERIC = new Set([
      'understanding',
      'introduction',
      'intro',
      'overview',
      'basics',
      'fundamentals',
      'thinking',
      'principles',
      'guide',
      'learn',
      'learning',
      'session',
      'day',
      'module',
      'chapter',
      'unit',
      'lesson',
      'part',
      'section',
      'step',
      'what',
      'how',
      'why',
      'when',
      'where',
      'which',
      'who', // question words
    ]);

    // 1) Extract skill context
    let skillContext = '';
    if (skillName) {
      const cleaned = norm(skillName)
        .replace(
          /\b(platform|basics|fundamentals|introduction|intro|learning|learn|course|tutorial|and|the|a|an)\b/g,
          '',
        )
        .replace(/\s+/g, ' ')
        .trim();

      const words = cleaned.split(' ').filter((w) => w.length > 2);
      skillContext = words.slice(0, 2).join(' ');

      // Fallback if we stripped everything
      if (!skillContext) {
        const rawWords = norm(skillName)
          .split(' ')
          .filter((w) => w.length > 2 && !GENERIC.has(w));
        skillContext = rawWords.slice(0, 2).join(' ');
      }
    }

    // 2) Day concept: keyTopics > cards (0-6) > tasks (1-3)
    let dayConcept = '';

    // Try keyTopics first (most specific)
    const keyTopics = Array.isArray(dayContent?.keyTopics)
      ? dayContent.keyTopics
      : [];
    if (keyTopics.length) {
      dayConcept = stripLead(norm(keyTopics.slice(0, 2).join(' ')));
    }

    // Try foundation cards (first 6, not just 1-3)
    const cards =
      dayContent?.languageFoundationCards || dayContent?.foundationCards;
    if (!dayConcept && Array.isArray(cards)) {
      for (const card of cards.slice(0, 6)) {
        const c = stripLead(
          norm(card?.concept || card?.vocabulary?.term || ''),
        );
        const words = c.split(' ').filter(Boolean);
        if (
          c &&
          words.length >= 1 &&
          words.length <= 6 &&
          !GENERIC.has(words[0])
        ) {
          dayConcept = c;
          break;
        }
      }
    }

    // Try task titles (task1, task2, task3)
    if (!dayConcept) {
      for (const t of [
        dayContent?.task1,
        dayContent?.task2,
        dayContent?.task3,
      ]) {
        if (!t?.title) continue;
        const title = stripLead(
          norm(t.title).replace(
            /^(build|create|implement|write|make|set up|configure)\s*/i,
            '',
          ),
        );
        const words = title.split(' ').filter(Boolean);
        if (title && words.length >= 1 && words.length <= 6) {
          dayConcept = title;
          break;
        }
      }
    }

    // 3) Smart fallback from title (filter generic words, keep up to 5 meaningful words)
    const fallbackWords = norm(fallbackTitle)
      .split(' ')
      .filter((w) => w.length > 2 && !GENERIC.has(w));
    const fallbackConcept = fallbackWords.slice(0, 5).join(' ');

    // 4) Level modifier for better YouTube matches
    const modifier =
      userLevel === 'beginner'
        ? 'tutorial explained'
        : userLevel === 'intermediate'
          ? 'tutorial example'
          : 'deep dive';

    // 5) Compose final query
    const base = [skillContext, dayConcept || fallbackConcept]
      .filter(Boolean)
      .join(' ')
      .trim();

    // Normalize and cap at 70 chars
    return norm(`${base} ${modifier}`).slice(0, 70);
  }

  /**
   * Detect if a search query is likely to fail on YouTube
   * Checks the "base" content, ignoring level modifiers added by deterministic extractor
   */
  private isWeakSearchQuery(
    query: string,
    skillName?: string,
    skillType?: string,
  ): boolean {
    // Level modifiers added by deterministic extractor - ignore these
    const LEVEL_MODIFIERS = new Set([
      'tutorial',
      'explained',
      'example',
      'deep',
      'dive',
      'beginner',
      'beginners',
    ]);

    const queryLower = query.toLowerCase();
    const allWords = queryLower.split(/\s+/);

    // Filter out level modifiers to check the "base" content
    const words = allWords.filter((w) => !LEVEL_MODIFIERS.has(w));

    // Check 1: Base query too short (< 8 chars or only 1 word after filtering modifiers)
    const baseQuery = words.join(' ');
    if (baseQuery.length < 8 || words.length <= 1) {
      return true;
    }

    // Check 2: Contains too many generic/abstract words (relative to total)
    const genericWordCount = words.filter((w) =>
      GENERIC_QUERY_WORDS.has(w),
    ).length;
    if (genericWordCount >= 2 || (genericWordCount >= 1 && words.length <= 2)) {
      return true;
    }

    // Check 3: Skill type is abstract (soft skills, critical thinking, etc.)
    if (skillType && ABSTRACT_SKILL_TYPES.has(skillType)) {
      return true;
    }

    // Check 4: No concrete nouns (heuristic: all words are common English)
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'dare',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'as',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'between',
      'under',
      'again',
      'further',
      'then',
      'once',
      'here',
      'there',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'every',
      'both',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',
      'no',
      'nor',
      'not',
      'only',
      'own',
      'same',
      'so',
      'than',
      'too',
      'very',
      'just',
      'and',
      'but',
      'if',
      'or',
      'because',
      'until',
      'while',
      'about',
    ]);
    const concreteWords = words.filter(
      (w) => w.length > 3 && !commonWords.has(w) && !GENERIC_QUERY_WORDS.has(w),
    );
    if (concreteWords.length === 0) {
      return true;
    }

    return false;
  }

  /**
   * Generate search queries using AI (small, constrained call)
   * Returns the best query from 3 candidates
   */
  private async generateSearchQueryWithAI(params: {
    skillName: string;
    dayTitle: string;
    foundationConcepts: string[];
    taskTitle?: string;
    skillLevel: string;
    dayObjectives: string[];
  }): Promise<string | null> {
    const levelModifier =
      {
        BEGINNER: 'beginner tutorial',
        INTERMEDIATE: 'explained',
        ADVANCED: 'deep dive',
      }[params.skillLevel] || 'tutorial';

    const prompt = `Generate 3 YouTube search queries for finding a video about this topic.

SKILL: ${params.skillName}
DAY TOPIC: ${params.dayTitle}
FOUNDATION CONCEPTS: ${params.foundationConcepts.join(', ') || 'none'}
TASK: ${params.taskTitle || 'none'}
OBJECTIVES: ${params.dayObjectives.slice(0, 3).join(', ') || 'none'}
LEVEL: ${params.skillLevel}

Requirements:
- Each query max 70 characters
- Include skill/domain terms (not just generic words)
- Add level modifier like "${levelModifier}" where helpful
- Optimize for YouTube search (what would a real person search?)

Return JSON only:
{"queries": ["query1", "query2", "query3"], "best": 0, "reason": "one line why"}`;

    const response = await this.aiService.routeRequest(
      AITask.LIGHTWEIGHT_EXTRACTION,
      prompt,
      'You are a YouTube search optimization expert. Return valid JSON only.',
    );

    try {
      const cleaned = response.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const result = JSON.parse(cleaned);

      if (
        result.queries &&
        Array.isArray(result.queries) &&
        result.queries.length > 0
      ) {
        const bestIdx = typeof result.best === 'number' ? result.best : 0;
        const bestQuery = result.queries[bestIdx] || result.queries[0];

        // Enforce max 70 chars
        return bestQuery.slice(0, 70);
      }
    } catch {
      // Parse failed
    }

    return null;
  }

  /**
   * Extract top N concepts from day content for AI context
   */
  private extractTopConcepts(dayContent: any, limit: number): string[] {
    const concepts: string[] = [];
    const cards =
      dayContent.languageFoundationCards || dayContent.foundationCards;

    if (cards && Array.isArray(cards)) {
      for (const card of cards.slice(0, limit + 1)) {
        const text = card.vocabulary?.term || card.concept;
        if (text) {
          const cleaned = text
            .replace(/^(What is|What are|How to|Why|When to use)\s*/i, '')
            .replace(/\?$/, '')
            .trim();
          if (cleaned && cleaned.length > 2) {
            concepts.push(cleaned);
          }
        }
        if (concepts.length >= limit) break;
      }
    }

    return concepts;
  }

  /**
   * Build cache key for search query
   */
  private buildSearchQueryCacheKey(
    skillName: string,
    dayNumber: number,
    skillLevel: string,
  ): string {
    const normalizedSkill = skillName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .slice(0, 50);
    return `sq:${normalizedSkill}:d${dayNumber}:${skillLevel.toLowerCase()}`;
  }

  constructor(
    private aiService: AiService,
    private skillDetector: SkillDetectorService,
    private videoMatcher: VideoMatchingService,
    private configService: ConfigService,
    private cacheService: CurriculumCacheService,
    private universityResource: UniversityResourceService,
    private docFetcher: DocumentationFetchService,
  ) {}

  async generateCurriculum(
    dto: GenerateCurriculumDto,
    userTier: string = 'FREE',
  ): Promise<CurriculumResult> {
    this.logger.log(
      `🎯 Generating curriculum: ${dto.skillName} (${dto.durationDays} days, ${userTier} tier)`,
    );

    // Step 0+1: Use pre-computed skill detection if available (from estimate-days),
    // otherwise run moderation + detection (for direct generate calls)
    let skillDetection;
    if (dto.skillDetection) {
      skillDetection = dto.skillDetection;
      this.logger.log(`♻️ Reusing pre-computed skill detection (skipping duplicate AI call)`);
    } else {
      const moderationResult = await this.skillDetector.moderateContent(
        dto.skillName,
      );
      if (!moderationResult.isAllowed) {
        throw new BadRequestException({
          message: 'This topic violates AI content policy and cannot be used for curriculum generation. Please choose a different learning topic.',
          error: 'AI_CONTENT_POLICY_VIOLATION',
          flaggedCategories: moderationResult.flaggedCategories,
        });
      }

      skillDetection = await this.skillDetector.detectSkillType(
        dto.skillName,
      );
    }

    this.logger.log(
      `✅ Skill detected: ${skillDetection.skillType} (${skillDetection.complexity})`,
    );

    // Step 2: Validate timeframe
    const timeframeValidation = this.skillDetector.validateTimeframe(
      skillDetection.estimatedDaysNeeded,
      dto.durationDays,
      skillDetection.complexity,
    );

    const warnings: string[] = [];
    if (timeframeValidation.warning) {
      warnings.push(timeframeValidation.warning);
    }
    if (timeframeValidation.recommendation) {
      warnings.push(timeframeValidation.recommendation);
    }

    if (!timeframeValidation.feasible) {
      throw new BadRequestException(
        `This skill cannot be taught in ${dto.durationDays} days. ${timeframeValidation.recommendation}`,
      );
    }

    // Step 3: Build curriculum prompt with caching support (skeleton only)
    // Include full learner preferences from onboarding directions
    const learnerPrefs = {
      selectedDirection: dto.selectedDirection,
      selectedDirectionOutcome: dto.selectedDirectionOutcome,
      directionKeywords: dto.directionKeywords,
      selectedLanguage: dto.selectedLanguage,
      // Output type - what user wants to achieve
      outputType: dto.outputType,
      // Feeling-based inputs from onboarding
      familiarity: dto.familiarity,
      sessionLength: dto.sessionLength,
      contentDepth: dto.contentDepth,
      // Explicit learning style choice (projects vs practice)
      learningStyle: dto.learningStyle,
    };

    // Use user's selected language if provided, otherwise use auto-detected
    const effectiveLanguage =
      dto.selectedLanguage || skillDetection.suggestedLanguage;

    // For micro-lesson mode, cap duration at 3 days (direction + gap focused)
    let effectiveDurationDays = dto.durationDays;
    let effectiveHoursPerDay = dto.hoursPerDay;
    if (dto.microLessonMode) {
      effectiveDurationDays = Math.min(3, effectiveDurationDays);
      effectiveHoursPerDay = Math.min(effectiveHoursPerDay, 0.5); // Shorter sessions for micro-lessons
      this.logger.log(
        `📐 Micro-lesson mode: ${effectiveDurationDays} days, ${effectiveHoursPerDay}h/day`,
      );
    }

    const { staticPart, dynamicPart, userPrompt } =
      buildCacheableCurriculumPrompt({
        skillName: dto.skillName,
        durationDays: effectiveDurationDays,
        hoursPerDay: effectiveHoursPerDay,
        skillLevel: dto.skillLevel,
        skillType: skillDetection.skillType,
        complexity: skillDetection.complexity,
        userTier,
        suggestedLanguage: effectiveLanguage,
        prerequisiteSkills: skillDetection.prerequisiteSkills,
        learnerPrefs,
        customSections: skillDetection.customSections,
        goalType: dto.goalType,
        gapProfile: dto.gapProfile,
        microLessonMode: dto.microLessonMode,
      });

    // Step 4: Generate curriculum OVERVIEW with AI (Phase 1) - with prompt caching
    this.logger.log(
      '🤖 Generating curriculum overview (Phase 1) with prompt caching...',
    );
    const aiResponse = await this.aiService.callAnthropicWithCache(
      'claude-haiku-4-5-20251001',
      userPrompt,
      { staticPart, dynamicPart },
    );

    // Step 5: Parse and validate curriculum
    let curriculum: any;
    try {
      let cleanedContent = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Try to extract JSON if there's extra text before/after
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedContent = jsonMatch[0];
      }

      // Try parsing, if fails attempt to fix common issues
      try {
        curriculum = JSON.parse(cleanedContent);
      } catch (parseError) {
        this.logger.warn('First parse failed, attempting to fix JSON...');
        // Fix trailing commas (common AI mistake)
        let fixedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');

        // If response was truncated, attempt to close open JSON brackets
        if (aiResponse.truncated) {
          this.logger.warn('Response was truncated (max_tokens hit) — attempting to close JSON...');
          fixedContent = this.repairTruncatedJson(fixedContent);
        }

        curriculum = JSON.parse(fixedContent);
        this.logger.log('✅ JSON fixed and parsed successfully');
      }

      this.logger.log('✅ Curriculum overview parsed successfully');
    } catch (error) {
      this.logger.error('❌ Failed to parse curriculum JSON:', error.message);
      this.logger.error(
        'Raw AI response (first 1000 chars):',
        aiResponse.content.substring(0, 1000),
      );
      if (aiResponse.truncated) {
        this.logger.error('Response was truncated — AI hit output token limit. Curriculum may be too long.');
      }
      throw new BadRequestException(
        'Failed to generate curriculum overview. Please try again.',
      );
    }

    // Calculate isProjectBased ONCE and store it - don't re-calculate later
    const isProjectBased = usesProjectBasedLearning(dto.learningStyle);
    this.logger.log(
      `🎯 Curriculum type: ${isProjectBased ? 'PROJECT-BASED' : 'PRACTICE-BASED'}`,
    );

    // Validate curriculum structure before proceeding
    // AI sometimes returns 'curriculum' array instead of 'days' - normalize it
    if (!curriculum.days && Array.isArray(curriculum.curriculum)) {
      this.logger.warn(
        'AI returned "curriculum" array instead of "days" - normalizing',
      );
      curriculum.days = curriculum.curriculum;
      delete curriculum.curriculum;
    }

    if (
      !curriculum.days ||
      !Array.isArray(curriculum.days) ||
      curriculum.days.length === 0
    ) {
      this.logger.error(
        '❌ AI returned invalid curriculum structure - missing days array',
      );
      this.logger.error(
        'Curriculum received:',
        JSON.stringify(curriculum).substring(0, 500),
      );
      throw new BadRequestException(
        'Failed to generate curriculum - invalid structure. Please try again.',
      );
    }

    // Add metadata to curriculum
    curriculum.metadata = {
      skillName: dto.skillName,
      durationDays: dto.durationDays,
      hoursPerDay: dto.hoursPerDay,
      skillLevel: dto.skillLevel,
      skillType: skillDetection.skillType,
      complexity: skillDetection.complexity,
      suggestedLanguage: effectiveLanguage, // User's selected language (or auto-detected if not chosen)
      learningStyle: dto.learningStyle, // User's explicit choice (projects vs practice)
      isProjectBased, // Store this - use it consistently, don't re-calculate
      codeWritingEnabled: dto.codeWritingEnabled, // Advanced mode: include code completion exercises
      // Language learning specific (from skill detection)
      isLanguageLearning: skillDetection.isLanguageLearning,
      targetLanguage: skillDetection.targetLanguage,
      proficiencyLevel: skillDetection.proficiencyLevel,
      // Training mode goal type
      goalType: dto.goalType,
      // Gap session: micro-lesson mode (skip intensive practice + openTask)
      isGapSession: !!dto.microLessonMode,
    };

    // All days are skeletons - full content generated on-demand when user starts each day
    curriculum.days = curriculum.days.map((day: any, index: number) => ({
      ...day,
      status: index === 0 ? 'unlockable' : 'locked',
      detailsLoaded: false, // Full content will be loaded when user clicks "Start Learning"
    }));

    this.logger.log(
      `✅ Curriculum overview generated. Tokens: ${aiResponse.tokensUsed}, Cost: $${aiResponse.cost.toFixed(4)}`,
    );

    // Note: Video search for each day happens in generateDayDetails when user starts the day

    return {
      curriculum,
      tokensUsed: aiResponse.tokensUsed,
      cost: aiResponse.cost,
      skillDetection,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Generate CORE day content (fast initial load)
   * Returns: prePrompt, video, task1
   * Includes caching for instant loads on repeat views
   */
  async generateDayCoreDetails(
    curriculum: any,
    dayNumber: number,
    userTier: string = 'FREE',
    forceRegenerate?: boolean,
    userId?: string,
    sessionId?: string,
    improvementAreas?: string[],
    lessOfAreas?: string[],
  ): Promise<DayCoreResult> {
    this.logger.log(`🚀 Generating Day ${dayNumber} CORE content...`);

    const dayOverview = curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      throw new BadRequestException(`Day ${dayNumber} not found in curriculum`);
    }

    // Check cache first (skip if forceRegenerate)
    const cacheKey = await this.buildDayCacheKey(
      curriculum.metadata,
      dayNumber,
      'core',
    );
    if (!forceRegenerate) {
      // Use variant-aware caching if userId and sessionId provided
      if (userId && sessionId) {
        const cachedResult = await this.cacheService.getDayContentWithVariant(
          cacheKey,
          userId,
          sessionId,
          dayNumber,
        );
        if (cachedResult) {
          // task1 is REQUIRED - if missing, bypass cache and regenerate
          const cachedTask1 = cachedResult.content?.task1;
          // Also accept old format with foundationCards for backward compat
          const hasOldCards = cachedResult.content?.foundationCards?.length > 0 ||
            cachedResult.content?.languageFoundationCards?.length > 0;

          if (!cachedTask1?.sections && !hasOldCards) {
            // Continue to regeneration - content is missing
          } else {
            this.logger.log(
              `📦 Day ${dayNumber} CORE variant cache HIT (variant=${cachedResult.variantId})`,
            );
            return {
              coreContent: cachedResult.content,
              tokensUsed: 0,
              cost: 0,
              fromCache: true,
              variantId: cachedResult.variantId,
            };
          }
        }
      } else {
        // Fallback to legacy cache for backward compatibility
        const cached = await this.cacheService.getDayContent(cacheKey);
        if (cached) {
          // task1 is REQUIRED - if missing, bypass cache and regenerate
          const cachedTask1 = cached?.task1;
          const hasOldCards = cached?.foundationCards?.length > 0 ||
            cached?.languageFoundationCards?.length > 0;

          if (!cachedTask1?.sections && !hasOldCards) {
            // Continue to regeneration - content is missing
          } else {
            this.logger.log(`📦 Day ${dayNumber} CORE cache HIT (legacy)`);
            return {
              coreContent: cached,
              tokensUsed: 0,
              cost: 0,
              fromCache: true,
            };
          }
        }
      }
    } else {
      this.logger.log(
        `🔄 Force regenerating Day ${dayNumber} CORE (bypassing L2 cache)`,
      );
    }

    const previousDay = curriculum.days.find(
      (d: any) => d.day === dayNumber - 1,
    );

    // Get reflection data from previous day (if any)
    const previousDayReflection = previousDay?.reflectionData
      ? {
          confusedConcepts: previousDay.reflectionData.confusedConcepts,
          confidence: previousDay.reflectionData.confidence,
          boostCompleted: previousDay.reflectionData.boostCompleted,
          whatsFoggy: previousDay.reflectionData.whatsFoggy,
        }
      : undefined;

    // Get strategy fields from skeleton
    const contentLayer = dayOverview.contentLayer || 'framework';
    const contentSource = dayOverview.contentSource || 'youtube';
    const videoStrategy = 'skip';

    // Build search concept for university/docs searches
    const searchConcept = (dayOverview.title || '')
      .replace(/^Day\s*\d+\s*[:.-]\s*/i, '')
      .replace(/&/g, ' ')
      .replace(
        /\b(Basic|Basics|Beginner|Beginning|Introduction to|Intro to|Advanced|Intermediate|Fundamentals of|Fundamentals|Essential|Essentials|Getting Started with|Overview of|Deep Dive into|Mastering)\b/gi,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();

    // Extract day objectives for smarter search
    const dayObjectives: string[] = dayOverview.skills || [];

    // Build enhanced university search query using objectives
    // Combine title concept with top objectives for better relevance
    const universitySearchQuery = this.buildUniversitySearchQuery(
      searchConcept,
      dayObjectives,
      curriculum.metadata.skillName,
    );

    // Start parallel searches for university resources and documentation
    // Skip university search if video is skipped (no need for lecture videos/notes)
    let universityResourcePromise: Promise<any> | null = null;
    let docFetchPromise: Promise<DocFetchResult | null> | null = null;

    // Only run university search if video is not skipped
    if (videoStrategy !== 'skip') {
      this.logger.log(
        `🎓 Starting university resource search for: "${universitySearchQuery}" (objectives: ${dayObjectives.slice(0, 2).join(', ')})`,
      );
      universityResourcePromise = Promise.all([
        this.universityResource.searchResources(
          universitySearchQuery,
          'lecture_video',
          2,
          dayObjectives,
        ),
        this.universityResource.searchResources(
          universitySearchQuery,
          'lecture_notes',
          2,
          dayObjectives,
        ),
        this.universityResource.searchResources(
          universitySearchQuery,
          'problem_set',
          2,
          dayObjectives,
        ),
      ]).catch((error) => {
        this.logger.warn(
          `⚠️ University resource search failed: ${error.message}`,
        );
        return null;
      });
    } else {
      this.logger.log(
        `⏭️ Skipping university resource search (videoStrategy=skip)`,
      );
    }

    if (contentSource === 'docs') {
      this.logger.log(
        `📚 Starting documentation fetch for: "${searchConcept}"`,
      );
      docFetchPromise = this.docFetcher
        .fetchDocumentation(
          searchConcept,
          curriculum.metadata.suggestedLanguage,
          3,
        )
        .catch((error) => {
          this.logger.warn(`⚠️ Documentation fetch failed: ${error.message}`);
          return null;
        });
    }

    const params: DayDetailParams = {
      skillName: curriculum.metadata.skillName,
      dayNumber,
      dayTitle: dayOverview.title,
      dayObjectives: dayOverview.skills,
      skeleton: dayOverview,
      previousDayTitle: previousDay?.title,
      previousDayReflection,
      skillType: curriculum.metadata.skillType,
      skillLevel: curriculum.metadata.skillLevel,
      complexity: curriculum.metadata.complexity,
      userTier,
      hoursPerDay: curriculum.metadata.hoursPerDay,
      suggestedLanguage: curriculum.metadata.suggestedLanguage,
      learningStyle: curriculum.metadata.learningStyle, // User's explicit choice from onboarding
      isProjectBased: curriculum.metadata.isProjectBased, // Use stored value, don't re-calculate
      codeWritingEnabled: curriculum.metadata.codeWritingEnabled, // Advanced mode: code completion
      // Language learning specific
      isLanguageLearning: curriculum.metadata.isLanguageLearning,
      targetLanguage: curriculum.metadata.targetLanguage,
      proficiencyLevel: curriculum.metadata.proficiencyLevel,
      // User-specified focus areas
      improvementAreas,
      // User-specified areas to reduce content for
      lessOfAreas,
      // Training mode goal type
      goalType: curriculum.metadata.goalType,
    };

    const { staticPart, dynamicPart, userPrompt } =
      buildCacheableDayDetailCorePrompt(params);

    // Single Sonnet call for core content (prePrompt now from skeleton, no Haiku needed)
    this.logger.log(`🚀 Starting Sonnet call for Day ${dayNumber} CORE`);

    const [aiResponse] = await Promise.all([
      this.aiService.callAnthropicWithCache(
        'claude-sonnet-4-20250514',
        userPrompt,
        { staticPart, dynamicPart },
      ),
    ]);

    let coreContent: any;
    try {
      let cleanedContent = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedContent = jsonMatch[0];
      }

      try {
        coreContent = JSON.parse(cleanedContent);
      } catch {
        const fixedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
        coreContent = JSON.parse(fixedContent);
      }

      normalizeTask1Sections(coreContent, dayNumber);

      // Note: bossMilestone is now generated in DEFERRED content, not CORE
      // Remove any legacy bossMilestone from core if present (old cached data)
      if (coreContent.bossMilestone) {
        this.logger.log(
          `ℹ️ Day ${dayNumber} removing legacy bossMilestone from CORE (now in DEFERRED)`,
        );
        delete coreContent.bossMilestone;
      }

      const cardCount =
        coreContent.languageFoundationCards?.length ||
        coreContent.foundationCards?.length ||
        0;
      this.logger.log(
        `✅ Day ${dayNumber} CORE parsed: ${cardCount} cards${coreContent.languageFoundationCards ? ' (vocabulary)' : ''}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to parse Day ${dayNumber} CORE:`,
        error.message,
      );
      this.logger.error(
        `❌ Raw content that failed to parse: ${aiResponse.content.substring(0, 1000)}`,
      );
      throw new BadRequestException(
        'Failed to generate core day content. Please try again.',
      );
    }

    // Add prePrompt from skeleton (not AI-generated)
    const skills: string[] = dayOverview.skills || dayOverview.objectives || [];
    coreContent.prePrompt = {
      text: `Today you'll learn about ${dayOverview.title}`,
      skills,
    };

    // Add metadata (using already-declared variables)
    coreContent.contentLayer = contentLayer;
    coreContent.videoStrategy = videoStrategy;
    coreContent.contentSource = contentSource;

    // ====== VIDEO SEARCH FOR CORE CONTENT (using shared helper) ======
    // Includes multi-model alignment verification (Haiku checks Gemini's video selection)
    const videoResult = await this.searchAndProcessVideo({
      content: coreContent,
      searchConcept: dayOverview.title,
      skillName: curriculum.metadata.skillName,
      skillLevel: curriculum.metadata.skillLevel,
      skillType: curriculum.metadata.skillType,
      videoStrategy: coreContent.videoStrategy,
      contentSource: coreContent.contentSource,
      hoursPerDay: curriculum.metadata.hoursPerDay || 1,
      dayNumber,
      includeAlternatives: false, // CORE doesn't need alternatives
      dayObjectives: dayOverview.skills || [], // For multi-model alignment verification
    });

    if (videoResult) {
      coreContent.video = videoResult.video;
    } else {
      // Video skipped - foundation cards ARE the learning content
      // No need to generate redundant AI-curated summary
      coreContent.video = {
        videoAvailable: false,
        showVideoOption: false,
        skipped: true,
      };
    }
    // ====== END VIDEO SEARCH ======

    // Await parallel searches (university always runs alongside YouTube now)
    const universityResults = universityResourcePromise
      ? await universityResourcePromise
      : null;
    const docResult = docFetchPromise ? await docFetchPromise : null;

    // Minimum confidence thresholds for content sources
    const MIN_UNIVERSITY_CONFIDENCE = 30;

    // Add university resources (lecture videos, notes, problem sets) if available
    // Filter by confidence threshold
    if (universityResults) {
      const [lectureVideoResult, lectureNotesResult, problemSetsResult] =
        universityResults;
      const universityResources: any[] = [];

      if (
        lectureVideoResult?.success &&
        lectureVideoResult.resources?.length > 0
      ) {
        const filteredVideos = lectureVideoResult.resources.filter(
          (r: any) => r.confidence >= MIN_UNIVERSITY_CONFIDENCE,
        );
        universityResources.push(
          ...filteredVideos.map((r: any) => ({
            type: 'lecture_video',
            source: r.source,
            title: r.title,
            url: r.url,
            description: r.description,
            confidence: r.confidence,
          })),
        );
        if (filteredVideos.length < lectureVideoResult.resources.length) {
          this.logger.log(
            `🎓 Filtered ${lectureVideoResult.resources.length - filteredVideos.length} low-confidence lecture videos`,
          );
        }
      }

      if (
        lectureNotesResult?.success &&
        lectureNotesResult.resources?.length > 0
      ) {
        const filteredNotes = lectureNotesResult.resources.filter(
          (r: any) => r.confidence >= MIN_UNIVERSITY_CONFIDENCE,
        );
        universityResources.push(
          ...filteredNotes.map((r: any) => ({
            type: 'lecture_notes',
            source: r.source,
            title: r.title,
            url: r.url,
            description: r.description,
            confidence: r.confidence,
          })),
        );
      }

      if (
        problemSetsResult?.success &&
        problemSetsResult.resources?.length > 0
      ) {
        const filteredProblems = problemSetsResult.resources.filter(
          (r: any) => r.confidence >= MIN_UNIVERSITY_CONFIDENCE,
        );
        universityResources.push(
          ...filteredProblems.map((r: any) => ({
            type: 'problem_set',
            source: r.source,
            title: r.title,
            url: r.url,
            description: r.description,
            confidence: r.confidence,
          })),
        );
      }

      if (universityResources.length > 0) {
        coreContent.universityResources = universityResources;
        const topConfidence = Math.max(
          ...universityResources.map((r: any) => r.confidence),
        );
        this.logger.log(
          `✅ Day ${dayNumber}: Found ${universityResources.length} university resources (top confidence: ${topConfidence}%)`,
        );
      }
    }

    // Log video source selection summary
    const youtubeConfidence = videoResult?.rawResult?.matchPercent || 0;
    const universityVideoConfidence =
      coreContent.universityResources?.find(
        (r: any) => r.type === 'lecture_video',
      )?.confidence || 0;
    const hasYouTube =
      youtubeConfidence >= this.MIN_VIDEO_CONFIDENCE &&
      videoResult?.rawResult?.success;
    const hasUniversity =
      universityVideoConfidence >= MIN_UNIVERSITY_CONFIDENCE;

    if (hasYouTube && hasUniversity) {
      this.logger.log(
        `📊 Both sources available - YouTube: ${youtubeConfidence}% (preferred), University: ${universityVideoConfidence}%`,
      );
    } else if (hasYouTube) {
      this.logger.log(`📊 YouTube only: ${youtubeConfidence}%`);
    } else if (hasUniversity) {
      this.logger.log(`📊 University only: ${universityVideoConfidence}%`);
    } else {
      this.logger.log(
        `📊 No video sources met confidence threshold (YouTube: ${youtubeConfidence}%, University: ${universityVideoConfidence}%)`,
      );
    }

    // Add official documentation resources if available
    if (docResult?.success && docResult.docs?.length > 0) {
      coreContent.documentation = {
        source: docResult.source,
        searchQuery: docResult.searchQuery,
        resources: docResult.docs.map((doc) => ({
          title: doc.title,
          url: doc.url,
          source: doc.source,
          sections: doc.sections.map((section) => ({
            heading: section.heading,
            content: section.content,
            codeExamples: section.codeExamples,
            apiSignatures: section.apiSignatures,
          })),
        })),
      };
      this.logger.log(
        `✅ Day ${dayNumber}: Found ${docResult.docs.length} documentation pages from ${docResult.source}`,
      );
    }

    // Cache the result with variant tracking if userId and sessionId provided
    let variantId: string | undefined;
    if (userId && sessionId) {
      const cacheResult = await this.cacheService.cacheDayContentWithVariant(
        cacheKey,
        coreContent,
        userId,
        sessionId,
        dayNumber,
      );
      variantId = cacheResult.variantId;
      this.logger.log(
        `✅ Day ${dayNumber} CORE generated and cached with variant=${variantId}`,
      );
    } else {
      // Fallback to legacy cache
      await this.cacheService.setDayContent(cacheKey, coreContent);
      this.logger.log(`✅ Day ${dayNumber} CORE generated (legacy cache)`);
    }

    this.logger.log(
      `✅ Day ${dayNumber} CORE generated. Tokens: ${aiResponse.tokensUsed}`,
    );

    // Extract task1 concepts for passing to deferred generation
    const task1Concepts = extractTask1Concepts(coreContent);
    this.logger.log(
      `📚 Extracted ${task1Concepts.length} task1 concepts for deferred generation`,
    );

    return {
      coreContent,
      tokensUsed: aiResponse.tokensUsed,
      cost: aiResponse.cost,
      fromCache: false,
      variantId,
      task1Concepts,
    };
  }

  /**
   * Stream event types for real-time UI updates
   */
  static readonly STREAM_EVENTS = {
    TASK1_SECTION_START: 'task1SectionStart',
    TASK1_QUESTION: 'task1Question',
    TASK1_SECTION: 'task1Section',
    TASK1: 'task1',
    VIDEO: 'video',
    COMPLETE: 'complete',
    ERROR: 'error',
  } as const;

  /**
   * Generate CORE day content with STREAMING
   * Yields foundation cards as they're parsed for real-time UI updates
   * Same logic as generateDayCoreDetails but streams partial results
   */
  async *generateDayCoreDetailsStream(
    curriculum: any,
    dayNumber: number,
    userTier: string = 'FREE',
    forceRegenerate?: boolean,
    userId?: string,
    sessionId?: string,
    improvementAreas?: string[],
    lessOfAreas?: string[],
  ): AsyncGenerator<{
    event: string;
    data: any;
  }> {
    this.logger.log(`🚀 Streaming Day ${dayNumber} CORE content...`);

    const dayOverview = curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      yield {
        event: CurriculumService.STREAM_EVENTS.ERROR,
        data: { error: `Day ${dayNumber} not found in curriculum` },
      };
      return;
    }

    // Check cache first
    const cacheKey = await this.buildDayCacheKey(
      curriculum.metadata,
      dayNumber,
      'core',
    );
    if (!forceRegenerate && userId && sessionId) {
      const cachedResult = await this.cacheService.getDayContentWithVariant(
        cacheKey,
        userId,
        sessionId,
        dayNumber,
      );
      if (cachedResult) {
        this.logger.log(`📦 Day ${dayNumber} CORE cache HIT (streaming)`);
        // Yield cached content per-question for consistent progressive UX
        if (cachedResult.content.task1?.sections?.length) {
          for (const [i, section] of cachedResult.content.task1.sections.entries()) {
            const items = section.questions || section.items || section.pairs || [];
            const containerKey = section.questions ? 'questions' : section.items ? 'items' : 'pairs';
            this.logger.log(
              `📡 Stream (cached): section ${i} (${section.type}) with ${items.length} items`,
            );
            yield {
              event: CurriculumService.STREAM_EVENTS.TASK1_SECTION_START,
              data: { index: i, type: section.type, title: section.title, containerKey },
            };
            for (const [qIdx, question] of items.entries()) {
              yield {
                event: CurriculumService.STREAM_EVENTS.TASK1_QUESTION,
                data: { sectionIndex: i, questionIndex: qIdx, question },
              };
            }
            // Also yield complete section for finalization
            yield {
              event: CurriculumService.STREAM_EVENTS.TASK1_SECTION,
              data: { section, index: i },
            };
          }
          yield {
            event: CurriculumService.STREAM_EVENTS.TASK1,
            data: cachedResult.content.task1,
          };
        }
        // Always emit video event (even when skipped) so frontend can skip video step
        yield {
          event: CurriculumService.STREAM_EVENTS.VIDEO,
          data: cachedResult.content.video || { skipped: true },
        };
        yield {
          event: CurriculumService.STREAM_EVENTS.COMPLETE,
          data: {
            coreContent: cachedResult.content,
            tokensUsed: 0,
            fromCache: true,
            variantId: cachedResult.variantId,
          },
        };
        return;
      }
    }

    // Build params for prompt (same as non-streaming)
    const previousDay = curriculum.days.find(
      (d: any) => d.day === dayNumber - 1,
    );
    const previousDayReflection = previousDay?.reflectionData
      ? {
          confusedConcepts: previousDay.reflectionData.confusedConcepts,
          confidence: previousDay.reflectionData.confidence,
          boostCompleted: previousDay.reflectionData.boostCompleted,
          whatsFoggy: previousDay.reflectionData.whatsFoggy,
        }
      : undefined;

    const contentLayer = dayOverview.contentLayer || 'framework';
    const contentSource = dayOverview.contentSource || 'youtube';
    // TODO: Temporarily skip video search for all courses 
    const videoStrategy = 'skip';
    const params = {
      skillName: curriculum.metadata.skillName,
      dayNumber,
      dayTitle: dayOverview.title,
      dayObjectives: dayOverview.skills,
      skeleton: dayOverview,
      previousDayTitle: previousDay?.title,
      previousDayReflection,
      skillType: curriculum.metadata.skillType,
      skillLevel: curriculum.metadata.skillLevel,
      complexity: curriculum.metadata.complexity,
      userTier,
      hoursPerDay: curriculum.metadata.hoursPerDay,
      suggestedLanguage: curriculum.metadata.suggestedLanguage,
      learningStyle: curriculum.metadata.learningStyle,
      isProjectBased: curriculum.metadata.isProjectBased,
      codeWritingEnabled: curriculum.metadata.codeWritingEnabled,
      isLanguageLearning: curriculum.metadata.isLanguageLearning,
      targetLanguage: curriculum.metadata.targetLanguage,
      proficiencyLevel: curriculum.metadata.proficiencyLevel,
      improvementAreas,
      lessOfAreas,
    };

    const { staticPart, dynamicPart, userPrompt } =
      buildCacheableDayDetailCorePrompt(params);

    // Build prePrompt from skeleton data (no AI needed, no streaming — frontend builds it locally)
    const skills: string[] = dayOverview.skills || dayOverview.objectives || [];
    const skeletonPrePrompt = {
      text: `Today you'll learn about ${dayOverview.title}`,
      skills,
    };

    // Stream from Anthropic
    let fullContent = '';
    // Two-level incremental parser: sections → questions
    let sectionsArrayStarted = false;
    let inString = false;
    let escapeNext = false;
    let parseOffset = 0;
    // Section-level tracking
    let sectionStartIndex = -1;
    let sectionBraceDepth = 0; // braces within current section
    let yieldedSectionCount = 0;
    let sectionStartEmitted = false; // whether we emitted task1SectionStart for current section
    // Question-level tracking (within current section)
    let questionsArrayFound = false;
    let questionStartIndex = -1;
    let questionBraceDepth = 0;
    let yieldedQuestionCount = 0; // per section
    let containerKey = 'questions'; // questions, items, or pairs

    try {
      for await (const chunk of this.aiService.callAnthropicWithCacheStream(
        'claude-sonnet-4-20250514',
        userPrompt,
        { staticPart, dynamicPart },
      )) {
        if (chunk.type === 'text' && chunk.text) {
          fullContent += chunk.text;

          // Phase 1: Find "sections": [
          if (!sectionsArrayStarted) {
            const sectionsMatch = fullContent.indexOf('"sections"');
            if (sectionsMatch !== -1) {
              const bracketPos = fullContent.indexOf('[', sectionsMatch);
              if (bracketPos !== -1) {
                sectionsArrayStarted = true;
                parseOffset = bracketPos + 1;
              }
            }
          }

          // Phase 2: Parse sections and questions incrementally
          if (sectionsArrayStarted) {
            for (let i = parseOffset; i < fullContent.length; i++) {
              const ch = fullContent[i];

              if (escapeNext) { escapeNext = false; continue; }
              if (ch === '\\' && inString) { escapeNext = true; continue; }
              if (ch === '"') { inString = !inString; continue; }
              if (inString) continue;

              // Between sections (depth 0)
              if (sectionBraceDepth === 0) {
                if (ch === '{') {
                  // Section starts
                  sectionStartIndex = i;
                  sectionBraceDepth = 1;
                  questionsArrayFound = false;
                  sectionStartEmitted = false;
                  yieldedQuestionCount = 0;
                  questionBraceDepth = 0;
                  questionStartIndex = -1;
                } else if (ch === ']') {
                  break; // End of sections array
                }
                continue;
              }

              // Inside a section (depth >= 1)
              if (ch === '{') {
                sectionBraceDepth++;
                if (questionsArrayFound && questionBraceDepth === 0) {
                  // Question object starts
                  questionStartIndex = i;
                  questionBraceDepth = 1;
                } else if (questionsArrayFound) {
                  questionBraceDepth++;
                }
              } else if (ch === '}') {
                if (questionsArrayFound && questionBraceDepth > 0) {
                  questionBraceDepth--;
                  if (questionBraceDepth === 0 && questionStartIndex !== -1) {
                    // Complete question found — parse and yield
                    const questionJson = fullContent.slice(questionStartIndex, i + 1);
                    try {
                      const question = JSON.parse(questionJson);
                      const sIdx = yieldedSectionCount;
                      const qIdx = yieldedQuestionCount;
                      question.id = question.id || `s${sIdx + 1}-q${qIdx + 1}`;

                      this.logger.log(`📡 Stream: section ${sIdx} question ${qIdx}`);
                      yield {
                        event: CurriculumService.STREAM_EVENTS.TASK1_QUESTION,
                        data: { sectionIndex: sIdx, questionIndex: qIdx, question },
                      };
                      yieldedQuestionCount++;
                    } catch {
                      // Partial JSON — not a valid question yet
                    }
                    questionStartIndex = -1;
                  }
                }

                sectionBraceDepth--;
                if (sectionBraceDepth === 0 && sectionStartIndex !== -1) {
                  // Section complete — yield full section for finalization
                  const sectionJson = fullContent.slice(sectionStartIndex, i + 1);
                  try {
                    const section = JSON.parse(sectionJson);
                    const sIdx = yieldedSectionCount;
                    const normalizedSection = normalizeSectionIds(section, sIdx);
                    const questionCount = normalizedSection.questions?.length || normalizedSection.items?.length || normalizedSection.pairs?.length || 0;
                    this.logger.log(
                      `📡 Stream: section ${sIdx} complete (${normalizedSection.type}) with ${questionCount} items`,
                    );

                    // Emit sectionStart if questions array was never found (fallback)
                    if (!sectionStartEmitted) {
                      yield {
                        event: CurriculumService.STREAM_EVENTS.TASK1_SECTION_START,
                        data: {
                          index: sIdx,
                          type: normalizedSection.type || 'quiz',
                          title: normalizedSection.title || '',
                          containerKey: normalizedSection.questions ? 'questions' : normalizedSection.items ? 'items' : 'pairs',
                        },
                      };
                    }

                    yield {
                      event: CurriculumService.STREAM_EVENTS.TASK1_SECTION,
                      data: { section: normalizedSection, index: sIdx },
                    };
                    yieldedSectionCount++;
                  } catch {
                    // Skip malformed section
                  }
                  sectionStartIndex = -1;
                  questionsArrayFound = false;
                  sectionStartEmitted = false;
                }
              } else if (ch === '[' && !questionsArrayFound && sectionBraceDepth === 1) {
                // Check if this [ follows "questions", "items", or "pairs"
                const lookback = fullContent.slice(Math.max(0, i - 30), i);
                const keyMatch = lookback.match(/"(questions|items|pairs)"\s*:\s*$/);
                if (keyMatch) {
                  questionsArrayFound = true;
                  containerKey = keyMatch[1];
                  questionBraceDepth = 0;
                  questionStartIndex = -1;

                  // Emit sectionStart immediately — we have type/title from content before the array
                  if (!sectionStartEmitted) {
                    const sectionSoFar = fullContent.slice(sectionStartIndex, i);
                    const typeMatch = sectionSoFar.match(/"type"\s*:\s*"([^"]+)"/);
                    const titleMatch = sectionSoFar.match(/"title"\s*:\s*"([^"]+)"/);
                    const sIdx = yieldedSectionCount;
                    this.logger.log(
                      `📡 Stream: section ${sIdx} start (${typeMatch?.[1] || '?'}) containerKey=${containerKey}`,
                    );
                    yield {
                      event: CurriculumService.STREAM_EVENTS.TASK1_SECTION_START,
                      data: {
                        index: sIdx,
                        type: typeMatch?.[1] || 'quiz',
                        title: titleMatch?.[1] || '',
                        containerKey,
                      },
                    };
                    sectionStartEmitted = true;
                  }
                }
              } else if (ch === ']' && questionsArrayFound && questionBraceDepth === 0) {
                // End of questions/items/pairs array
                questionsArrayFound = false;
              }
            }
            parseOffset = fullContent.length;
          }
        }

        if (chunk.type === 'done') {
          // Parse final content
          let coreContent: any;
          try {
            let cleanedContent = fullContent
              .replace(/```json\n?/g, '')
              .replace(/```\n?/g, '')
              .trim();

            const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              cleanedContent = jsonMatch[0];
            }

            try {
              coreContent = JSON.parse(cleanedContent);
            } catch {
              const fixedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
              coreContent = JSON.parse(fixedContent);
            }

            normalizeTask1Sections(coreContent, dayNumber);

            if (coreContent.task1?.sections) {
              // Yield task1 as complete object
              yield {
                event: CurriculumService.STREAM_EVENTS.TASK1,
                data: coreContent.task1,
              };
            }

            // Add prePrompt from skeleton (not AI-generated)
            coreContent.prePrompt = skeletonPrePrompt;

            // Add metadata
            coreContent.contentLayer = contentLayer;
            coreContent.videoStrategy = videoStrategy;
            coreContent.contentSource = contentSource;

            // Handle video (same as non-streaming)
            const videoResult = await this.searchAndProcessVideo({
              content: coreContent,
              searchConcept: dayOverview.title,
              skillName: curriculum.metadata.skillName,
              skillLevel: curriculum.metadata.skillLevel,
              skillType: curriculum.metadata.skillType,
              videoStrategy: coreContent.videoStrategy,
              contentSource: coreContent.contentSource,
              hoursPerDay: curriculum.metadata.hoursPerDay || 1,
              dayNumber,
              includeAlternatives: false,
              dayObjectives: dayOverview.skills || [],
            });

            if (videoResult) {
              coreContent.video = videoResult.video;
              yield {
                event: CurriculumService.STREAM_EVENTS.VIDEO,
                data: coreContent.video,
              };
            } else {
              // Video skipped - foundation cards ARE the learning content
              // No need to generate redundant AI-curated summary
              coreContent.video = {
                videoAvailable: false,
                showVideoOption: false,
                skipped: true,
              };
              // Yield video event even when skipped so frontend can skip video step immediately
              yield {
                event: CurriculumService.STREAM_EVENTS.VIDEO,
                data: coreContent.video,
              };
            }

            // Cache the result
            let variantId: string | undefined;
            if (userId && sessionId) {
              const cacheResult =
                await this.cacheService.cacheDayContentWithVariant(
                  cacheKey,
                  coreContent,
                  userId,
                  sessionId,
                  dayNumber,
                );
              variantId = cacheResult.variantId;
            } else {
              await this.cacheService.setDayContent(cacheKey, coreContent);
            }

            const task1Concepts = extractTask1Concepts(coreContent);
            const tokensUsed =
              (chunk.usage?.inputTokens || 0) +
              (chunk.usage?.outputTokens || 0);

            yield {
              event: CurriculumService.STREAM_EVENTS.COMPLETE,
              data: {
                coreContent,
                tokensUsed,
                cost: this.calculateStreamingCost(chunk.usage),
                fromCache: false,
                variantId,
                task1Concepts,
              },
            };

            this.logger.log(
              `✅ Day ${dayNumber} CORE streamed. Tokens: ${tokensUsed}`,
            );
          } catch (error) {
            this.logger.error(
              `❌ Failed to parse streamed Day ${dayNumber} CORE:`,
              error.message,
            );
            yield {
              event: CurriculumService.STREAM_EVENTS.ERROR,
              data: { error: 'Failed to parse generated content' },
            };
          }
        }
      }
    } catch (error) {
      this.logger.error(`❌ Streaming error Day ${dayNumber}:`, error.message);
      yield {
        event: CurriculumService.STREAM_EVENTS.ERROR,
        data: { error: error.message || 'Streaming failed' },
      };
    }
  }

  /**
   * Calculate cost from streaming usage stats
   */
  private calculateStreamingCost(usage: any): number {
    if (!usage) return 0;
    const inputCost = 3.0;
    const outputCost = 15.0;
    const cacheWriteCost = 3.75;
    const cacheReadCost = 0.3;

    const normalInputTokens =
      (usage.inputTokens || 0) -
      (usage.cacheWriteTokens || 0) -
      (usage.cacheReadTokens || 0);

    return (
      (normalInputTokens / 1_000_000) * inputCost +
      ((usage.outputTokens || 0) / 1_000_000) * outputCost +
      ((usage.cacheWriteTokens || 0) / 1_000_000) * cacheWriteCost +
      ((usage.cacheReadTokens || 0) / 1_000_000) * cacheReadCost
    );
  }

  /**
   * Attempt to repair truncated JSON by closing open brackets/braces.
   * Used when AI response hits max_tokens and JSON is cut off mid-output.
   */
  private repairTruncatedJson(json: string): string {
    // Remove trailing incomplete string (cut off mid-value)
    let repaired = json.replace(/,\s*"[^"]*$/, ''); // trailing incomplete key
    repaired = repaired.replace(/,\s*$/, ''); // trailing comma
    repaired = repaired.replace(/:\s*"[^"]*$/, ': ""'); // incomplete string value

    // Count open brackets and close them
    const opens = { '{': 0, '[': 0 };
    const closes = { '}': '{', ']': '[' } as const;
    for (const char of repaired) {
      if (char in opens) opens[char as '{' | '[']++;
      if (char in closes) opens[closes[char as '}' | ']'] as '{' | '[']--;
    }

    // Close any remaining open brackets (innermost first: ] then })
    for (let i = 0; i < opens['[']; i++) repaired += ']';
    for (let i = 0; i < opens['{']; i++) repaired += '}';

    return repaired;
  }

  /**
   * Generate DEFERRED day content (background load)
   * Returns: reflection
   * Called after core loads, while user watches video
   *
   * @param task1Concepts - Concepts from core content for consistent personalization
   * @param improvementAreas - User-specified areas to emphasize
   * @param lessOfAreas - User-specified areas to reduce content for
   */
  async generateDayDeferredDetails(
    curriculum: any,
    dayNumber: number,
    userTier: string = 'FREE',
    task1Concepts?: string[],
    improvementAreas?: string[],
    lessOfAreas?: string[],
    forceRegenerate?: boolean,
  ): Promise<DayDeferredResult> {
    this.logger.log(`⏳ Generating Day ${dayNumber} DEFERRED content...${forceRegenerate ? ' (force regenerate - skipping cache)' : ''}`);

    const dayOverview = curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      throw new BadRequestException(`Day ${dayNumber} not found in curriculum`);
    }

    // Build cache key (used for both reading and writing)
    const cacheKey = await this.buildDayCacheKey(
      curriculum.metadata,
      dayNumber,
      'deferred',
    );

    // Check cache first (skip if force regenerating)
    if (!forceRegenerate) {
      const cached = await this.cacheService.getDayContent(cacheKey);
      if (cached) {
        this.logger.log(`📦 Day ${dayNumber} DEFERRED cache HIT`);
        return {
          deferredContent: cached,
          tokensUsed: 0,
          cost: 0,
          fromCache: true,
        };
      }
    }

    // Get reflection data from previous day for personalization
    const previousDay = curriculum.days.find(
      (d: any) => d.day === dayNumber - 1,
    );
    const previousDayReflection = previousDay?.reflectionData
      ? {
          confusedConcepts: previousDay.reflectionData.confusedConcepts,
          confidence: previousDay.reflectionData.confidence,
          boostCompleted: previousDay.reflectionData.boostCompleted,
          whatsFoggy: previousDay.reflectionData.whatsFoggy,
        }
      : undefined;

    // Fetch previous day's deferred content from cache for cumulative code building
    // This is needed because deferred content is cached separately, not stored in curriculum object
    if (previousDay && dayNumber > 1) {
      const previousDayCacheKey = await this.buildDayCacheKey(
        curriculum.metadata,
        dayNumber - 1,
        'deferred',
      );

      const previousDayDeferred =
        await this.cacheService.getDayContent(previousDayCacheKey);

      // Check for solutionCode (new) or solution/starterCode (legacy)
      const prevMilestone = previousDayDeferred?.bossMilestone;
      const hasPreviousCode = prevMilestone?.solutionCode || prevMilestone?.solution || prevMilestone?.starterCode;

      if (hasPreviousCode) {
        // Inject previous day's deferred content so buildContentGenerationContext can find it
        previousDay.deferredContent = previousDayDeferred;
        const codeField = prevMilestone?.solutionCode ? 'solutionCode' : prevMilestone?.solution ? 'solution' : 'starterCode';
        this.logger.log(
          `📦 Fetched Day ${dayNumber - 1} code for cumulative building (field: ${codeField}, length: ${(prevMilestone?.solutionCode || prevMilestone?.solution || prevMilestone?.starterCode)?.length})`,
        );
      } else {
        this.logger.warn(
          `⚠️ Day ${dayNumber - 1} deferred content found but no code field (solutionCode/solution/starterCode)`,
        );
      }
    } else if (dayNumber > 1) {
      this.logger.warn(`⚠️ No previousDay data available for Day ${dayNumber}, cumulative building not possible`);
    }

    // Build unified content generation context
    const ctx = buildContentGenerationContext(curriculum, dayNumber, {
      userTier,
      improvementAreas,
      lessOfAreas,
      previousDayReflection,
    });

    // Add task1 concepts from core content
    if (task1Concepts?.length) {
      ctx.generatedContent = { task1Concepts };
      this.logger.log(
        `📚 Using ${task1Concepts.length} task1 concepts for deferred content`,
      );
    }

    const params: DayDetailParams = {
      skillName: curriculum.metadata.skillName,
      dayNumber,
      dayTitle: dayOverview.title,
      dayObjectives: dayOverview.skills,
      skeleton: dayOverview,
      skillType: curriculum.metadata.skillType,
      skillLevel: curriculum.metadata.skillLevel,
      complexity: curriculum.metadata.complexity,
      userTier,
      hoursPerDay: curriculum.metadata.hoursPerDay,
      suggestedLanguage: curriculum.metadata.suggestedLanguage,
      learningStyle: curriculum.metadata.learningStyle, // User's explicit choice from onboarding
      isProjectBased: curriculum.metadata.isProjectBased, // Use stored value, don't re-calculate
      codeWritingEnabled: curriculum.metadata.codeWritingEnabled, // Advanced mode: code completion
      // Language learning specific
      isLanguageLearning: curriculum.metadata.isLanguageLearning,
      targetLanguage: curriculum.metadata.targetLanguage,
      proficiencyLevel: curriculum.metadata.proficiencyLevel,
      // Personalization
      improvementAreas,
      lessOfAreas,
      previousDayReflection,
      // Gap session flag
      isGapSession: curriculum.metadata.isGapSession,
    };

    // Gap sessions (micro-lesson mode): skip intensive practice for practice-based,
    // skip openTask for all gap sessions. Only generate reflection via lightweight call.
    const isGapSession = !!curriculum.metadata.isGapSession;

    // Pass context to deferred prompt builder for unified personalization
    // For gap practice-based sessions, this returns a reflection-only prompt
    const { systemPrompt, userPrompt } = buildDayDetailDeferredPrompt(
      params,
      ctx,
    );

    // Build lightweight prompt for Haiku (reflection + openTask)
    // Gap sessions skip openTask — only generate reflection
    const { systemPrompt: lightSystemPrompt, userPrompt: lightUserPrompt } =
      buildDeferredLightweightPrompt(params, ctx);

    // Run BOTH AI calls in parallel: Sonnet (task1/bossMilestone) + Haiku (reflection/openTask)
    const skipSonnetCall = false;

    this.logger.log(
      `🚀 Generating Day ${dayNumber} DEFERRED content${isGapSession ? ' (gap session)' : ''} (${skipSonnetCall ? 'Haiku only' : 'Sonnet + Haiku'})`,
    );

    const sonnetPromise = skipSonnetCall
      ? Promise.resolve(null)
      : this.aiService.routeRequest(
          AITask.CURRICULUM_GENERATION,
          userPrompt,
          systemPrompt,
        );

    const haikuPromise = this.aiService.routeRequest(
      AITask.LIGHTWEIGHT_CONTENT,
      lightUserPrompt,
      lightSystemPrompt,
    ).catch((error) => {
      this.logger.warn(
        `⚠️ Day ${dayNumber} lightweight content failed in DEFERRED: ${error.message}`,
      );
      return null;
    });

    const [aiResponse, lightweightResponse] = await Promise.all([
      sonnetPromise,
      haikuPromise,
    ]);

    let deferredContent: any;

    // Parse Sonnet response (if we made the call)
    if (aiResponse) {
      try {
        let cleanedContent = aiResponse.content
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanedContent = jsonMatch[0];
        }

        try {
          deferredContent = JSON.parse(cleanedContent);
        } catch {
          const fixedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
          deferredContent = JSON.parse(fixedContent);
        }

        this.logger.log(`✅ Day ${dayNumber} DEFERRED parsed`);
      } catch (error) {
        this.logger.error(
          `❌ Failed to parse Day ${dayNumber} DEFERRED:`,
          error.message,
        );
        throw new BadRequestException(
          'Failed to generate deferred day content. Please try again.',
        );
      }
    } else {
      // Gap practice-based session: no Sonnet call, start with empty content
      deferredContent = {};
      this.logger.log(`✅ Day ${dayNumber} DEFERRED skipped Sonnet (gap practice session)`);
    }

    // Validate intensive practice structure (practice-based curricula)
    if (deferredContent.intensivePractice) {
      const ip = deferredContent.intensivePractice;

      // Validate mini foundation cards exist (2-4)
      if (!ip.miniFoundationCards || ip.miniFoundationCards.length < 2) {
        this.logger.warn(
          `⚠️ IntensivePractice missing or insufficient mini foundation cards (${ip.miniFoundationCards?.length || 0})`,
        );
      }

      // Validate exactly 2 sections
      if (ip.sections && ip.sections.length !== 2) {
        this.logger.warn(
          `⚠️ IntensivePractice has ${ip.sections.length} sections, expected 2`,
        );
      }
    }

    // Validate bossMilestone structure (project-based curricula)
    if (deferredContent.bossMilestone) {
      const bm = deferredContent.bossMilestone;

      // Ensure hints are properly formatted
      if (bm.hints && Array.isArray(bm.hints)) {
        deferredContent.bossMilestone.hints = bm.hints
          .filter((h: any) => h.hint && !h.hint.includes('REQUIRED:'))
          .map((h: any, index: number) => ({
            level: h.level || index + 1,
            hint: typeof h === 'string' ? h : h.hint,
          }));
      }

      // Ensure solutionAnnotations are strings
      if (bm.solutionAnnotations && Array.isArray(bm.solutionAnnotations)) {
        deferredContent.bossMilestone.solutionAnnotations =
          bm.solutionAnnotations.filter(
            (a: any) => a && !String(a).includes('REQUIRED:'),
          );
      }

      // Check for placeholder content
      const hasPlaceholders =
        bm.starterCode?.includes('REQUIRED:') ||
        bm.solution?.includes('REQUIRED:');
      if (hasPlaceholders) {
        this.logger.warn(
          `⚠️ Day ${dayNumber} bossMilestone has placeholder content`,
        );
      }

      this.logger.log(
        `✅ Day ${dayNumber} bossMilestone: starterCode=${bm.starterCode?.length || 0} chars, solution=${bm.solution?.length || 0} chars`,
      );
    }

    // Merge lightweight content (Haiku) into deferred content
    if (lightweightResponse) {
      try {
        const cleanedLightweight = lightweightResponse.content
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        const lightJsonMatch = cleanedLightweight.match(/\{[\s\S]*\}/);
        if (lightJsonMatch) {
          let lightweightContent: any;
          try {
            lightweightContent = JSON.parse(lightJsonMatch[0]);
          } catch {
            const fixedLight = lightJsonMatch[0].replace(/,(\s*[}\]])/g, '$1');
            lightweightContent = JSON.parse(fixedLight);
          }

          if (lightweightContent.reflection) {
            deferredContent.reflection = lightweightContent.reflection;
            this.logger.log(`✅ Day ${dayNumber} reflection generated with Haiku (in DEFERRED)`);
          }
          if (lightweightContent.openTask) {
            deferredContent.openTask = lightweightContent.openTask;
            this.logger.log(`✅ Day ${dayNumber} openTask generated with Haiku (in DEFERRED)`);
          }
        }
      } catch (parseError) {
        this.logger.warn(
          `⚠️ Day ${dayNumber} lightweight content parse failed in DEFERRED: ${parseError.message}`,
        );
      }
    }

    // Cache the result
    await this.cacheService.setDayContent(cacheKey, deferredContent);

    const sonnetTokens = aiResponse?.tokensUsed || 0;
    const haikuTokens = lightweightResponse?.tokensUsed || 0;
    const totalTokens = sonnetTokens + haikuTokens;
    const totalCost = (aiResponse?.cost || 0) + (lightweightResponse?.cost || 0);

    this.logger.log(
      `✅ Day ${dayNumber} DEFERRED generated. Tokens: ${totalTokens} (Sonnet: ${sonnetTokens}, Haiku: ${haikuTokens})`,
    );

    return {
      deferredContent,
      tokensUsed: totalTokens,
      cost: totalCost,
      fromCache: false,
    };
  }

  /**
   * Stream events for deferred content
   */
  static readonly DEFERRED_STREAM_EVENTS = {
    TASK1: 'task1',
    BOSS_MILESTONE: 'bossMilestone',
    INTENSIVE_PRACTICE: 'intensivePractice',
    OPEN_TASK: 'openTask',
    REFLECTION: 'reflection',
    COMPLETE: 'complete',
    ERROR: 'error',
  } as const;

  /**
   * Generate DEFERRED day content with STREAMING
   * Yields task1, bossMilestone/intensivePractice, openTask, reflection as they parse
   */
  async *generateDayDeferredDetailsStream(
    curriculum: any,
    dayNumber: number,
    userTier: string = 'FREE',
    task1Concepts?: string[],
    improvementAreas?: string[],
    lessOfAreas?: string[],
    forceRegenerate?: boolean,
  ): AsyncGenerator<{
    event: string;
    data: any;
  }> {
    this.logger.log(`⏳ Streaming Day ${dayNumber} DEFERRED content...${forceRegenerate ? ' (force regenerate - skipping cache)' : ''}`);

    const dayOverview = curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      yield {
        event: CurriculumService.DEFERRED_STREAM_EVENTS.ERROR,
        data: { error: `Day ${dayNumber} not found in curriculum` },
      };
      return;
    }

    // Check cache first (skip if force regenerating)
    const cacheKey = await this.buildDayCacheKey(
      curriculum.metadata,
      dayNumber,
      'deferred',
    );
    if (!forceRegenerate) {
      const cached = await this.cacheService.getDayContent(cacheKey);
      if (cached) {
        this.logger.log(`📦 Day ${dayNumber} DEFERRED cache HIT (streaming)`);
        // Yield cached content piece by piece
        if (cached.task1) {
          yield {
            event: CurriculumService.DEFERRED_STREAM_EVENTS.TASK1,
            data: cached.task1,
          };
        }
        if (cached.bossMilestone) {
          yield {
            event: CurriculumService.DEFERRED_STREAM_EVENTS.BOSS_MILESTONE,
            data: cached.bossMilestone,
          };
        }
        if (cached.intensivePractice) {
          yield {
            event: CurriculumService.DEFERRED_STREAM_EVENTS.INTENSIVE_PRACTICE,
            data: cached.intensivePractice,
          };
        }
        if (cached.openTask) {
          yield {
            event: CurriculumService.DEFERRED_STREAM_EVENTS.OPEN_TASK,
            data: cached.openTask,
          };
        }
        if (cached.reflection) {
          yield {
            event: CurriculumService.DEFERRED_STREAM_EVENTS.REFLECTION,
            data: cached.reflection,
          };
        }
        yield {
          event: CurriculumService.DEFERRED_STREAM_EVENTS.COMPLETE,
          data: {
            deferredContent: cached,
            tokensUsed: 0,
            cost: 0,
            fromCache: true,
          },
        };
        return;
      }
    }

    // Build params for prompt (same as non-streaming)
    const previousDay = curriculum.days.find(
      (d: any) => d.day === dayNumber - 1,
    );
    const previousDayReflection = previousDay?.reflectionData
      ? {
          confusedConcepts: previousDay.reflectionData.confusedConcepts,
          confidence: previousDay.reflectionData.confidence,
          boostCompleted: previousDay.reflectionData.boostCompleted,
          whatsFoggy: previousDay.reflectionData.whatsFoggy,
        }
      : undefined;

    // Fetch previous day's deferred content from cache for cumulative code building
    // This is needed because deferred content is cached separately, not stored in curriculum object
    if (previousDay && dayNumber > 1) {
      const previousDayCacheKey = await this.buildDayCacheKey(
        curriculum.metadata,
        dayNumber - 1,
        'deferred',
      );
      const previousDayDeferred =
        await this.cacheService.getDayContent(previousDayCacheKey);
      // Check for solutionCode (new) or solution/starterCode (legacy)
      const prevMilestoneStreaming = previousDayDeferred?.bossMilestone;
      const hasPreviousCodeStreaming = prevMilestoneStreaming?.solutionCode || prevMilestoneStreaming?.solution || prevMilestoneStreaming?.starterCode;
      if (hasPreviousCodeStreaming) {
        // Inject previous day's deferred content so buildContentGenerationContext can find it
        previousDay.deferredContent = previousDayDeferred;
        this.logger.log(
          `📦 Fetched Day ${dayNumber - 1} code for cumulative building (streaming)`,
        );
      }
    }

    const ctx = buildContentGenerationContext(curriculum, dayNumber, {
      userTier,
      improvementAreas,
      lessOfAreas,
      previousDayReflection,
    });

    if (task1Concepts?.length) {
      ctx.generatedContent = { task1Concepts };
    }

    const params: DayDetailParams = {
      skillName: curriculum.metadata.skillName,
      dayNumber,
      dayTitle: dayOverview.title,
      dayObjectives: dayOverview.skills,
      skeleton: dayOverview,
      skillType: curriculum.metadata.skillType,
      skillLevel: curriculum.metadata.skillLevel,
      complexity: curriculum.metadata.complexity,
      userTier,
      hoursPerDay: curriculum.metadata.hoursPerDay,
      suggestedLanguage: curriculum.metadata.suggestedLanguage,
      learningStyle: curriculum.metadata.learningStyle,
      isProjectBased: curriculum.metadata.isProjectBased,
      codeWritingEnabled: curriculum.metadata.codeWritingEnabled,
      isLanguageLearning: curriculum.metadata.isLanguageLearning,
      targetLanguage: curriculum.metadata.targetLanguage,
      proficiencyLevel: curriculum.metadata.proficiencyLevel,
      improvementAreas,
      lessOfAreas,
      previousDayReflection,
      isGapSession: curriculum.metadata.isGapSession,
    };

    const isGapSession = !!curriculum.metadata.isGapSession;

    const { systemPrompt, userPrompt } = buildDayDetailDeferredPrompt(
      params,
      ctx,
    );

    // Gap practice-based sessions: skip Sonnet call, only generate reflection via Haiku
    const skipSonnetCallStream = isGapSession && !params.isProjectBased;

    if (skipSonnetCallStream) {
      this.logger.log(`⏭️ Day ${dayNumber} DEFERRED skipping Sonnet (gap practice session - streaming)`);

      // Only run lightweight call for reflection
      const { systemPrompt: lightSystemPrompt, userPrompt: lightUserPrompt } =
        buildDeferredLightweightPrompt(params, ctx);

      const lightResponse = await this.aiService.routeRequest(
        AITask.LIGHTWEIGHT_CONTENT,
        lightUserPrompt,
        lightSystemPrompt,
      ).catch((error) => {
        this.logger.warn(`⚠️ Day ${dayNumber} lightweight content failed: ${error.message}`);
        return null;
      });

      const deferredContent: any = {};

      if (lightResponse) {
        try {
          const cleaned = lightResponse.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.reflection) {
              deferredContent.reflection = parsed.reflection;
              yield { event: CurriculumService.DEFERRED_STREAM_EVENTS.REFLECTION, data: parsed.reflection };
            }
          }
        } catch (e) {
          this.logger.warn(`⚠️ Day ${dayNumber} lightweight parse failed: ${e.message}`);
        }
      }

      await this.cacheService.setDayContent(cacheKey, deferredContent);

      yield {
        event: CurriculumService.DEFERRED_STREAM_EVENTS.COMPLETE,
        data: {
          deferredContent,
          tokensUsed: lightResponse?.tokensUsed || 0,
          cost: lightResponse?.cost || 0,
          fromCache: false,
        },
      };
      return;
    }

    // Stream from Anthropic
    let fullContent = '';
    const yieldedEvents = new Set<string>();

    try {
      for await (const chunk of this.aiService.callAnthropicWithCacheStream(
        'claude-sonnet-4-20250514',
        userPrompt,
        { staticPart: systemPrompt, dynamicPart: '' },
      )) {
        if (chunk.type === 'text' && chunk.text) {
          fullContent += chunk.text;

          // Try to parse and yield task1
          if (!yieldedEvents.has('task1')) {
            const task1Match = fullContent.match(
              /"task1"\s*:\s*(\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})/s,
            );
            if (task1Match) {
              try {
                const task1 = JSON.parse(task1Match[1]);
                if (task1.id && task1.sections) {
                  yield {
                    event: CurriculumService.DEFERRED_STREAM_EVENTS.TASK1,
                    data: task1,
                  };
                  yieldedEvents.add('task1');
                  this.logger.log(`📤 Streamed task1 for Day ${dayNumber}`);
                }
              } catch {
                // Not complete yet
              }
            }
          }

          // Try to parse and yield bossMilestone
          if (!yieldedEvents.has('bossMilestone')) {
            const bossMatch = fullContent.match(
              /"bossMilestone"\s*:\s*(\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})/s,
            );
            if (bossMatch) {
              try {
                const boss = JSON.parse(bossMatch[1]);
                if (boss.title || boss.microTask) {
                  yield {
                    event: CurriculumService.DEFERRED_STREAM_EVENTS.BOSS_MILESTONE,
                    data: boss,
                  };
                  yieldedEvents.add('bossMilestone');
                  this.logger.log(`📤 Streamed bossMilestone for Day ${dayNumber}`);
                }
              } catch {
                // Not complete yet
              }
            }
          }

          // Try to parse and yield intensivePractice
          if (!yieldedEvents.has('intensivePractice')) {
            const intensiveMatch = fullContent.match(
              /"intensivePractice"\s*:\s*(\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})/s,
            );
            if (intensiveMatch) {
              try {
                const intensive = JSON.parse(intensiveMatch[1]);
                if (intensive.id || intensive.miniFoundationCards) {
                  yield {
                    event: CurriculumService.DEFERRED_STREAM_EVENTS.INTENSIVE_PRACTICE,
                    data: intensive,
                  };
                  yieldedEvents.add('intensivePractice');
                  this.logger.log(`📤 Streamed intensivePractice for Day ${dayNumber}`);
                }
              } catch {
                // Not complete yet
              }
            }
          }

          // Try to parse and yield openTask
          if (!yieldedEvents.has('openTask')) {
            const openTaskMatch = fullContent.match(
              /"openTask"\s*:\s*(\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})/s,
            );
            if (openTaskMatch) {
              try {
                const openTask = JSON.parse(openTaskMatch[1]);
                if (openTask.id || openTask.title) {
                  yield {
                    event: CurriculumService.DEFERRED_STREAM_EVENTS.OPEN_TASK,
                    data: openTask,
                  };
                  yieldedEvents.add('openTask');
                  this.logger.log(`📤 Streamed openTask for Day ${dayNumber}`);
                }
              } catch {
                // Not complete yet
              }
            }
          }

          // Try to parse and yield reflection
          if (!yieldedEvents.has('reflection')) {
            const reflectionMatch = fullContent.match(
              /"reflection"\s*:\s*(\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})/s,
            );
            if (reflectionMatch) {
              try {
                const reflection = JSON.parse(reflectionMatch[1]);
                if (reflection.questions) {
                  yield {
                    event: CurriculumService.DEFERRED_STREAM_EVENTS.REFLECTION,
                    data: reflection,
                  };
                  yieldedEvents.add('reflection');
                  this.logger.log(`📤 Streamed reflection for Day ${dayNumber}`);
                }
              } catch {
                // Not complete yet
              }
            }
          }
        }

        if (chunk.type === 'done') {
          // Parse final content
          let deferredContent: any;
          try {
            let cleanedContent = fullContent
              .replace(/```json\n?/g, '')
              .replace(/```\n?/g, '')
              .trim();

            const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              cleanedContent = jsonMatch[0];
            }

            try {
              deferredContent = JSON.parse(cleanedContent);
            } catch {
              const fixedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
              deferredContent = JSON.parse(fixedContent);
            }

            // Yield any content not yet yielded
            if (!yieldedEvents.has('task1') && deferredContent.task1) {
              yield {
                event: CurriculumService.DEFERRED_STREAM_EVENTS.TASK1,
                data: deferredContent.task1,
              };
            }
            if (!yieldedEvents.has('bossMilestone') && deferredContent.bossMilestone) {
              yield {
                event: CurriculumService.DEFERRED_STREAM_EVENTS.BOSS_MILESTONE,
                data: deferredContent.bossMilestone,
              };
            }
            if (!yieldedEvents.has('intensivePractice') && deferredContent.intensivePractice) {
              yield {
                event: CurriculumService.DEFERRED_STREAM_EVENTS.INTENSIVE_PRACTICE,
                data: deferredContent.intensivePractice,
              };
            }
            if (!yieldedEvents.has('openTask') && deferredContent.openTask) {
              yield {
                event: CurriculumService.DEFERRED_STREAM_EVENTS.OPEN_TASK,
                data: deferredContent.openTask,
              };
            }
            if (!yieldedEvents.has('reflection') && deferredContent.reflection) {
              yield {
                event: CurriculumService.DEFERRED_STREAM_EVENTS.REFLECTION,
                data: deferredContent.reflection,
              };
            }

            // Cache the result
            await this.cacheService.setDayContent(cacheKey, deferredContent);

            const tokensUsed =
              (chunk.usage?.inputTokens || 0) +
              (chunk.usage?.outputTokens || 0);

            yield {
              event: CurriculumService.DEFERRED_STREAM_EVENTS.COMPLETE,
              data: {
                deferredContent,
                tokensUsed,
                cost: this.calculateStreamingCost(chunk.usage),
                fromCache: false,
              },
            };

            this.logger.log(
              `✅ Day ${dayNumber} DEFERRED streamed. Tokens: ${tokensUsed}`,
            );
          } catch (error) {
            this.logger.error(
              `❌ Failed to parse streamed Day ${dayNumber} DEFERRED:`,
              error.message,
            );
            yield {
              event: CurriculumService.DEFERRED_STREAM_EVENTS.ERROR,
              data: { error: 'Failed to parse deferred content' },
            };
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `❌ Streaming error Day ${dayNumber} DEFERRED:`,
        error.message,
      );
      yield {
        event: CurriculumService.DEFERRED_STREAM_EVENTS.ERROR,
        data: { error: error.message || 'Streaming failed' },
      };
    }
  }

  /**
   * Build cache key for day content
   * IMPORTANT: Uses AI-normalized skill name for consistent caching across
   * different languages, typos, and phrasings.
   */
  private async buildDayCacheKey(
    metadata: any,
    dayNumber: number,
    type: 'core' | 'deferred',
  ): Promise<string> {
    // CRITICAL: Validate skillName to prevent cache collisions
    if (!metadata?.skillName) {
      this.logger.error(
        `⚠️ buildDayCacheKey called with missing skillName! metadata: ${JSON.stringify(metadata)}`,
      );
      throw new BadRequestException(
        'Cannot build day cache key: skillName is missing from curriculum metadata',
      );
    }

    // Use the same AI normalization as curriculum cache for consistency
    // This ensures "Python bot tutorial" and "파이썬" map to the same cache
    const normalizedSkill = await this.cacheService.normalizeSkillForDayCache(
      metadata.skillName,
    );

    // Replace spaces with dashes for URL-friendly cache key
    const skillKey = normalizedSkill.replace(/\s+/g, '-');

    const parts = [
      skillKey,
      `d${metadata.durationDays || 0}`,
      `h${metadata.hoursPerDay || 0}`,
      (metadata.skillLevel || 'beginner').toLowerCase(),
      `day${dayNumber}`,
      type,
    ];
    return `day-content:${parts.join(':')}`;
  }

  /**
   * PHASE 2: Generate full content for a boss project
   */
  async generateBossDetails(
    curriculum: any,
    bossDay: number,
    userTier: string = 'FREE',
  ): Promise<BossDetailResult> {
    this.logger.log(
      `🎯 Generating Boss Project for Day ${bossDay} (Phase 2)...`,
    );

    const bossOverview = curriculum.bossProjects?.find(
      (b: any) => b.day === bossDay,
    );
    if (!bossOverview) {
      throw new BadRequestException(
        `Boss project for day ${bossDay} not found`,
      );
    }

    // Get titles of combined days
    const dayTitles = bossOverview.combinesDays.map((dayNum: number) => {
      const day = curriculum.days.find((d: any) => d.day === dayNum);
      return day?.title || `Day ${dayNum}`;
    });

    const params: BossDetailParams = {
      skillName: curriculum.metadata.skillName,
      bossTitle: bossOverview.title,
      bossDescription: bossOverview.description,
      bossDay,
      combinesDays: bossOverview.combinesDays,
      dayTitles,
      userTier,
      suggestedLanguage: curriculum.metadata.suggestedLanguage,
    };

    const { systemPrompt, userPrompt } = buildBossDetailPrompt(params);

    const aiResponse = await this.aiService.routeRequest(
      AITask.CURRICULUM_GENERATION,
      userPrompt,
      systemPrompt,
    );

    let bossContent: any;
    try {
      let cleanedContent = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedContent = jsonMatch[0];
      }

      try {
        bossContent = JSON.parse(cleanedContent);
      } catch {
        const fixedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
        bossContent = JSON.parse(fixedContent);
      }

      this.logger.log(
        `✅ Boss Project Day ${bossDay} details parsed successfully`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to parse Boss Project details:`,
        error.message,
      );
      throw new BadRequestException(
        'Failed to generate boss project details. Please try again.',
      );
    }

    this.logger.log(
      `✅ Boss Project generated. Tokens: ${aiResponse.tokensUsed}, Cost: $${aiResponse.cost.toFixed(4)}`,
    );

    return {
      bossContent,
      tokensUsed: aiResponse.tokensUsed,
      cost: aiResponse.cost,
    };
  }

  /**
   * Shared video search and processing logic for generateDayCoreDetails.
   * Handles video search, adaptive modality decision, and returns the processed video object.
   * Includes multi-model alignment verification to ensure video matches day content.
   */
  private async searchAndProcessVideo(params: {
    content: any; // dayContent or coreContent
    searchConcept: string;
    skillName: string;
    skillLevel: string;
    skillType: string;
    videoStrategy: string;
    contentSource: 'university' | 'youtube' | 'text' | 'docs';
    hoursPerDay: number;
    dayNumber: number;
    includeAlternatives?: boolean; // true for generateDayDetails, false for CORE
    dayObjectives?: string[]; // Day's learning objectives for alignment verification
  }): Promise<{ video: any; rawResult: any } | null> {
    const {
      content,
      searchConcept,
      skillName,
      skillLevel,
      skillType,
      videoStrategy,
      contentSource,
      hoursPerDay,
      dayNumber,
      includeAlternatives = false,
      dayObjectives = [],
    } = params;

    const shouldSearchVideo =
      videoStrategy !== 'skip' && contentSource !== 'text';

    if (!shouldSearchVideo || !content.video) {
      this.logger.log(
        `🔍 VIDEO SEARCH SKIPPED: shouldSearchVideo=${shouldSearchVideo}, hasContentVideo=${!!content?.video}`,
      );
      return null;
    }

    // Extract search query from day content (hybrid: deterministic + AI fallback for abstract topics)
    const searchQuery = await this.extractSearchQuery(
      content,
      searchConcept,
      skillName,
      {
        dayNumber,
        skillLevel,
        skillType,
        dayObjectives,
      },
    );

    // Calculate video slot based on hours per day
    const sessionMinutes = (hoursPerDay || 1) * 60;
    const videoSlot =
      sessionMinutes <= 30
        ? 5
        : sessionMinutes <= 45
          ? 6
          : sessionMinutes <= 60
            ? 7
            : 10;

    const levelMap: Record<string, 'beginner' | 'intermediate' | 'advanced'> = {
      BEGINNER: 'beginner',
      INTERMEDIATE: 'intermediate',
      ADVANCED: 'advanced',
    };

    // Extract day concepts from foundationCards or languageFoundationCards for Gemini verification
    const dayConcepts: string[] = [];
    const cards = content.languageFoundationCards || content.foundationCards;
    if (cards && Array.isArray(cards)) {
      for (const card of cards.slice(0, 5)) {
        // For vocabulary cards, use the term; for regular cards, use the concept
        const conceptText = card.vocabulary?.term || card.concept;
        if (conceptText) {
          const cleaned = conceptText
            .replace(/^(What is|What are|How to|Why|When to use)\s*/i, '')
            .replace(/\?$/, '')
            .trim();
          if (cleaned && cleaned.length > 2) {
            dayConcepts.push(cleaned);
          }
        }
      }
    }

    this.logger.log(
      `🎥 Searching video for: "${searchQuery}" (${videoSlot}min slot)`,
    );
    if (dayConcepts.length > 0) {
      this.logger.log(
        `   Day concepts for verification: ${dayConcepts.join(', ')}`,
      );
    }

    let videoResult: any = null;
    try {
      videoResult = await this.videoMatcher.findBestVideo(
        {
          concept: searchQuery,
          userSlot: videoSlot,
          userLevel: levelMap[skillLevel] || 'beginner',
          skillType,
          contentSource,
          skillName, // Pass to Gemini for content verification
          dayConcepts, // Pass day concepts for Gemini to verify coverage
        },
        { deepVerify: true },
      );
    } catch (error: any) {
      this.logger.warn(`⚠️ Video search failed: ${error.message}`);
      videoResult = null;
    }

    this.logger.log(
      `🔍 VIDEO RESULT: success=${videoResult?.success}, video=${videoResult?.video?.title || 'none'}, matchPercent=${videoResult?.matchPercent || 0}, error=${videoResult?.error || 'none'}`,
    );

    // Check if video meets minimum confidence threshold
    const meetsMinConfidence =
      videoResult?.matchPercent &&
      videoResult.matchPercent >= this.MIN_VIDEO_CONFIDENCE;

    if (videoResult?.success && !meetsMinConfidence) {
      this.logger.log(
        `⚠️ Video rejected: matchPercent ${videoResult?.matchPercent}% < ${this.MIN_VIDEO_CONFIDENCE}% threshold`,
      );
    }

    // Generate AI explanation as fallback
    const aiExplanation = this.generateAiExplanation(content, searchQuery);
    const adaptiveModality = videoResult?.adaptiveModality;
    const defaultMode = adaptiveModality?.defaultMode || 'ai';

    let processedVideo: any;

    // Only use video if it meets minimum confidence threshold
    if (videoResult?.success && videoResult.video && meetsMinConfidence) {
      if (defaultMode === 'ai') {
        // AI is primary, video as backup
        this.logger.log(
          `📝 Day ${dayNumber}: AI explanation as default (${adaptiveModality?.reasonShort || 'confidence low'})`,
        );
        processedVideo = {
          concept: searchQuery,
          title: `Understanding ${searchQuery}`,
          explanation: aiExplanation,
          reason:
            adaptiveModality?.reason ||
            `AI explanation recommended for "${searchQuery}".`,
          videoAvailable: adaptiveModality?.videoAvailable ?? true,
          showVideoOption: adaptiveModality?.showVideoOption ?? true,
          ...(videoResult.video
            ? {
                backupVideo: {
                  videoId: videoResult.video.videoId,
                  title: videoResult.video.title,
                  channelName: videoResult.video.channelName,
                  url: `https://www.youtube.com/watch?v=${videoResult.video.videoId}`,
                  matchPercent: videoResult.matchPercent,
                },
              }
            : {}),
          watchPoints: content.video?.watchPoints,
          adaptiveModality: {
            defaultMode: 'ai',
            videoConfidence: adaptiveModality?.videoConfidence ?? 0,
            reason: adaptiveModality?.reason || '',
            reasonShort: adaptiveModality?.reasonShort || '',
          },
        };
      } else {
        // Video is primary
        const video = videoResult.video;
        const watchPlan = videoResult.watchPlan;

        // Build alternatives if requested (for generateDayDetails)
        // Only include alternatives that meet minimum confidence threshold
        let alternatives: any[] = [];
        if (includeAlternatives && videoResult.alternatives) {
          alternatives = videoResult.alternatives
            .filter((alt: any) => alt.matchPercent >= this.MIN_VIDEO_CONFIDENCE)
            .map((alt: any) => ({
              videoId: alt.video.videoId,
              title: alt.video.title,
              channelName: alt.video.channelName,
              duration: alt.video.duration,
              startTime: alt.watchPlan?.primarySegment
                ? formatTime(alt.watchPlan.primarySegment.startSeconds)
                : undefined,
              endTime: alt.watchPlan?.primarySegment
                ? formatTime(alt.watchPlan.primarySegment.endSeconds)
                : undefined,
              estimatedMinutes: alt.watchPlan?.primarySegment
                ? Math.ceil(
                    (alt.watchPlan.primarySegment.endSeconds -
                      alt.watchPlan.primarySegment.startSeconds) /
                      60,
                  )
                : 6,
              differentiator: alt.differentiator,
              matchPercent: alt.matchPercent,
            }));
        }

        // Check if this is a university channel
        const universityChannels = [
          'MIT OpenCourseWare',
          'Harvard CS50',
          'freeCodeCamp',
          'Khan Academy',
          'Stanford Online',
        ];
        const isUniversityVideo =
          contentSource === 'university' ||
          universityChannels.some((ch) =>
            video.channelName?.toLowerCase().includes(ch.toLowerCase()),
          );

        this.logger.log(
          `✅ Day ${dayNumber} video found: ${video.title} (${videoResult.matchPercent}% match)${alternatives.length > 0 ? ` + ${alternatives.length} alternatives` : ''}`,
        );

        processedVideo = {
          ...content.video,
          url: `https://www.youtube.com/watch?v=${video.videoId}`,
          videoId: video.videoId,
          title: video.title,
          channelName: video.channelName,
          duration: video.duration,
          startTime: watchPlan?.primarySegment
            ? formatTime(watchPlan.primarySegment.startSeconds)
            : undefined,
          endTime: watchPlan?.primarySegment
            ? formatTime(watchPlan.primarySegment.endSeconds)
            : undefined,
          watchInstructions:
            watchPlan?.primarySegment?.description ||
            `Watch this video to learn about ${content.title}`,
          keyTopics: watchPlan?.keyTopics?.length
            ? watchPlan.keyTopics
            : undefined,
          summary: watchPlan?.summary,
          estimatedMinutes: watchPlan?.primarySegment
            ? Math.ceil(
                (watchPlan.primarySegment.endSeconds -
                  watchPlan.primarySegment.startSeconds) /
                  60,
              )
            : 6,
          verified: true,
          matchPercent: videoResult.matchPercent,
          whyThisVideo: videoResult.whyThisVideo,
          ...(includeAlternatives ? { alternatives } : {}),
          isUniversityLecture: isUniversityVideo,
          sourceType: contentSource,
          showAiOption: adaptiveModality?.showAiOption ?? true,
          aiExplanation: aiExplanation,
          adaptiveModality: {
            defaultMode: 'video',
            videoConfidence: adaptiveModality?.videoConfidence ?? 70,
            reason: adaptiveModality?.reason || 'Good video match found.',
            reasonShort: adaptiveModality?.reasonShort || 'Good match',
          },
        };
      }
    } else if (videoResult && !videoResult.success) {
      // Video search ran but no video found
      this.logger.warn(
        `⚠️ Day ${dayNumber} video not found: ${videoResult?.error || 'No result'}`,
      );
      processedVideo = {
        concept: searchQuery,
        title: `Understanding ${searchQuery}`,
        explanation: aiExplanation,
        reason: `No suitable video found for "${searchQuery}". Here's a focused explanation.`,
        videoAvailable: false,
        showVideoOption: false,
        watchPoints: content.video?.watchPoints,
        adaptiveModality: {
          defaultMode: 'ai',
          videoConfidence: 0,
          reason: videoResult?.error || 'No video found',
          reasonShort: 'No video',
        },
      };
    } else {
      // videoResult is null (search wasn't performed or failed)
      processedVideo = {
        concept: searchQuery,
        title: `Understanding ${searchQuery}`,
        explanation: aiExplanation,
        reason: 'AI explanation provided for this topic.',
        videoAvailable: false,
        showVideoOption: false,
        watchPoints: content.video?.watchPoints,
        adaptiveModality: {
          defaultMode: 'ai',
          videoConfidence: 0,
          reason: 'Video search skipped or failed',
          reasonShort: 'No video',
        },
      };
    }

    this.logger.log(
      `🎬 VIDEO OUTCOME Day ${dayNumber}: mode=${processedVideo.adaptiveModality?.defaultMode || 'ai'}, hasVideoId=${!!processedVideo.videoId}, hasBackupVideo=${!!processedVideo.backupVideo}`,
    );

    return { video: processedVideo, rawResult: videoResult };
  }

  /**
   * Generate AI explanation from day content when no good video match is found.
   * Uses foundationCards or languageFoundationCards if available, otherwise creates a structured summary.
   */
  private generateAiExplanation(dayContent: any, concept: string): string {
    const sections: string[] = [];

    // Use languageFoundationCards or foundationCards content if available
    const cards =
      dayContent.languageFoundationCards || dayContent.foundationCards;
    if (cards && Array.isArray(cards)) {
      for (const card of cards) {
        // For vocabulary cards, format term + definition
        if (card.vocabulary) {
          const { term, definition, romanization } = card.vocabulary;
          sections.push(
            `**${term}**${romanization ? ` (${romanization})` : ''}\n${definition}`,
          );
        } else if (card.concept && card.explanation) {
          sections.push(`**${card.concept}**\n${card.explanation}`);
        }
      }
    }

    // If we have foundation content, return it
    if (sections.length > 0) {
      return sections.join('\n\n');
    }

    // Fallback: Generate from day title and task descriptions
    const fallbackSections: string[] = [];

    if (dayContent.title) {
      fallbackSections.push(`## ${dayContent.title}`);
    }

    if (dayContent.task1?.description) {
      fallbackSections.push(
        `### What You'll Learn\n${dayContent.task1.description}`,
      );
    }

    if (dayContent.task1?.steps && Array.isArray(dayContent.task1.steps)) {
      const steps = dayContent.task1.steps
        .slice(0, 5)
        .map(
          (s: any, i: number) =>
            `${i + 1}. ${typeof s === 'string' ? s : s.instruction || s.title || ''}`,
        )
        .join('\n');
      fallbackSections.push(`### Key Steps\n${steps}`);
    }

    return fallbackSections.length > 0
      ? fallbackSections.join('\n\n')
      : `Learn about ${concept} through the practice exercises below.`;
  }

  /**
   * Generate key learning points when video is skipped.
   * Extracts main concepts from foundation cards and day objectives.
   * Returns an array of concise, actionable learning points.
   */
  private generateKeyLearningPoints(
    dayContent: any,
    dayOverview: any,
  ): string[] {
    const points: string[] = [];

    // Extract from foundation cards (main concepts)
    const cards =
      dayContent.languageFoundationCards || dayContent.foundationCards;
    if (cards && Array.isArray(cards)) {
      for (const card of cards.slice(0, 5)) {
        if (card.concept) {
          // Create a concise learning point from the concept
          const point =
            card.concept.length > 60
              ? card.concept.substring(0, 57) + '...'
              : card.concept;
          points.push(point);
        }
      }
    }

    // If no cards, use day objectives/skills
    if (points.length === 0 && dayOverview?.skills) {
      for (const skill of dayOverview.skills.slice(0, 5)) {
        if (typeof skill === 'string' && skill.length > 0) {
          points.push(skill);
        }
      }
    }

    // Fallback to day title parsing
    if (points.length === 0 && dayOverview?.title) {
      points.push(`Understand ${dayOverview.title}`);
    }

    return points;
  }

  /**
   * Build optimized search query for university resources
   * Combines title concept with key objectives for better relevance
   */
  private buildUniversitySearchQuery(
    searchConcept: string,
    dayObjectives: string[],
    skillName: string,
  ): string {
    // Extract key terms from objectives (first 2 objectives, max 3 words each)
    const objectiveTerms: string[] = [];
    for (const obj of dayObjectives.slice(0, 2)) {
      // Clean and extract key nouns/verbs
      const cleaned = obj
        .replace(
          /\b(understand|learn|master|apply|create|build|implement|use|know|identify|explain|describe|analyze|develop|practice)\b/gi,
          '',
        )
        .replace(/\b(the|a|an|and|or|to|for|with|how|what|why|when)\b/gi, '')
        .replace(/[^\w\s]/g, ' ')
        .trim();

      const words = cleaned.split(/\s+/).filter((w) => w.length > 3);
      if (words.length > 0) {
        objectiveTerms.push(words.slice(0, 2).join(' '));
      }
    }

    // Combine: searchConcept + top objective terms
    let query = searchConcept;

    // Add skill context if not already in concept
    const skillWords = skillName
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    for (const sw of skillWords.slice(0, 2)) {
      if (!query.toLowerCase().includes(sw)) {
        query = `${sw} ${query}`;
        break;
      }
    }

    // Add objective terms if they add value
    for (const term of objectiveTerms.slice(0, 1)) {
      if (term && !query.toLowerCase().includes(term.toLowerCase())) {
        query = `${query} ${term}`;
      }
    }

    // Limit to 50 chars for search effectiveness
    return query.slice(0, 50).trim();
  }

  /**
   * Generate task in alternative format (quiz or fillBlank from code, or vice versa)
   * Used for on-demand format switching in the frontend
   */
  async generateAlternativeTaskFormat(
    originalTask: any,
    targetFormat: 'code' | 'quiz' | 'fillBlank',
    dayContext: { dayNumber: number; dayTitle: string; skillName: string },
  ): Promise<{ task: any; tokensUsed: number; cost: number }> {
    this.logger.log(
      `🔄 Converting task to ${targetFormat} format for Day ${dayContext.dayNumber}`,
    );

    const originalFormat = originalTask.format || 'code';
    if (originalFormat === targetFormat) {
      return { task: originalTask, tokensUsed: 0, cost: 0 };
    }

    const systemPrompt = `You are a learning content expert. Convert the given task into a different format while preserving the learning objectives.
Keep the same concepts and difficulty level. Output valid JSON only.`;

    let userPrompt: string;

    if (targetFormat === 'quiz') {
      userPrompt = `Convert this ${originalFormat} task into a multiple-choice quiz format.

Original Task:
- Title: ${originalTask.title}
- Description: ${originalTask.description}
- Challenge: ${originalTask.challenge || originalTask.description}
${originalTask.solution ? `- Solution concept: ${originalTask.solution.substring(0, 500)}...` : ''}
${originalTask.starterCode ? `- Starter code context: ${originalTask.starterCode.substring(0, 300)}` : ''}

Day Context: Day ${dayContext.dayNumber} - ${dayContext.dayTitle} (${dayContext.skillName})

Create a quiz with 4-6 questions testing the same concepts. Output JSON:
{
  "id": "${originalTask.id}-quiz",
  "title": "${originalTask.title} - Quiz",
  "description": "Test your understanding of ${dayContext.dayTitle}",
  "estimatedMinutes": ${originalTask.estimatedMinutes || 10},
  "format": "quiz",
  "passingScore": 0.7,
  "questions": [
    {"id": "q1", "question": "Question about concept?", "options": ["Wrong A", "Correct B", "Wrong C", "Wrong D"], "correctIndex": 1, "explanation": "Why B is correct"},
    ...more questions
  ]
}`;
    } else if (targetFormat === 'fillBlank') {
      userPrompt = `Convert this ${originalFormat} task into a fill-in-the-blank code exercise.

Original Task:
- Title: ${originalTask.title}
- Description: ${originalTask.description}
${originalTask.solution ? `- Solution: ${originalTask.solution.substring(0, 800)}` : ''}
${originalTask.starterCode ? `- Starter code: ${originalTask.starterCode}` : ''}

Day Context: Day ${dayContext.dayNumber} - ${dayContext.dayTitle} (${dayContext.skillName})

Create 5-7 fill-in-the-blank items where learners complete key parts of the code. Output JSON:
{
  "id": "${originalTask.id}-fillblank",
  "title": "${originalTask.title} - Fill Blanks",
  "description": "Complete the code by filling in the blanks",
  "estimatedMinutes": ${originalTask.estimatedMinutes || 10},
  "format": "fillBlank",
  "passingScore": 0.7,
  "items": [
    {"id": "fb1", "codeTemplate": "const ___BLANK___ = value;", "blanks": [{"id": "b1", "correctAnswers": ["varName", "name"], "hint": "Variable name"}], "explanation": "Why this answer"},
    ...more items
  ]
}`;
    } else {
      // targetFormat === 'code'
      userPrompt = `Convert this ${originalFormat} task into a coding challenge.

Original Task:
- Title: ${originalTask.title}
- Description: ${originalTask.description}
${originalTask.questions ? `- Quiz questions covered: ${originalTask.questions.map((q: any) => q.question).join('; ')}` : ''}
${originalTask.items ? `- Fill-blank concepts: ${originalTask.items.map((i: any) => i.explanation).join('; ')}` : ''}

Day Context: Day ${dayContext.dayNumber} - ${dayContext.dayTitle} (${dayContext.skillName})

Create a coding challenge that tests the same concepts. Output JSON:
{
  "id": "${originalTask.id}-code",
  "title": "${originalTask.title} - Code Challenge",
  "description": "Build something that demonstrates your understanding",
  "estimatedMinutes": ${originalTask.estimatedMinutes || 15},
  "format": "code",
  "challenge": "Clear challenge statement",
  "expectedOutput": "What success looks like",
  "starterCode": "// Starter template",
  "hints": [{"level": 1, "hint": "Gentle hint"}, {"level": 2, "hint": "More specific"}, {"level": 3, "hint": "Approach hint"}],
  "solution": "// Complete working solution",
  "solutionAnnotations": ["// Key decision explanations"]
}`;
    }

    const aiResponse = await this.aiService.routeRequest(
      AITask.LIGHTWEIGHT_CONTENT,
      userPrompt,
      systemPrompt,
    );

    let task: any;
    try {
      let cleanedContent = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedContent = jsonMatch[0];
      }

      task = JSON.parse(cleanedContent);

      // Ensure quiz questions have unique IDs
      if (
        targetFormat === 'quiz' &&
        task.questions &&
        Array.isArray(task.questions)
      ) {
        task.questions = task.questions.map((q: any, index: number) => ({
          ...q,
          id:
            q.id && q.id !== 'q1'
              ? q.id
              : `q-${dayContext.dayNumber}-${index}-${Date.now()}`,
        }));
      }

      // Ensure fill-blank items have unique IDs
      if (
        targetFormat === 'fillBlank' &&
        task.items &&
        Array.isArray(task.items)
      ) {
        task.items = task.items.map((item: any, index: number) => ({
          ...item,
          id:
            item.id && item.id !== 'fb1'
              ? item.id
              : `fb-${dayContext.dayNumber}-${index}-${Date.now()}`,
          blanks: item.blanks?.map((blank: any, blankIndex: number) => ({
            ...blank,
            id:
              blank.id && blank.id !== 'b1'
                ? blank.id
                : `b-${index}-${blankIndex}`,
          })),
        }));
      }
    } catch (error) {
      this.logger.error(
        `❌ Failed to parse alternative task format:`,
        error.message,
      );
      throw new BadRequestException(
        'Failed to generate alternative task format',
      );
    }

    this.logger.log(
      `✅ Task converted to ${targetFormat}. Tokens: ${aiResponse.tokensUsed}`,
    );

    return {
      task,
      tokensUsed: aiResponse.tokensUsed,
      cost: aiResponse.cost,
    };
  }

  /**
   * AI Tutor chat - gives direct, helpful answers to student questions
   */
  async askAiTutor(params: {
    message: string;
    dayNumber: number;
    context: {
      taskTitle?: string;
      taskDescription?: string;
      currentCode?: string;
      concept?: string;
    };
    conversationHistory?: Array<{ role: string; content: string }>;
  }): Promise<{ reply: string; tokensUsed: number; cost: number }> {
    this.logger.log(`🎓 AI Tutor request for Day ${params.dayNumber}`);

    const systemPrompt = `You are a helpful AI tutor. Give direct, clear answers.

RULES:
1. Answer the question directly - don't ask questions back
2. Be concise unless showing code
3. Briefly explain WHY it works (1 sentence)
4. Be encouraging but not condescending

Current context:
- Task: ${params.context.taskTitle || 'Learning task'}
- Concept: ${params.context.concept || 'Programming concept'}
${params.context.currentCode ? `- Their code:\n\`\`\`\n${params.context.currentCode.slice(0, 500)}\n\`\`\`` : ''}`;

    // Build conversation for context
    let conversationContext = '';
    if (params.conversationHistory && params.conversationHistory.length > 0) {
      // Only include last 6 messages for context
      const recentHistory = params.conversationHistory.slice(-6);
      conversationContext =
        '\n\nRecent conversation:\n' +
        recentHistory
          .map(
            (m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`,
          )
          .join('\n');
    }

    const userPrompt = `${conversationContext}

Question: ${params.message}

Give a direct, helpful answer.`;

    const response = await this.aiService.routeRequest(
      AITask.TUTOR_CHAT,
      userPrompt,
      systemPrompt,
    );

    this.logger.log(`✅ AI Tutor responded. Tokens: ${response.tokensUsed}`);

    return {
      reply: response.content,
      tokensUsed: response.tokensUsed,
      cost: response.cost,
    };
  }

  /**
   * Generate a quick concept boost for confused students
   * Provides a different angle on a concept they found confusing
   */
  async generateConceptBoost(params: {
    concept: string;
    originalExplanation: string;
    skillLevel: string;
    skillName: string;
    dayNumber: number;
  }): Promise<{ boost: any; tokensUsed: number; cost: number }> {
    this.logger.log(`💡 Generating concept boost for: ${params.concept}`);

    // Check cross-user cache (same concept + skill + level = same boost)
    const boostCacheKey = `${params.skillName}:${params.concept}:${params.skillLevel}`.toLowerCase().replace(/\s+/g, '-').slice(0, 120);
    const cachedBoost = this.conceptBoostCache.get(boostCacheKey);
    if (cachedBoost) {
      this.logger.log(`♻️ Concept boost cache HIT for: ${params.concept}`);
      return { boost: cachedBoost, tokensUsed: 0, cost: 0 };
    }

    const systemPrompt = `You are a learning assistant helping a student who is confused about a concept.
Your job is to explain it from a DIFFERENT ANGLE than what they already saw.

Rules:
1. Don't repeat the original explanation - find a fresh perspective
2. Use a real-world analogy they can relate to
3. Keep it SHORT (2-3 sentences for explanation)
4. Include ONE quick practice question to verify understanding
5. Match the student's level: ${params.skillLevel}`;

    const userPrompt = `The student is learning ${params.skillName} (Day ${params.dayNumber}).

They found this concept confusing:
- Concept: ${params.concept}
- Original explanation they saw: ${params.originalExplanation}

Generate a "concept boost" - a quick 2-minute remediation.

Return JSON only:
{
  "concept": "${params.concept}",
  "explanation": "2-3 sentence explanation from a DIFFERENT angle",
  "analogy": "A relatable real-world analogy (1-2 sentences)",
  "codeExample": "Optional: tiny code snippet if helpful (max 3 lines), or null",
  "quickCheck": {
    "question": "One verification question",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Why the correct answer is right"
  }
}`;

    const response = await this.aiService.routeRequest(
      AITask.LIGHTWEIGHT_CONTENT,
      userPrompt,
      systemPrompt,
    );

    let boost: any;
    try {
      let cleanedContent = response.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedContent = jsonMatch[0];
      }

      boost = JSON.parse(cleanedContent);
    } catch (error) {
      this.logger.error(`❌ Failed to parse concept boost:`, error.message);
      throw new BadRequestException('Failed to generate concept boost');
    }

    // Cache for cross-user reuse
    this.conceptBoostCache.set(boostCacheKey, boost);

    this.logger.log(
      `✅ Concept boost generated and cached. Tokens: ${response.tokensUsed}`,
    );

    return {
      boost,
      tokensUsed: response.tokensUsed,
      cost: response.cost,
    };
  }

  // ==========================================================================
  // GAP-FIRST LEARNING: Assessment & Gap Detection
  // ==========================================================================

  /**
   * Get scenario design guidance based on goal type.
   */
  private getScenarioGuidanceForGoalType(goalType?: string): {
    systemFraming: string;
    scenarioStyle: string;
    scenarioJsonHint: string;
  } {
    if (goalType === 'project') {
      return {
        systemFraming: `You are an expert technical assessor. Generate a focused coding task that reveals what someone can actually build. The task should be small enough to implement in ~5 minutes but complex enough to expose real gaps — error handling, edge cases, correct logic, and code quality.

The key insight: asking someone to WRITE CODE reveals far more than asking them to describe their approach. Can they produce code that would actually run? Do they handle the unhappy path? Do they write readable, correct logic — or does it look right but break on edge cases?

CRITICAL: The scenario MUST ask the user to write actual code (a function, module, handler, etc.) — not just describe an approach. Include specific inputs/outputs or a clear contract so correctness is verifiable.`,
        scenarioStyle: `SCENARIO STYLE: Present a focused coding task — implement a function, fix a bug, write a handler, build a small module. Give specific requirements: what the code should accept, what it should return, and 1-2 edge cases it must handle. Keep scope small (one function or one small module) but include enough real-world messiness (null inputs, concurrent access, malformed data, error propagation) that a naive implementation would break.
The ideal response would: write working code that handles the stated requirements AND the edge cases, with clear structure and correct logic.`,
        scenarioJsonHint: `"scenario": "A focused coding task (2-4 sentences) with specific inputs/outputs and 1-2 tricky edge cases. Ask them to WRITE the actual code, not just describe an approach. Include enough context that correctness is verifiable.",
  "instructions": "Write the code for this task. Include error handling and edge cases. Explain any key decisions briefly."`,
      };
    }

    if (goalType === 'interview') {
      return {
        systemFraming: `You are an expert interview coach. Generate a coding interview problem that requires writing actual code. The problem should test algorithm design, correct implementation, edge case handling, and complexity reasoning.

The key insight: in a real coding interview, you must produce working code — not just describe an approach. Can the candidate write a function that actually handles all inputs correctly? Do they consider edge cases in their implementation, not just mention them?

CRITICAL: The scenario MUST ask for actual code with clear input/output contracts. Include example inputs/outputs so correctness is verifiable.`,
        scenarioStyle: `SCENARIO STYLE: Present a coding interview problem — an algorithm, data structure manipulation, or practical coding task. Give specific function signatures, example inputs/outputs, and constraints (time/space or edge cases). Keep it solvable in 5-10 minutes but non-trivial enough that a naive solution would miss edge cases.
The ideal response would: write working code with correct logic, handle edge cases, and briefly explain their time/space complexity.`,
        scenarioJsonHint: `"scenario": "A coding interview problem (2-4 sentences) with a clear function signature, example inputs/outputs, and constraints. Ask them to WRITE the code, not just explain their approach.",
  "instructions": "Write the code to solve this problem. Handle edge cases and briefly state the time/space complexity."`,
      };
    }

    if (goalType === 'ai_builder') {
      return {
        systemFraming: `You are an expert AI systems assessor. Generate a task that reveals how well someone can design and ship production AI workflows — not just call an API. The task should require the FULL pipeline: prompt design, evaluation strategy, guardrails, monitoring, data quality, and cost/latency reasoning.

The key insight: a junior AI builder thinks "call the API and parse the output." A senior one thinks about eval (how do I know it works?), guardrails (PII, prompt injection, policy), monitoring (drift, failure rates), data grounding (is the context accurate?), and cost/latency tradeoffs (when to use a cheaper model, when to cache, when to add a fallback).

Calibration signal: reward choosing the simplest pipeline that meets the requirements. Over-engineering with unnecessary agents/chains is a junior signal. So is ignoring eval entirely.`,
        scenarioStyle: `SCENARIO STYLE: Present a task where the user must design an AI-powered system for a realistic use case with real constraints (accuracy requirements, latency SLAs, sensitive data, cost budget, scale). The scenario MUST force decisions about evaluation, safety/guardrails, and operational concerns — not just prompt design.
The ideal response would: design the prompt/chain, define an eval plan, add guardrails for safety/policy, plan monitoring for drift/failures, reason about data quality/grounding, and make cost/latency tradeoffs with fallback modes.`,
        scenarioJsonHint: `"scenario": "A realistic AI-building task (2-4 sentences) with constraints that force decisions about eval, safety, monitoring, and cost — not just 'build a chatbot.' Include data sensitivity, accuracy requirements, or scale.",
  "instructions": "Brief instructions (e.g., 'Design the system: prompts/chains, how you'd evaluate it works, guardrails for safety, how you'd monitor it in production, and cost/latency tradeoffs')"`,
      };
    }

    // Default: general/curriculum — coding task if skill sounds technical, artifact otherwise
    return {
      systemFraming: `You are an expert skills assessor. Determine whether the skill is a CODING/PROGRAMMING skill or a NON-CODING skill.

For CODING skills (programming languages, frameworks, libraries, databases, DevOps, etc.):
Generate a focused coding task that asks the person to WRITE actual code — a function, component, query, config, or script. The task should be small enough to complete in ~5 minutes but require correct logic, edge case handling, and working code. Include specific inputs/outputs so correctness is verifiable.

For NON-CODING skills (leadership, design, writing, marketing, soft skills, etc.):
Generate a scenario that asks the person to produce a concrete work artifact — a plan, proposal, memo, or recommendation. The artifact format makes omissions structurally visible.

The key insight: for coding skills, whether someone's code would actually RUN and produce correct output reveals far more than their conceptual description. For non-coding skills, what someone OMITS from a structured artifact reveals more than what they get wrong.`,
      scenarioStyle: `SCENARIO STYLE:
For CODING skills: Present a focused coding task — implement a function, write a query, build a component, fix a bug. Give specific requirements with inputs/outputs and 1-2 edge cases. The user must write actual working code.
For NON-CODING skills: Present a realistic situation requiring a concrete artifact (plan, proposal, recommendation) with real constraints.
The ideal coding response would: write working code that handles requirements AND edge cases with clear, correct logic.
The ideal non-coding response would: produce a structured artifact addressing constraints, tradeoffs, and failure modes.`,
      scenarioJsonHint: `"scenario": "For coding skills: a focused coding task (2-4 sentences) with specific inputs/outputs and edge cases, asking them to WRITE code. For non-coding skills: a realistic situation requiring a concrete artifact. Include enough context that a generic answer is obviously incomplete.",
  "instructions": "For coding: 'Write the code for this task. Handle edge cases.' For non-coding: 'Write a brief plan covering your approach, constraints, risks, and success criteria.'"`,
    };
  }

  private getAnalysisFraming(goalType?: string): string {
    if (goalType === 'project') {
      return `Your PRIMARY job is to evaluate the CODE this person wrote. Mentally execute it: would it actually run? Would it produce correct output for the stated requirements AND the edge cases?

Key evaluation priorities (in order):
1. CORRECTNESS: Trace through the code with the given inputs. Does it return the right results? Are there logic errors, off-by-one bugs, incorrect conditions, or wrong return values?
2. EDGE CASES: Does it handle the specified edge cases, or would it crash/return wrong results on null, empty, boundary, or error inputs?
3. ERROR HANDLING: Does it fail gracefully or silently break?
4. STRUCTURE: Is the code readable and well-organized?
5. COMPLETENESS: Did they implement everything the task asked for?

If the user wrote a description/approach instead of actual code, score code_correctness as 1 and note that they didn't write code as requested.`;
    }
    if (goalType === 'interview') {
      return `Your PRIMARY job is to evaluate the CODE this person wrote as if you were an interviewer. Mentally execute it with the example inputs: does it produce the correct outputs?

Key evaluation priorities (in order):
1. CORRECTNESS: Trace through the code step by step. Does it work for the provided examples? Does the logic flow correctly?
2. EDGE CASES: Does it handle edge inputs (empty, single element, duplicates, negatives, large values)?
3. ALGORITHM: Is the approach efficient enough for the stated constraints? Is there a clearly better approach they missed?
4. COMPLEXITY: Did they state the correct time/space complexity?
5. CLARITY: Could an interviewer follow the code easily?

If the user only described an approach without writing code, score code_correctness as 1.`;
    }
    if (goalType === 'ai_builder') {
      return `Your PRIMARY job is to evaluate how this person designs AI systems for production. Look for the FULL pipeline — not just prompt design. An experienced AI builder naturally addresses evaluation (how do I know it works?), guardrails (PII, injection, policy), monitoring (drift, failures), data quality (grounding, freshness), and cost/latency tradeoffs. A beginner focuses only on "call the API."

Calibration note: reward choosing the simplest pipeline that meets requirements. Over-engineering with unnecessary agents/chains is as much a gap as ignoring eval entirely.`;
    }
    return `Your PRIMARY job is to evaluate this person's response. If they wrote CODE, mentally execute it: would it run and produce correct output? Evaluate correctness, edge case handling, and code quality. If they wrote a NON-CODE artifact (plan, proposal, recommendation), evaluate structural completeness — what they omitted reveals more than what they got wrong.

For code responses: trace through the logic with concrete inputs. Flag logic errors, unhandled edge cases, and code that looks right but would break.
For non-code responses: look for missing structural sections, unaddressed constraints, and absent risk reasoning.`;
  }

  /**
   * Generate an assessment scenario for a skill.
   * If previousGaps provided (re-test), probes those specific gaps.
   */
  async generateAssessmentScenario(params: {
    skillName: string;
    goalType?: string;
    skillLevel?: string;
    previousGaps?: Array<{ category: string; description: string }>;
  }): Promise<{
    scenario: string;
    instructions: string;
    timeEstimateMinutes: number;
    tokensUsed: number;
    cost: number;
  }> {
    this.logger.log(
      `🎯 Generating assessment scenario for: ${params.skillName}`,
    );

    const previousGapsContext = params.previousGaps?.length
      ? `\nThis is a RE-TEST. The student previously had these gaps:
${params.previousGaps.map((g) => `- ${g.category}: ${g.description}`).join('\n')}

CRITICAL RE-TEST REQUIREMENTS:
1. At least 50% of the scenario MUST directly target the gap areas listed above. Structure the task so that a correct response REQUIRES demonstrating competence in those specific weak areas.
2. The remaining portion should cover general dimensions to check for overall growth.
3. Generate a DIFFERENT scenario from the previous round — do NOT reuse the same situation, but DO probe the same gap categories through a new context.`
      : '';

    // Get the rubric dimensions so the scenario naturally probes them
    const rubric = this.getAssessmentRubric(params.goalType, params.skillName);
    const dimensionNames = rubric.map((d) => d.label).join(', ');

    const { systemFraming, scenarioStyle, scenarioJsonHint } =
      this.getScenarioGuidanceForGoalType(params.goalType);

    const systemPrompt = `${systemFraming}

The response will be evaluated on these dimensions: ${dimensionNames}
Design the scenario so that addressing ALL these dimensions would require genuine expertise, while a surface-level answer would miss most of them.

${scenarioStyle}

Return valid JSON only.`;

    const userPrompt = `Generate an assessment scenario for: "${params.skillName}"
${params.skillLevel ? `Self-reported level: ${params.skillLevel}` : ''}
${params.goalType ? `Goal type: ${params.goalType}` : ''}
${previousGapsContext}

Return JSON:
{
  ${scenarioJsonHint},
  "timeEstimateMinutes": 5
}`;

    const response = await this.aiService.routeRequest(
      AITask.LIGHTWEIGHT_CONTENT,
      userPrompt,
      systemPrompt,
    );

    let result: any;
    try {
      let cleanedContent = response.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanedContent = jsonMatch[0];
      result = JSON.parse(cleanedContent);
    } catch (error) {
      this.logger.error('❌ Failed to parse assessment scenario:', error.message);
      throw new BadRequestException('Failed to generate assessment scenario');
    }

    this.logger.log(`✅ Assessment scenario generated. Tokens: ${response.tokensUsed}`);
    return {
      scenario: result.scenario,
      instructions: result.instructions,
      timeEstimateMinutes: result.timeEstimateMinutes || 5,
      tokensUsed: response.tokensUsed,
      cost: response.cost,
    };
  }

  /**
   * Get rubric dimensions based on goal type / skill domain.
   * Each goal type has specific structural dimensions to evaluate.
   */
  private getAssessmentRubric(goalType?: string, skillName?: string): Array<{
    id: string;
    label: string;
    description: string;
  }> {
    // Project Lab — code-focused rubric
    if (goalType === 'project') {
      return [
        { id: 'code_correctness', label: 'Code Correctness', description: 'Would the code actually run and produce correct output for the stated requirements? Are there logic errors, syntax issues, or broken control flow?' },
        { id: 'edge_case_handling', label: 'Edge Case Handling', description: 'Does the code handle the specified edge cases (null/empty inputs, boundary values, error states)? Or does it only work for the happy path?' },
        { id: 'error_handling', label: 'Error Handling', description: 'Does the code handle failures gracefully — try/catch, validation, meaningful error messages — or does it silently break or crash?' },
        { id: 'code_structure', label: 'Code Structure & Readability', description: 'Is the code well-organized, with clear naming, appropriate abstractions, and readable logic? Or is it a tangled mess that technically works?' },
        { id: 'completeness', label: 'Completeness', description: 'Does the code address ALL parts of the task, or are requirements missing? Did they implement the full contract or only part of it?' },
      ];
    }

    // Interview Prep — code-focused rubric
    if (goalType === 'interview') {
      return [
        { id: 'code_correctness', label: 'Code Correctness', description: 'Would the code actually run and produce correct output for the given examples? Are there logic errors, off-by-one bugs, or broken control flow?' },
        { id: 'edge_case_handling', label: 'Edge Case Handling', description: 'Does the code handle edge cases (empty input, single element, duplicates, negative numbers, overflow)? Or does it only work for the example inputs?' },
        { id: 'algorithm_choice', label: 'Algorithm & Data Structure Choice', description: 'Did they choose an appropriate algorithm/data structure for the constraints? Is it efficient enough, or is there a clearly better approach?' },
        { id: 'complexity_analysis', label: 'Complexity Analysis', description: 'Did they correctly state the time/space complexity of their solution? Is their analysis accurate?' },
        { id: 'code_clarity', label: 'Code Clarity', description: 'Is the code readable with clear variable names and logical structure? Could an interviewer follow the logic easily?' },
      ];
    }

    // AI Builder rubric
    if (goalType === 'ai_builder') {
      return [
        { id: 'prompt_design', label: 'Prompt & Chain Design', description: 'Did they design clear prompts and break complex tasks into appropriate steps/chains?' },
        { id: 'evaluation_plan', label: 'Evaluation Plan', description: 'Did they define how to measure whether the system works — test cases, success criteria, or eval metrics?' },
        { id: 'guardrails_safety', label: 'Guardrails & Safety', description: 'Did they address PII handling, prompt injection, content policy, or other safety/security concerns?' },
        { id: 'monitoring_drift', label: 'Monitoring & Drift', description: 'Did they plan for production monitoring — failure rates, output drift, quality degradation over time?' },
        { id: 'data_grounding', label: 'Data Quality & Grounding', description: 'Did they consider data freshness, retrieval quality, hallucination mitigation, or context accuracy?' },
        { id: 'cost_latency', label: 'Cost & Latency Tradeoffs', description: 'Did they reason about model selection, caching, fallback modes, or when to use cheaper/faster alternatives?' },
      ];
    }

    // Default / Curriculum rubric — code correctness for coding skills, artifact quality for others
    return [
      { id: 'code_correctness', label: 'Correctness', description: 'For code: would it run and produce correct output? Trace through the logic. For non-code: does the artifact address the core requirements accurately?' },
      { id: 'edge_case_handling', label: 'Edge Cases & Error Handling', description: 'For code: does it handle edge inputs, nulls, errors without crashing? For non-code: did they consider what could go wrong, failure modes, or exceptions?' },
      { id: 'completeness', label: 'Completeness', description: 'Did they address ALL parts of the task? Are requirements missing or only partially implemented?' },
      { id: 'structure_quality', label: 'Structure & Clarity', description: 'For code: readable, well-named, logically organized? For non-code: clearly structured with reasoning explained?' },
      { id: 'depth_calibration', label: 'Depth Calibration', description: 'Did they go deep where it matters and keep it simple where appropriate? Over-engineering trivial parts and under-engineering critical ones are both gaps.' },
    ];
  }

  /**
   * Analyze a user's open-ended response using rubric-based structural scoring.
   * Each dimension scored 1-5 with specific gap analysis and examples.
   * Includes microLessonPoints for the weakest dimensions — no separate API call needed.
   */
  async analyzeGaps(params: {
    skillName: string;
    scenario: string;
    userResponse: string;
    goalType?: string;
    assessmentRound?: number;
  }): Promise<{
    gapProfile: {
      gaps: Array<{
        category: string;
        description: string;
        severity: 'high' | 'medium' | 'low';
        evidence: string;
      }>;
      strengths: Array<{
        category: string;
        description: string;
      }>;
      dimensions: Array<{
        id: string;
        name: string;
        score: number;
        gap?: string;
        example?: string;
      }>;
      overallScore: number;
      microLessonPoints: string[];
      detectedLevel: string;
      assessmentRound: number;
      scenario: string;
      userResponse: string;
    };
    tokensUsed: number;
    cost: number;
  }> {
    this.logger.log(`🔍 Analyzing gaps for: ${params.skillName} (goalType: ${params.goalType || 'curriculum'})`);

    const rubric = this.getAssessmentRubric(params.goalType, params.skillName);
    const dimensionInstructions = rubric
      .map((d) => `${d.id}: ${d.description}`)
      .join('\n');

    const evaluationFraming = this.getAnalysisFraming(params.goalType);

    const systemPrompt = `You are a structural evaluator. Score this response on specific dimensions.

${evaluationFraming}

Score each dimension 1-5:
${dimensionInstructions}

For EACH dimension, respond with:
- score (1-5): 1=absent, 2=superficial mention, 3=addressed but incomplete, 4=solid, 5=exceptional
- gap: what's specifically missing (if score < 4)
- example: how they could have addressed this gap in THIS scenario

Also provide:
- gaps: structural gaps as category/description/severity/evidence (derive severity from dimension scores: 1-2=high, 3=medium, 4-5=low or none)
- strengths: what they did well
- microLessonPoints: 2-3 targeted tips for the user's weakest dimensions (specific to THIS scenario, not generic advice)
- overallScore: weighted average of dimension scores
- detectedLevel: beginner (avg < 2.5) / intermediate (2.5-3.5) / advanced (> 3.5)

Be encouraging but honest. Do NOT rewrite the user's answer. Only evaluate and point out structural gaps.

Return valid JSON only.`;

    const userPrompt = `Skill: "${params.skillName}"
${params.goalType ? `Goal type: ${params.goalType}` : ''}

SCENARIO:
${params.scenario}

USER'S RESPONSE:
${params.userResponse}

Return JSON:
{
  "dimensions": [
    {
      "name": "${rubric[0].id}",
      "score": 3,
      "gap": "what's specifically missing",
      "example": "how they could have addressed this in THIS scenario"
    }
  ],
  "gaps": [
    {
      "category": "category_name",
      "description": "Human-readable gap description",
      "severity": "high|medium|low",
      "evidence": "What was absent from their response"
    }
  ],
  "strengths": [
    {
      "category": "category_name",
      "description": "What they did well"
    }
  ],
  "microLessonPoints": [
    "Tip 1: specific actionable improvement for their weakest dimension",
    "Tip 2: another specific tip"
  ],
  "overallScore": 3.2,
  "detectedLevel": "beginner|intermediate|advanced"
}`;

    const response = await this.aiService.routeRequest(
      AITask.LIGHTWEIGHT_CONTENT,
      userPrompt,
      systemPrompt,
    );

    let result: any;
    try {
      let cleanedContent = response.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanedContent = jsonMatch[0];
      result = JSON.parse(cleanedContent);
    } catch (error) {
      this.logger.error('❌ Failed to parse gap analysis:', error.message);
      throw new BadRequestException('Failed to analyze gaps');
    }

    // Ensure dimensions have proper structure and map rubric IDs
    const dimensions = (result.dimensions || []).map((d: any, i: number) => {
      const rawScore = Number(d.score);
      if (isNaN(rawScore) || rawScore < 1 || rawScore > 5) {
        this.logger.warn(`⚠️ Dimension "${d.name}" returned out-of-range score: ${d.score}`);
      }
      const score = Math.max(1, Math.min(5, rawScore || 1));
      // Match AI-returned dimension to rubric by index or name
      const rubricMatch = rubric.find((r) => r.id === d.name || r.label === d.name) || rubric[i];
      return {
        id: rubricMatch?.id || d.name,
        name: rubricMatch?.label || d.name,
        score,
        gap: score < 4 ? d.gap : undefined,
        example: score < 4 ? d.example : undefined,
      };
    });

    // Calculate overallScore if AI didn't provide it
    const overallScore = result.overallScore
      || (dimensions.length > 0
        ? Number((dimensions.reduce((sum: number, d: any) => sum + d.score, 0) / dimensions.length).toFixed(1))
        : 1);

    // Derive detectedLevel from overallScore if not provided
    const detectedLevel = result.detectedLevel
      || (overallScore > 3.5 ? 'advanced' : overallScore >= 2.5 ? 'intermediate' : 'beginner');

    this.logger.log(
      `✅ Gap analysis complete. ${dimensions.length} dimensions scored, overall: ${overallScore}/5, level: ${detectedLevel}. ${result.gaps?.length || 0} gaps, ${result.microLessonPoints?.length || 0} micro-lessons`,
    );

    return {
      gapProfile: {
        gaps: result.gaps || [],
        strengths: result.strengths || [],
        dimensions,
        overallScore,
        microLessonPoints: result.microLessonPoints || [],
        detectedLevel,
        assessmentRound: params.assessmentRound || 1,
        scenario: params.scenario,
        userResponse: params.userResponse,
      },
      tokensUsed: response.tokensUsed,
      cost: response.cost,
    };
  }
}
