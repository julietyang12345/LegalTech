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
  buildLightweightContentPrompt,
  buildBossDetailPrompt,
  usesProjectBasedLearning,
  DayDetailParams,
  BossDetailParams,
} from './prompts/curriculum-prompt';
import {
  ContentGenerationContext,
  buildContentGenerationContext,
  extractFoundationCardConcepts,
} from './prompts/content-generation-context';
import { formatTime } from './utils/shared.utils';

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
  /** Concepts from foundation cards, passed to deferred generation for consistency */
  foundationCardConcepts?: string[];
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
  private searchQueryCache = new Map<string, string>();

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
      AITask.CURRICULUM_GENERATION,
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

    // Step 1: Detect skill type and complexity
    const skillDetection = await this.skillDetector.detectSkillType(
      dto.skillName,
    );

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

    const { staticPart, dynamicPart, userPrompt } =
      buildCacheableCurriculumPrompt({
        skillName: dto.skillName,
        durationDays: dto.durationDays,
        hoursPerDay: dto.hoursPerDay,
        skillLevel: dto.skillLevel,
        skillType: skillDetection.skillType,
        complexity: skillDetection.complexity,
        userTier,
        suggestedLanguage: effectiveLanguage,
        prerequisiteSkills: skillDetection.prerequisiteSkills,
        learnerPrefs,
        customSections: skillDetection.customSections,
      });

    // Step 4: Generate curriculum OVERVIEW with AI (Phase 1) - with prompt caching
    this.logger.log(
      '🤖 Generating curriculum overview (Phase 1) with prompt caching...',
    );
    const aiResponse = await this.aiService.callAnthropicWithCache(
      'claude-sonnet-4-20250514',
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
        const fixedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
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
   * Returns: prePrompt, video, foundationCards, task1
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
          // foundationCards are REQUIRED - if missing, bypass cache and regenerate
          const cachedCards =
            cachedResult.content?.foundationCards ||
            cachedResult.content?.languageFoundationCards;

          if (!cachedCards || cachedCards.length === 0) {
            // Continue to regeneration - foundationCards are missing
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
          // foundationCards are REQUIRED - if missing, bypass cache and regenerate
          const cachedCards = cached?.foundationCards || cached?.languageFoundationCards;

          if (!cachedCards || cachedCards.length === 0) {
            // Continue to regeneration - foundationCards are missing
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
    let videoStrategy = dayOverview.videoStrategy || 'helpful';

    // Enforce video strategy by skill type and content type (override AI decision)
    const skillType = curriculum.metadata?.skillType;

    // Determine if this is a conceptual/theory day (doesn't benefit from video)
    const isConceptualDay =
      contentLayer === 'concept' ||
      contentLayer === 'theory' ||
      !curriculum.metadata.isProjectBased;

    if (skillType === 'KNOWLEDGE' || skillType === 'LANGUAGE') {
      videoStrategy = 'skip'; // Text + interaction is always better for concepts
    } else if (isConceptualDay && !dayOverview.requiresDemo) {
      videoStrategy = 'skip'; // Conceptual content doesn't need video
    } else if (skillType === 'PHYSICAL' || dayOverview.requiresDemo) {
      videoStrategy = 'recommended'; // Form demonstration requires visual
    } else {
      videoStrategy = dayOverview.videoStrategy || 'helpful';
    }

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
    };

    const { staticPart, dynamicPart, userPrompt } =
      buildCacheableDayDetailCorePrompt(params);

    const aiResponse = await this.aiService.callAnthropicWithCache(
      'claude-sonnet-4-20250514',
      userPrompt,
      { staticPart, dynamicPart },
    );

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

      // Normalize foundationCards
      if (
        coreContent.foundationCards &&
        Array.isArray(coreContent.foundationCards)
      ) {
        coreContent.foundationCards = coreContent.foundationCards.map(
          (card: any, index: number) => ({
            ...card,
            id: card.id || `day${dayNumber}-card-${index + 1}`,
            order: card.order ?? index + 1,
          }),
        );
      }

      // Normalize languageFoundationCards (for language learning)
      if (
        coreContent.languageFoundationCards &&
        Array.isArray(coreContent.languageFoundationCards)
      ) {
        coreContent.languageFoundationCards =
          coreContent.languageFoundationCards.map(
            (card: any, index: number) => ({
              ...card,
              id: card.id || `day${dayNumber}-vocab-${index + 1}`,
              order: card.order ?? index + 1,
            }),
          );
      }

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

    // Extract foundation card concepts for passing to deferred generation
    const foundationCardConcepts = extractFoundationCardConcepts(coreContent);
    this.logger.log(
      `📚 Extracted ${foundationCardConcepts.length} foundation card concepts for deferred generation`,
    );

    return {
      coreContent,
      tokensUsed: aiResponse.tokensUsed,
      cost: aiResponse.cost,
      fromCache: false,
      variantId,
      foundationCardConcepts,
    };
  }

  /**
   * Stream event types for real-time UI updates
   */
  static readonly STREAM_EVENTS = {
    PRE_PROMPT: 'prePrompt',
    FOUNDATION_CARD: 'foundationCard',
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
        // Yield cached content piece by piece for consistent UX
        if (cachedResult.content.prePrompt) {
          yield {
            event: CurriculumService.STREAM_EVENTS.PRE_PROMPT,
            data: cachedResult.content.prePrompt,
          };
        }
        const cards =
          cachedResult.content.languageFoundationCards ||
          cachedResult.content.foundationCards ||
          [];
        for (const card of cards) {
          yield {
            event: CurriculumService.STREAM_EVENTS.FOUNDATION_CARD,
            data: card,
          };
        }
        if (cachedResult.content.video) {
          yield {
            event: CurriculumService.STREAM_EVENTS.VIDEO,
            data: cachedResult.content.video,
          };
        }
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
    let videoStrategy = dayOverview.videoStrategy || 'helpful';
    const skillType = curriculum.metadata?.skillType;

    const isConceptualDay =
      contentLayer === 'concept' ||
      contentLayer === 'theory' ||
      !curriculum.metadata.isProjectBased;

    if (skillType === 'KNOWLEDGE' || skillType === 'LANGUAGE') {
      videoStrategy = 'skip';
    } else if (isConceptualDay && !dayOverview.requiresDemo) {
      videoStrategy = 'skip';
    } else if (skillType === 'PHYSICAL' || dayOverview.requiresDemo) {
      videoStrategy = 'recommended';
    } else {
      videoStrategy = dayOverview.videoStrategy || 'helpful';
    }

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

    // Stream from Anthropic
    let fullContent = '';
    let lastYieldedCardIndex = -1;
    let prePromptYielded = false;

    try {
      for await (const chunk of this.aiService.callAnthropicWithCacheStream(
        'claude-sonnet-4-20250514',
        userPrompt,
        { staticPart, dynamicPart },
      )) {
        if (chunk.type === 'text' && chunk.text) {
          fullContent += chunk.text;

          // Try to parse partial JSON and yield new content
          // Look for prePrompt first
          if (!prePromptYielded) {
            const prePromptMatch = fullContent.match(
              /"prePrompt"\s*:\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/s,
            );
            if (prePromptMatch) {
              try {
                const prePrompt = JSON.parse(prePromptMatch[1]);
                yield {
                  event: CurriculumService.STREAM_EVENTS.PRE_PROMPT,
                  data: prePrompt,
                };
                prePromptYielded = true;
              } catch {
                // Not complete yet, wait for more
              }
            }
          }

          // Look for foundation cards (stream each as it completes)
          const cardArrayMatch = fullContent.match(
            /"(?:foundation|languageFoundation)Cards"\s*:\s*\[/,
          );
          if (cardArrayMatch) {
            // Find all complete card objects
            const cardsSection = fullContent.slice(cardArrayMatch.index);
            const cardMatches = cardsSection.matchAll(
              /\{\s*"id"\s*:\s*"[^"]+(?:"[^"]*"[^{}]*|\{[^{}]*\}[^{}]*)*\}/g,
            );

            let cardIndex = 0;
            for (const match of cardMatches) {
              if (cardIndex > lastYieldedCardIndex) {
                try {
                  // Validate it's a complete card by attempting parse
                  const card = JSON.parse(match[0]);
                  // Check for required fields to ensure card is complete:
                  // - Regular cards need: id, concept, explanation, microQuestion
                  // - Vocabulary cards need: id, concept, vocabulary with term
                  const isRegularCardComplete =
                    card.id &&
                    card.concept &&
                    card.explanation &&
                    card.microQuestion;
                  const isVocabCardComplete =
                    card.id &&
                    card.concept &&
                    card.vocabulary?.term;

                  if (isRegularCardComplete || isVocabCardComplete) {
                    yield {
                      event: CurriculumService.STREAM_EVENTS.FOUNDATION_CARD,
                      data: card,
                    };
                    lastYieldedCardIndex = cardIndex;
                    this.logger.log(
                      `📤 Streamed card ${cardIndex + 1}: ${card.concept || card.vocabulary?.term}`,
                    );
                  }
                } catch {
                  // Card not complete yet
                  break;
                }
              }
              cardIndex++;
            }
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

            // Normalize cards
            if (coreContent.foundationCards) {
              coreContent.foundationCards = coreContent.foundationCards.map(
                (card: any, index: number) => ({
                  ...card,
                  id: card.id || `day${dayNumber}-card-${index + 1}`,
                  order: card.order ?? index + 1,
                }),
              );
            }
            if (coreContent.languageFoundationCards) {
              coreContent.languageFoundationCards =
                coreContent.languageFoundationCards.map(
                  (card: any, index: number) => ({
                    ...card,
                    id: card.id || `day${dayNumber}-vocab-${index + 1}`,
                    order: card.order ?? index + 1,
                  }),
                );
            }

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
              // Don't yield video event when skipped - frontend will skip video step
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

            const foundationCardConcepts =
              extractFoundationCardConcepts(coreContent);
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
                foundationCardConcepts,
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
   * Generate DEFERRED day content (background load)
   * Returns: reflection
   * Called after core loads, while user watches video
   *
   * @param foundationCardConcepts - Concepts from core content for consistent personalization
   * @param improvementAreas - User-specified areas to emphasize
   * @param lessOfAreas - User-specified areas to reduce content for
   */
  async generateDayDeferredDetails(
    curriculum: any,
    dayNumber: number,
    userTier: string = 'FREE',
    foundationCardConcepts?: string[],
    improvementAreas?: string[],
    lessOfAreas?: string[],
  ): Promise<DayDeferredResult> {
    this.logger.log(`⏳ Generating Day ${dayNumber} DEFERRED content...`);

    const dayOverview = curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      throw new BadRequestException(`Day ${dayNumber} not found in curriculum`);
    }

    // Check cache first
    const cacheKey = await this.buildDayCacheKey(
      curriculum.metadata,
      dayNumber,
      'deferred',
    );
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
      if (previousDayDeferred?.bossMilestone?.solutionCode) {
        // Inject previous day's deferred content so buildContentGenerationContext can find it
        previousDay.deferredContent = previousDayDeferred;
        this.logger.log(
          `📦 Fetched Day ${dayNumber - 1} solutionCode for cumulative building`,
        );
      }
    }

    // Build unified content generation context
    const ctx = buildContentGenerationContext(curriculum, dayNumber, {
      userTier,
      improvementAreas,
      lessOfAreas,
      previousDayReflection,
    });

    // Add foundation card concepts from core content
    if (foundationCardConcepts?.length) {
      ctx.generatedContent = { foundationCardConcepts };
      this.logger.log(
        `📚 Using ${foundationCardConcepts.length} foundation concepts for deferred content`,
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
    };

    // Pass context to deferred prompt builder for unified personalization
    const { systemPrompt, userPrompt } = buildDayDetailDeferredPrompt(
      params,
      ctx,
    );

    const aiResponse = await this.aiService.routeRequest(
      AITask.CURRICULUM_GENERATION,
      userPrompt,
      systemPrompt,
    );

    let deferredContent: any;
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

      // Validate openTask structure (practice-based curricula)
      if (deferredContent.openTask) {
        const ot = deferredContent.openTask;
        this.logger.log(
          `✅ Day ${dayNumber} openTask: "${ot.title}" (${ot.difficulty || 'medium'})`,
        );
      } else if (deferredContent.intensivePractice) {
        // Practice-based but no openTask - log warning
        this.logger.warn(
          `⚠️ Day ${dayNumber} is practice-based but missing openTask`,
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ Failed to parse Day ${dayNumber} DEFERRED:`,
        error.message,
      );
      throw new BadRequestException(
        'Failed to generate deferred day content. Please try again.',
      );
    }

    // Generate lightweight content (reflection/openTask) with Haiku for cost efficiency
    try {
      const { systemPrompt: lightSystemPrompt, userPrompt: lightUserPrompt } =
        buildLightweightContentPrompt(params, ctx);

      const lightweightResponse = await this.aiService.routeRequest(
        AITask.LIGHTWEIGHT_CONTENT,
        lightUserPrompt,
        lightSystemPrompt,
      );

      let lightweightContent: any;
      const cleanedLightweight = lightweightResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const lightJsonMatch = cleanedLightweight.match(/\{[\s\S]*\}/);
      if (lightJsonMatch) {
        try {
          lightweightContent = JSON.parse(lightJsonMatch[0]);
        } catch {
          const fixedLight = lightJsonMatch[0].replace(/,(\s*[}\]])/g, '$1');
          lightweightContent = JSON.parse(fixedLight);
        }

        // Replace Sonnet's reflection/openTask with Haiku's version
        if (lightweightContent.reflection) {
          deferredContent.reflection = lightweightContent.reflection;
          this.logger.log(`✅ Day ${dayNumber} reflection generated with Haiku`);
        }
        if (lightweightContent.openTask) {
          deferredContent.openTask = lightweightContent.openTask;
          this.logger.log(`✅ Day ${dayNumber} openTask generated with Haiku`);
        }
      }
    } catch (lightError) {
      // Non-fatal: keep Sonnet's reflection/openTask if Haiku fails
      this.logger.warn(
        `⚠️ Day ${dayNumber} lightweight content failed, using Sonnet fallback: ${lightError.message}`,
      );
    }

    // Cache the result
    await this.cacheService.setDayContent(cacheKey, deferredContent);

    this.logger.log(
      `✅ Day ${dayNumber} DEFERRED generated. Tokens: ${aiResponse.tokensUsed}`,
    );

    return {
      deferredContent,
      tokensUsed: aiResponse.tokensUsed,
      cost: aiResponse.cost,
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
    foundationCardConcepts?: string[],
    improvementAreas?: string[],
    lessOfAreas?: string[],
  ): AsyncGenerator<{
    event: string;
    data: any;
  }> {
    this.logger.log(`⏳ Streaming Day ${dayNumber} DEFERRED content...`);

    const dayOverview = curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      yield {
        event: CurriculumService.DEFERRED_STREAM_EVENTS.ERROR,
        data: { error: `Day ${dayNumber} not found in curriculum` },
      };
      return;
    }

    // Check cache first
    const cacheKey = await this.buildDayCacheKey(
      curriculum.metadata,
      dayNumber,
      'deferred',
    );
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
      if (previousDayDeferred?.bossMilestone?.solutionCode) {
        // Inject previous day's deferred content so buildContentGenerationContext can find it
        previousDay.deferredContent = previousDayDeferred;
        this.logger.log(
          `📦 Fetched Day ${dayNumber - 1} solutionCode for cumulative building (streaming)`,
        );
      }
    }

    const ctx = buildContentGenerationContext(curriculum, dayNumber, {
      userTier,
      improvementAreas,
      lessOfAreas,
      previousDayReflection,
    });

    if (foundationCardConcepts?.length) {
      ctx.generatedContent = { foundationCardConcepts };
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
    };

    const { systemPrompt, userPrompt } = buildDayDetailDeferredPrompt(
      params,
      ctx,
    );

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
      AITask.CURRICULUM_GENERATION,
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
   * Generate starter code template
   */
  async generateStarterCode(params: {
    projectTitle: string;
    projectDescription: string;
    language: string;
  }): Promise<{ code: string; tokensUsed: number; cost: number }> {
    this.logger.log(`📝 Generating starter code for: ${params.projectTitle}`);

    const prompt = `Generate starter code template for this project:

Title: ${params.projectTitle}
Description: ${params.projectDescription}
Language: ${params.language}

Requirements:
1. Create a clean, well-structured code skeleton
2. Include TODO comments showing what to implement
3. Add helpful explanatory comments
4. Use best practices for ${params.language}

Return ONLY the code, no markdown blocks:`;

    const response = await this.aiService.routeRequest(
      AITask.CODE_GENERATION,
      prompt,
    );

    return {
      code: response.content,
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
      AITask.CURRICULUM_GENERATION,
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

    this.logger.log(
      `✅ Concept boost generated. Tokens: ${response.tokensUsed}`,
    );

    return {
      boost,
      tokensUsed: response.tokensUsed,
      cost: response.cost,
    };
  }
}
