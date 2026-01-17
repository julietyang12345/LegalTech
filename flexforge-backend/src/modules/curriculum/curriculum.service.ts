import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService, AITask } from '../ai/ai.service';
import { GenerateCurriculumDto } from './dto/generate-curriculum.dto';
import { SkillDetectorService, SkillType } from './services/skill-detector.service';
import { VideoMatchingService } from './services/youtube/video-matching.service';
import { FileGeneratorService } from './services/file-generator.service';
import { CurriculumCacheService } from './services/curriculum-cache.service';
import { UniversityResourceService } from './services/university/university-resource.service';
import { DocumentationFetchService, DocFetchResult } from './services/docs/documentation-fetch.service';
import {
  buildCacheableCurriculumPrompt,
  buildDayDetailPrompt,
  buildCacheableDayDetailCorePrompt,
  buildDayDetailDeferredPrompt,
  buildBossDetailPrompt,
  usesProjectBasedLearning,
  DayDetailParams,
  BossDetailParams,
} from './prompts/curriculum-prompt';
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
}

export interface DayDeferredResult {
  deferredContent: any;
  tokensUsed: number;
  cost: number;
  fromCache?: boolean;
}

@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);

  /**
   * Extract key concepts from generated day content for video search
   * Uses foundationCards concepts and task title/description to build search query
   * Includes skill context to avoid overly generic searches
   */
  private extractSearchConceptsFromContent(
    dayContent: any,
    fallbackTitle: string,
    skillName?: string,
  ): string {
    const concepts: string[] = [];

    // Extract from foundationCards (primary concepts)
    if (dayContent.foundationCards && Array.isArray(dayContent.foundationCards)) {
      // Get concepts from first 3-4 cards (core concepts, skip intro card)
      const coreCards = dayContent.foundationCards.slice(1, 5);
      for (const card of coreCards) {
        if (card.concept) {
          // Clean concept - remove questions like "What is X?" -> "X"
          const cleaned = card.concept
            .replace(/^(What is|What are|How to|Why|When to use)\s*/i, '')
            .replace(/\?$/, '')
            .trim();
          if (cleaned && cleaned.length > 2) {
            concepts.push(cleaned);
          }
        }
      }
    }

    // Extract from task title (practical application)
    if (dayContent.task1?.title) {
      const taskConcept = dayContent.task1.title
        .replace(/^(Build|Create|Implement|Write|Make|Set up|Configure)\s*/i, '')
        .trim();
      if (taskConcept && taskConcept.length > 3) {
        concepts.push(taskConcept);
      }
    }

    // Build search query with skill context for relevance
    if (concepts.length > 0) {
      // Take first 2-3 concepts
      const conceptQuery = concepts.slice(0, 3).join(' ');

      // Always include skill context to ensure domain-specific results
      // e.g., "AI Automation" + "API request" → "AI Automation API request"
      if (skillName) {
        const skillContext = skillName
          .replace(/\b(introduction to|intro to|basics of|fundamentals of|learning|course|tutorial)\b/gi, '')
          .trim()
          .split(' ')
          .slice(0, 2)  // First 2 words of skill name
          .join(' ');

        const searchQuery = `${skillContext} ${conceptQuery}`;
        this.logger.log(`🔍 Search query: "${searchQuery}" (skill: ${skillContext}, concepts: ${conceptQuery})`);
        return searchQuery;
      }

      this.logger.log(`🔍 Search query (no skill context): "${conceptQuery}"`);
      return conceptQuery;
    }

    this.logger.log(`🔍 Using fallback search concept: "${fallbackTitle}"`);
    return fallbackTitle;
  }

  constructor(
    private aiService: AiService,
    private skillDetector: SkillDetectorService,
    private videoMatcher: VideoMatchingService,
    private fileGenerator: FileGeneratorService,
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
    const skillDetection = await this.skillDetector.detectSkillType(dto.skillName);

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
      outputType: dto.outputType,
      selectedDirection: dto.selectedDirection,
      selectedDirectionOutcome: dto.selectedDirectionOutcome,
      directionKeywords: dto.directionKeywords,
      selectedLanguage: dto.selectedLanguage,
    };
    this.logger.log(`🎯 DEBUG learnerPrefs passed to prompt:`, JSON.stringify(learnerPrefs));

    // Use user's selected language if provided, otherwise use auto-detected
    const effectiveLanguage = dto.selectedLanguage || skillDetection.suggestedLanguage;

    const { staticPart, dynamicPart, userPrompt } = buildCacheableCurriculumPrompt({
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
    });

    // Step 4: Generate curriculum OVERVIEW with AI (Phase 1) - with prompt caching
    this.logger.log('🤖 Generating curriculum overview (Phase 1) with prompt caching...');
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
      this.logger.error('Raw AI response (first 1000 chars):', aiResponse.content.substring(0, 1000));
      throw new BadRequestException('Failed to generate curriculum overview. Please try again.');
    }

    // Calculate isProjectBased ONCE and store it - don't re-calculate later
    const isProjectBased = usesProjectBasedLearning(skillDetection.skillType, dto.outputType);
    this.logger.log(`🎯 Curriculum type: ${isProjectBased ? 'PROJECT-BASED' : 'PRACTICE-BASED'}`);

    // Validate curriculum structure before proceeding
    if (!curriculum.days || !Array.isArray(curriculum.days) || curriculum.days.length === 0) {
      this.logger.error('❌ AI returned invalid curriculum structure - missing days array');
      this.logger.error('Curriculum received:', JSON.stringify(curriculum).substring(0, 500));
      throw new BadRequestException('Failed to generate curriculum - invalid structure. Please try again.');
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
      isProjectBased, // Store this - use it consistently, don't re-calculate
      outputType: dto.outputType, // Store user's intent
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
   * Generate full content for a specific day
   * Called when student starts a day (clicks "Start Day")
   *
   * OPTIMIZATION: Video search runs in parallel with AI content generation
   * using skeleton info (dayOverview.title + skills) instead of waiting for AI response
   */
  async generateDayDetails(
    curriculum: any,
    dayNumber: number,
    userTier: string = 'FREE',
  ): Promise<DayDetailResult> {
    this.logger.log(`🎯 Generating Day ${dayNumber} details (Phase 2)...`);

    const dayOverview = curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      throw new BadRequestException(`Day ${dayNumber} not found in curriculum`);
    }

    const previousDay = curriculum.days.find((d: any) => d.day === dayNumber - 1);

    // Get AI-decided strategy fields from skeleton
    const contentLayer = dayOverview.contentLayer || 'framework';     // foundation|language_core|framework|tool|project
    const videoStrategy = dayOverview.videoStrategy || 'helpful';     // skip|optional|helpful|recommended
    const transferability = dayOverview.transferability || 'medium';  // high|medium|low
    const contentSource = dayOverview.contentSource || 'youtube';     // university|youtube|text|docs

    this.logger.log(`📚 Day ${dayNumber} strategy: layer=${contentLayer}, video=${videoStrategy}, transfer=${transferability}, source=${contentSource}`);

    // Start video/resource search EARLY (runs in parallel with AI)
    const levelMap: Record<string, 'beginner' | 'intermediate' | 'advanced'> = {
      'BEGINNER': 'beginner',
      'INTERMEDIATE': 'intermediate',
      'ADVANCED': 'advanced',
    };

    // Use skeleton's title as search concept
    // Strip "Day X:" prefix, filler words, and special characters for cleaner YouTube search
    let searchConcept = (dayOverview.title || '')
      .replace(/^Day\s*\d+\s*[:.-]\s*/i, '')  // Remove "Day 1:" prefix
      .replace(/&/g, ' ')                      // Replace & with space
      .replace(/\b(Basic|Basics|Beginner|Beginning|Introduction to|Intro to|Advanced|Intermediate|Fundamentals of|Fundamentals|Essential|Essentials|Getting Started with|Overview of|Deep Dive into|Mastering)\b/gi, '')
      .replace(/\s+/g, ' ')                    // Collapse multiple spaces
      .trim();

    // Calculate video slot based on session duration (matches getTimeStructure in prompt)
    const sessionMinutes = Math.round(curriculum.metadata.hoursPerDay * 60);
    const videoSlot = sessionMinutes <= 30 ? 5
      : sessionMinutes <= 45 ? 6
      : sessionMinutes <= 60 ? 7
      : 10; // 90+ min sessions

    // Video search will happen AFTER content generation to match video with actual content
    // This ensures video content aligns with foundationCards and tasks
    let universityResourcePromise: Promise<any> | null = null;
    let docFetchPromise: Promise<DocFetchResult | null> | null = null;
    // Search for videos unless explicitly set to skip or contentSource is 'text' (simple AI explanations)
    // Keep videos for docs/youtube/university - only skip for text to save Gemini tokens
    const shouldSearchVideo = videoStrategy !== 'skip' && contentSource !== 'text';

    this.logger.log(`🔍 VIDEO DEBUG: shouldSearchVideo=${shouldSearchVideo}, videoStrategy=${videoStrategy}, contentSource=${contentSource}`);
    if (!shouldSearchVideo) {
      this.logger.log(`📝 Skipping video search for Day ${dayNumber} (videoStrategy: ${videoStrategy}, contentSource: ${contentSource})`);
    }

    // Search for university resources when contentSource is 'university'
    // Runs in parallel with AI generation (not dependent on content)
    if (contentSource === 'university') {
      this.logger.log(`🎓 Starting university resource search for: "${searchConcept}"`);
      universityResourcePromise = Promise.all([
        this.universityResource.searchResources(searchConcept, 'lecture_notes', 2),
        this.universityResource.searchResources(searchConcept, 'problem_set', 2),
      ]).catch(error => {
        this.logger.warn(`⚠️ University resource search failed: ${error.message}`);
        return null;
      });
    }

    // Fetch official documentation when contentSource is 'docs'
    // Runs in parallel with AI generation
    if (contentSource === 'docs') {
      this.logger.log(`📚 Starting documentation fetch for: "${searchConcept}"`);
      docFetchPromise = this.docFetcher.fetchDocumentation(
        searchConcept,
        curriculum.metadata.suggestedLanguage,
        3, // max 3 doc pages
      ).catch(error => {
        this.logger.warn(`⚠️ Documentation fetch failed: ${error.message}`);
        return null;
      });
    }

    // Generate day content with AI (runs in parallel with video search)
    const params: DayDetailParams = {
      skillName: curriculum.metadata.skillName,
      dayNumber,
      dayTitle: dayOverview.title,
      dayObjectives: dayOverview.skills, // skills from skeleton
      skeleton: dayOverview, // pass the entire day overview as skeleton
      previousDayTitle: previousDay?.title,
      skillType: curriculum.metadata.skillType,
      skillLevel: curriculum.metadata.skillLevel,  // BEGINNER, INTERMEDIATE, ADVANCED
      complexity: curriculum.metadata.complexity,
      userTier,
      hoursPerDay: curriculum.metadata.hoursPerDay,
      suggestedLanguage: curriculum.metadata.suggestedLanguage,
      outputType: curriculum.metadata.outputType,
      isProjectBased: curriculum.metadata.isProjectBased, // Use stored value, don't re-calculate
    };

    const { systemPrompt, userPrompt } = buildDayDetailPrompt(params);

    const aiResponse = await this.aiService.routeRequest(
      AITask.CURRICULUM_GENERATION,
      userPrompt,
      systemPrompt,
    );

    let dayContent: any;
    try {
      let cleanedContent = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      // Debug: Log first 500 chars of AI response
      this.logger.log(`🤖 Day ${dayNumber} AI response preview: ${cleanedContent.substring(0, 500)}...`);

      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedContent = jsonMatch[0];
      }

      try {
        dayContent = JSON.parse(cleanedContent);
      } catch {
        const fixedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
        dayContent = JSON.parse(fixedContent);
      }

      this.logger.log(`✅ Day ${dayNumber} details parsed successfully`);

      // Debug: Log what keys are in the response
      this.logger.log(`📦 Day ${dayNumber} content keys: ${Object.keys(dayContent).join(', ')}`);
    } catch (error) {
      this.logger.error(`❌ Failed to parse Day ${dayNumber} details:`, error.message);
      throw new BadRequestException('Failed to generate day details. Please try again.');
    }

    // Validate and normalize foundationCards if present
    if (dayContent.foundationCards && Array.isArray(dayContent.foundationCards)) {
      dayContent.foundationCards = dayContent.foundationCards.map((card: any, index: number) => ({
        ...card,
        id: card.id || `day${dayNumber}-card-${index + 1}`,
        order: card.order ?? index + 1,
        // Ensure microQuestion has required fields
        microQuestion: {
          ...card.microQuestion,
          type: card.microQuestion?.type || 'understanding',
        },
      }));
      this.logger.log(`✅ Day ${dayNumber}: Generated ${dayContent.foundationCards.length} foundation cards`);
      this.logger.log(`📋 Card IDs: ${dayContent.foundationCards.map((c: any) => c.id).join(', ')}`);
    } else {
      this.logger.warn(`⚠️ Day ${dayNumber}: No foundationCards in AI response. Has activeRecall: ${!!dayContent.activeRecall}, Has conceptCheck: ${!!dayContent.conceptCheck}`);
    }

    // Generate file resources for tasks if needed
    if (
      curriculum.metadata.skillType === SkillType.CODE ||
      curriculum.metadata.skillType === SkillType.AI_AGENT
    ) {
      dayContent = await this.generateDayFileResources(
        dayContent,
        curriculum.metadata.suggestedLanguage,
      );
    }

    // Await university resource search result
    const universityResults = universityResourcePromise ? await universityResourcePromise : null;

    // Await documentation fetch result
    const docResult = docFetchPromise ? await docFetchPromise : null;

    // NOW search for video using concepts from generated content
    // This ensures video matches what foundationCards and tasks actually teach
    let videoResult: any = null;
    // Extract concept outside the if block so it's available for AI explanation fallback
    const contentBasedConcept = this.extractSearchConceptsFromContent(
      dayContent,
      searchConcept,
      curriculum.metadata.skillName,
    );

    if (shouldSearchVideo && dayContent.video) {
      this.logger.log(`🎥 Searching video for content-based concept: "${contentBasedConcept}" (${videoSlot}min slot)`);

      try {
        videoResult = await this.videoMatcher.findBestVideo({
          concept: contentBasedConcept,
          userSlot: videoSlot,
          userLevel: levelMap[curriculum.metadata.skillLevel] || 'beginner',
          skillType: curriculum.metadata.skillType,
          contentSource,
        }, { deepVerify: true });
      } catch (error: any) {
        this.logger.warn(`⚠️ Video search failed: ${error.message}`);
        videoResult = null;
      }
      this.logger.log(`🔍 VIDEO RESULT: success=${videoResult?.success}, video=${videoResult?.video?.title || 'none'}, error=${videoResult?.error || 'none'}`);
    } else {
      this.logger.log(`🔍 VIDEO SEARCH SKIPPED: shouldSearchVideo=${shouldSearchVideo}, hasDayContentVideo=${!!dayContent?.video}`);
    }

    // Merge strategy metadata into dayContent for frontend
    dayContent.contentLayer = contentLayer;
    dayContent.videoStrategy = videoStrategy;
    dayContent.transferability = transferability;
    dayContent.contentSource = contentSource;

    // Get adaptive modality decision (video vs AI vs both)
    const adaptiveModality = videoResult?.adaptiveModality;
    const defaultMode = adaptiveModality?.defaultMode || 'ai';

    // Always generate AI explanation for backup/alternative
    const aiExplanation = this.generateAiExplanation(dayContent, contentBasedConcept);

    // Handle content based on adaptive modality
    if (dayContent.video && videoResult?.success) {
      // AI is default mode - show AI explanation first, video as option
      if (defaultMode === 'ai') {
        this.logger.log(`📝 Day ${dayNumber}: AI explanation as default (${adaptiveModality?.reasonShort || 'confidence low'})`);

        dayContent.video = {
          // AI explanation as primary (derived from adaptiveModality)
          useAiExplanation: defaultMode === 'ai',
          concept: contentBasedConcept,
          title: `Understanding ${contentBasedConcept}`,
          explanation: aiExplanation,
          reason: adaptiveModality?.reason || `AI explanation recommended for "${contentBasedConcept}".`,

          // Video still available as backup if user wants
          videoAvailable: adaptiveModality?.videoAvailable ?? false,
          showVideoOption: adaptiveModality?.showVideoOption ?? false,
          ...(adaptiveModality?.videoAvailable && videoResult.video ? {
            backupVideo: {
              videoId: videoResult.video.videoId,
              title: videoResult.video.title,
              channelName: videoResult.video.channelName,
              url: `https://www.youtube.com/watch?v=${videoResult.video.videoId}`,
              matchPercent: videoResult.matchPercent,
            },
          } : {}),

          // Adaptive modality metadata for frontend
          adaptiveModality: {
            defaultMode,
            videoConfidence: adaptiveModality?.videoConfidence ?? 0,
            reason: adaptiveModality?.reason || '',
            reasonShort: adaptiveModality?.reasonShort || '',
          },
        };
      } else if (videoResult.video) {
        // Video is default mode - show video first, AI as option
        const video = videoResult.video;
        const watchPlan = videoResult.watchPlan;

        // Build ALL alternative videos from buildAlternatives() result (up to 2)
        // These are the next-best ranked videos for progressive "try different" UX
        const alternatives = videoResult.alternatives?.map(alt => ({
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
            ? Math.ceil((alt.watchPlan.primarySegment.endSeconds - alt.watchPlan.primarySegment.startSeconds) / 60)
            : 6,
          differentiator: alt.differentiator,
          matchPercent: alt.matchPercent,
        })) || [];

        // Check if this is a university channel (MIT OCW, CS50, etc.)
        const universityChannels = ['MIT OpenCourseWare', 'Harvard CS50', 'freeCodeCamp', 'Khan Academy', 'Stanford Online'];
        const isUniversityVideo = contentSource === 'university' ||
          universityChannels.some(ch => video.channelName?.toLowerCase().includes(ch.toLowerCase()));

        dayContent.video = {
          ...dayContent.video,
          useAiExplanation: false, // Video is primary mode
          url: `https://www.youtube.com/watch?v=${video.videoId}`,
          videoId: video.videoId,
          title: video.title,
          channelName: video.channelName,
          duration: video.duration,
          startTime: watchPlan?.primarySegment ? formatTime(watchPlan.primarySegment.startSeconds) : undefined,
          endTime: watchPlan?.primarySegment ? formatTime(watchPlan.primarySegment.endSeconds) : undefined,
          watchInstructions: watchPlan?.primarySegment?.description || `Watch this video to learn about ${dayContent.title}`,
          // Only use keyTopics from actual video (chapters/AI analysis), NOT fallback to generic watchPoints
          keyTopics: watchPlan?.keyTopics?.length ? watchPlan.keyTopics : undefined,
          summary: watchPlan?.summary, // AI-generated video summary for Active Recall
          estimatedMinutes: watchPlan?.primarySegment
            ? Math.ceil((watchPlan.primarySegment.endSeconds - watchPlan.primarySegment.startSeconds) / 60)
            : 6,
          verified: true,
          matchPercent: videoResult.matchPercent,
          whyThisVideo: videoResult.whyThisVideo,
          alternatives,
          // New: Tag for frontend display
          isUniversityLecture: isUniversityVideo,
          sourceType: contentSource, // 'university' | 'youtube'

          // Adaptive modality: AI explanation available as backup
          showAiOption: adaptiveModality?.showAiOption ?? true,
          aiExplanation: aiExplanation, // Pre-generated for instant switch
          adaptiveModality: {
            defaultMode: 'video',
            videoConfidence: adaptiveModality?.videoConfidence ?? 70,
            reason: adaptiveModality?.reason || 'Good video match found.',
            reasonShort: adaptiveModality?.reasonShort || 'Good match',
          },
        };
        this.logger.log(`✅ Day ${dayNumber} video found: ${video.title} (${videoResult.matchPercent}% match)${alternatives.length > 0 ? ` + ${alternatives.length} alternatives` : ''}`);
      }
    } else if (dayContent.video && videoResult && !videoResult.success) {
      this.logger.warn(`⚠️ Day ${dayNumber} video not found: ${videoResult.error}`);

      // No video found - default to AI explanation
      dayContent.video = {
        useAiExplanation: true, // No video available, always AI
        concept: contentBasedConcept,
        title: `Understanding ${contentBasedConcept}`,
        explanation: aiExplanation,
        reason: `No suitable video found for "${contentBasedConcept}". Here's a focused explanation.`,
        videoAvailable: false,
        showVideoOption: false,
        adaptiveModality: {
          defaultMode: 'ai',
          videoConfidence: 0,
          reason: videoResult.error || 'No video found',
          reasonShort: 'No video',
        },
      };
    } else if (dayContent.video && !videoResult) {
      // Video search was skipped (e.g., text/docs content source)
      dayContent.video = {
        useAiExplanation: true, // No video searched, always AI
        concept: contentBasedConcept,
        title: `Understanding ${contentBasedConcept}`,
        explanation: aiExplanation,
        reason: 'AI explanation provided for this topic.',
        videoAvailable: false,
        showVideoOption: false,
        adaptiveModality: {
          defaultMode: 'ai',
          videoConfidence: 0,
          reason: 'Video search skipped for this content type',
          reasonShort: 'Text content',
        },
      };
    }

    // FALLBACK: If video failed/skipped AND contentLayer is 'foundation', try university resources
    // This catches cases where AI didn't set contentSource='university' but topic is academic
    let fallbackUniversityResults = null;
    if (!universityResults && contentLayer === 'foundation' && (!videoResult?.success || !shouldSearchVideo)) {
      this.logger.log(`🎓 Fallback: Searching university resources for foundation topic: "${searchConcept}"`);
      try {
        fallbackUniversityResults = await Promise.all([
          this.universityResource.searchResources(searchConcept, 'lecture_video', 2),
          this.universityResource.searchResources(searchConcept, 'lecture_notes', 2),
        ]);
      } catch (error) {
        this.logger.warn(`⚠️ Fallback university search failed: ${error.message}`);
      }
    }

    // Use fallback results if original universityResults is null
    const finalUniversityResults = universityResults || fallbackUniversityResults;

    // Add university resources (lecture notes, problem sets) if available
    if (finalUniversityResults) {
      const [lectureNotesResult, problemSetsResult] = finalUniversityResults;
      const universityResources: any[] = [];

      if (lectureNotesResult?.success && lectureNotesResult.resources?.length > 0) {
        universityResources.push(...lectureNotesResult.resources.map((r: any) => ({
          type: 'lecture_notes',
          source: r.source,
          title: r.title,
          url: r.url,
          description: r.description,
        })));
      }

      if (problemSetsResult?.success && problemSetsResult.resources?.length > 0) {
        universityResources.push(...problemSetsResult.resources.map((r: any) => ({
          type: 'problem_set',
          source: r.source,
          title: r.title,
          url: r.url,
          description: r.description,
        })));
      }

      if (universityResources.length > 0) {
        dayContent.universityResources = universityResources;
        this.logger.log(`✅ Day ${dayNumber}: Found ${universityResources.length} university resources`);
      }
    }

    // Add official documentation resources if available
    if (docResult?.success && docResult.docs?.length > 0) {
      dayContent.documentation = {
        source: docResult.source,
        searchQuery: docResult.searchQuery,
        resources: docResult.docs.map(doc => ({
          title: doc.title,
          url: doc.url,
          source: doc.source,
          sections: doc.sections.map(section => ({
            heading: section.heading,
            content: section.content,
            codeExamples: section.codeExamples,
            apiSignatures: section.apiSignatures,
          })),
        })),
      };
      this.logger.log(`✅ Day ${dayNumber}: Found ${docResult.docs.length} documentation pages from ${docResult.source}`);
    }

    this.logger.log(
      `✅ Day ${dayNumber} details generated. Tokens: ${aiResponse.tokensUsed}, Cost: $${aiResponse.cost.toFixed(4)}`,
    );

    return {
      dayContent,
      tokensUsed: aiResponse.tokensUsed,
      cost: aiResponse.cost,
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
  ): Promise<DayCoreResult> {
    this.logger.log(`🚀 Generating Day ${dayNumber} CORE content...`);

    const dayOverview = curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      throw new BadRequestException(`Day ${dayNumber} not found in curriculum`);
    }

    // Check cache first (skip if forceRegenerate)
    const cacheKey = this.buildDayCacheKey(curriculum.metadata, dayNumber, 'core');
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
          this.logger.log(`📦 Day ${dayNumber} CORE variant cache HIT (variant=${cachedResult.variantId})`);
          return {
            coreContent: cachedResult.content,
            tokensUsed: 0,
            cost: 0,
            fromCache: true,
            variantId: cachedResult.variantId,
          };
        }
      } else {
        // Fallback to legacy cache for backward compatibility
        const cached = await this.cacheService.getDayContent(cacheKey);
        if (cached) {
          this.logger.log(`📦 Day ${dayNumber} CORE cache HIT (legacy)`);
          return { coreContent: cached, tokensUsed: 0, cost: 0, fromCache: true };
        }
      }
    } else {
      this.logger.log(`🔄 Force regenerating Day ${dayNumber} CORE (bypassing L2 cache)`);
    }

    const previousDay = curriculum.days.find((d: any) => d.day === dayNumber - 1);

    // Get reflection data from previous day (if any)
    const previousDayReflection = previousDay?.reflectionData ? {
      confusedConcepts: previousDay.reflectionData.confusedConcepts,
      confidence: previousDay.reflectionData.confidence,
      boostCompleted: previousDay.reflectionData.boostCompleted,
    } : undefined;

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
      outputType: curriculum.metadata.outputType,
      isProjectBased: curriculum.metadata.isProjectBased, // Use stored value, don't re-calculate
    };

    const { staticPart, dynamicPart, userPrompt } = buildCacheableDayDetailCorePrompt(params);

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
      if (coreContent.foundationCards && Array.isArray(coreContent.foundationCards)) {
        coreContent.foundationCards = coreContent.foundationCards.map((card: any, index: number) => ({
          ...card,
          id: card.id || `day${dayNumber}-card-${index + 1}`,
          order: card.order ?? index + 1,
        }));
      }

      // Validate and normalize bossMilestone (for project-based curricula)
      if (coreContent.bossMilestone) {
        const bm = coreContent.bossMilestone;

        // DEBUG: Log raw bossMilestone content
        this.logger.log(`🔍 Day ${dayNumber} bossMilestone RAW:`, JSON.stringify({
          title: bm.title,
          microTask: bm.microTask?.substring(0, 50),
          starterCodeType: typeof bm.starterCode,
          starterCodeLength: bm.starterCode?.length || 0,
          starterCodePreview: bm.starterCode?.substring(0, 150),
          solutionType: typeof bm.solution,
          solutionLength: bm.solution?.length || 0,
          solutionPreview: bm.solution?.substring(0, 150),
        }, null, 2));

        // Check if starterCode is a placeholder or missing
        const isStarterCodePlaceholder = !bm.starterCode ||
          bm.starterCode.includes('REQUIRED:') ||
          bm.starterCode.includes('GENERATE:') ||
          bm.starterCode.includes('// Comprehensive starter') ||
          bm.starterCode === '// Start your project here\n\n' ||
          bm.starterCode.length < 20;

        // Check if solution is a placeholder or missing
        const isSolutionPlaceholder = !bm.solution ||
          bm.solution.includes('REQUIRED:') ||
          bm.solution.includes('GENERATE:') ||
          bm.solution.includes('// COMPLETE working solution') ||
          bm.solution.length < 30;

        if (isStarterCodePlaceholder || isSolutionPlaceholder) {
          this.logger.warn(`⚠️ Day ${dayNumber} bossMilestone has placeholder content:
  - starterCode valid: ${!isStarterCodePlaceholder}
  - solution valid: ${!isSolutionPlaceholder}
  - starterCode preview: "${bm.starterCode?.substring(0, 80)}"
  - solution preview: "${bm.solution?.substring(0, 80)}"`);
        }

        // Ensure hints are properly formatted
        if (bm.hints && Array.isArray(bm.hints)) {
          coreContent.bossMilestone.hints = bm.hints
            .filter((h: any) => h.hint && !h.hint.includes('REQUIRED:'))
            .map((h: any, index: number) => ({
              level: h.level || index + 1,
              hint: typeof h === 'string' ? h : h.hint,
            }));
        }

        // Ensure solutionAnnotations are strings
        if (bm.solutionAnnotations && Array.isArray(bm.solutionAnnotations)) {
          coreContent.bossMilestone.solutionAnnotations = bm.solutionAnnotations
            .filter((a: any) => a && !String(a).includes('REQUIRED:'));
        }

        this.logger.log(`✅ Day ${dayNumber} bossMilestone FINAL: starterCode=${bm.starterCode?.length || 0} chars, solution=${bm.solution?.length || 0} chars`);
      } else {
        this.logger.log(`ℹ️ Day ${dayNumber} has no bossMilestone (practice-based curriculum)`);
      }

      this.logger.log(`✅ Day ${dayNumber} CORE parsed: ${coreContent.foundationCards?.length || 0} cards`);
    } catch (error) {
      this.logger.error(`❌ Failed to parse Day ${dayNumber} CORE:`, error.message);
      throw new BadRequestException('Failed to generate core day content. Please try again.');
    }

    // Add metadata
    coreContent.contentLayer = dayOverview.contentLayer || 'framework';
    coreContent.videoStrategy = dayOverview.videoStrategy || 'helpful';
    coreContent.contentSource = dayOverview.contentSource || 'youtube';

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
      this.logger.log(`✅ Day ${dayNumber} CORE generated and cached with variant=${variantId}`);
    } else {
      // Fallback to legacy cache
      await this.cacheService.setDayContent(cacheKey, coreContent);
      this.logger.log(`✅ Day ${dayNumber} CORE generated (legacy cache)`);
    }

    this.logger.log(`✅ Day ${dayNumber} CORE generated. Tokens: ${aiResponse.tokensUsed}`);

    return {
      coreContent,
      tokensUsed: aiResponse.tokensUsed,
      cost: aiResponse.cost,
      fromCache: false,
      variantId,
    };
  }

  /**
   * Generate DEFERRED day content (background load)
   * Returns: practiceProject, reflection
   * Called after core loads, while user watches video
   */
  async generateDayDeferredDetails(
    curriculum: any,
    dayNumber: number,
    userTier: string = 'FREE',
  ): Promise<DayDeferredResult> {
    this.logger.log(`⏳ Generating Day ${dayNumber} DEFERRED content...`);

    const dayOverview = curriculum.days.find((d: any) => d.day === dayNumber);
    if (!dayOverview) {
      throw new BadRequestException(`Day ${dayNumber} not found in curriculum`);
    }

    // Check cache first
    const cacheKey = this.buildDayCacheKey(curriculum.metadata, dayNumber, 'deferred');
    const cached = await this.cacheService.getDayContent(cacheKey);
    if (cached) {
      this.logger.log(`📦 Day ${dayNumber} DEFERRED cache HIT`);
      return { deferredContent: cached, tokensUsed: 0, cost: 0, fromCache: true };
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
      outputType: curriculum.metadata.outputType,
      isProjectBased: curriculum.metadata.isProjectBased, // Use stored value, don't re-calculate
    };

    const { systemPrompt, userPrompt } = buildDayDetailDeferredPrompt(params);

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
    } catch (error) {
      this.logger.error(`❌ Failed to parse Day ${dayNumber} DEFERRED:`, error.message);
      throw new BadRequestException('Failed to generate deferred day content. Please try again.');
    }

    // Cache the result
    await this.cacheService.setDayContent(cacheKey, deferredContent);

    this.logger.log(`✅ Day ${dayNumber} DEFERRED generated. Tokens: ${aiResponse.tokensUsed}`);

    return {
      deferredContent,
      tokensUsed: aiResponse.tokensUsed,
      cost: aiResponse.cost,
      fromCache: false,
    };
  }

  /**
   * Build cache key for day content
   */
  private buildDayCacheKey(metadata: any, dayNumber: number, type: 'core' | 'deferred'): string {
    const parts = [
      metadata.skillName?.toLowerCase().replace(/\s+/g, '-'),
      `d${metadata.durationDays}`,
      `h${metadata.hoursPerDay}`,
      metadata.skillLevel?.toLowerCase(),
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
    this.logger.log(`🎯 Generating Boss Project for Day ${bossDay} (Phase 2)...`);

    const bossOverview = curriculum.bossProjects?.find((b: any) => b.day === bossDay);
    if (!bossOverview) {
      throw new BadRequestException(`Boss project for day ${bossDay} not found`);
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

      this.logger.log(`✅ Boss Project Day ${bossDay} details parsed successfully`);
    } catch (error) {
      this.logger.error(`❌ Failed to parse Boss Project details:`, error.message);
      throw new BadRequestException('Failed to generate boss project details. Please try again.');
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
   * Generate file resources for a single day's tasks
   */
  private async generateDayFileResources(dayContent: any, language?: string): Promise<any> {
    if (dayContent.task1?.solution) {
      try {
        const files = await this.fileGenerator.generateTaskFiles({
          taskId: dayContent.task1.id,
          taskTitle: dayContent.task1.title,
          taskDescription: dayContent.task1.description,
          answer: dayContent.task1.solution,
          language,
        });
        dayContent.task1.files = files;
      } catch (error) {
        this.logger.warn('Task 1 file generation failed');
      }
    }

    if (dayContent.practiceProject?.solution) {
      try {
        const files = await this.fileGenerator.generateTaskFiles({
          taskId: dayContent.practiceProject.id,
          taskTitle: dayContent.practiceProject.title,
          taskDescription: dayContent.practiceProject.challenge,
          answer: dayContent.practiceProject.solution,
          language,
        });
        dayContent.practiceProject.files = files;
      } catch (error) {
        this.logger.warn('Practice project file generation failed');
      }
    }

    return dayContent;
  }

  /**
   * Generate AI explanation from day content when no good video match is found.
   * Uses foundationCards if available, otherwise creates a structured summary.
   */
  private generateAiExplanation(dayContent: any, concept: string): string {
    const sections: string[] = [];

    // Use foundationCards content if available
    if (dayContent.foundationCards && Array.isArray(dayContent.foundationCards)) {
      for (const card of dayContent.foundationCards) {
        if (card.concept && card.explanation) {
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
      fallbackSections.push(`### What You'll Learn\n${dayContent.task1.description}`);
    }

    if (dayContent.task1?.steps && Array.isArray(dayContent.task1.steps)) {
      const steps = dayContent.task1.steps.slice(0, 5).map((s: any, i: number) =>
        `${i + 1}. ${typeof s === 'string' ? s : s.instruction || s.title || ''}`
      ).join('\n');
      fallbackSections.push(`### Key Steps\n${steps}`);
    }

    return fallbackSections.length > 0
      ? fallbackSections.join('\n\n')
      : `Learn about ${concept} through the practice exercises below.`;
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
    this.logger.log(`🔄 Converting task to ${targetFormat} format for Day ${dayContext.dayNumber}`);

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
      if (targetFormat === 'quiz' && task.questions && Array.isArray(task.questions)) {
        task.questions = task.questions.map((q: any, index: number) => ({
          ...q,
          id: q.id && q.id !== 'q1' ? q.id : `q-${dayContext.dayNumber}-${index}-${Date.now()}`,
        }));
      }

      // Ensure fill-blank items have unique IDs
      if (targetFormat === 'fillBlank' && task.items && Array.isArray(task.items)) {
        task.items = task.items.map((item: any, index: number) => ({
          ...item,
          id: item.id && item.id !== 'fb1' ? item.id : `fb-${dayContext.dayNumber}-${index}-${Date.now()}`,
          blanks: item.blanks?.map((blank: any, blankIndex: number) => ({
            ...blank,
            id: blank.id && blank.id !== 'b1' ? blank.id : `b-${index}-${blankIndex}`,
          })),
        }));
      }
    } catch (error) {
      this.logger.error(`❌ Failed to parse alternative task format:`, error.message);
      throw new BadRequestException('Failed to generate alternative task format');
    }

    this.logger.log(`✅ Task converted to ${targetFormat}. Tokens: ${aiResponse.tokensUsed}`);

    return {
      task,
      tokensUsed: aiResponse.tokensUsed,
      cost: aiResponse.cost,
    };
  }

  /**
   * AI Tutor chat - helps students understand concepts without giving away answers
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

    const systemPrompt = `You are a supportive AI tutor helping a student learn programming. Your role is to GUIDE, not to solve.

IMPORTANT RULES:
1. Start by guiding - don't give the complete answer immediately
2. Use the Socratic method - ask questions that lead the student to discover the answer
3. If they're stuck, give gentle hints that point them in the right direction
4. Celebrate small wins and progress
5. Be encouraging but not condescending
6. Keep responses concise (2-4 sentences usually)
7. If after 1 exchanges they still ask for the answer directly, you can give it to them - but ALWAYS explain:
   - WHY each part works (the underlying concept)
   - How they can apply this pattern to similar problems

Current context:
- Task: ${params.context.taskTitle || 'Learning task'}
- Description: ${params.context.taskDescription || 'No description provided'}
- Concept being learned: ${params.context.concept || 'Programming concept'}
${params.context.currentCode ? `- Their current code:\n\`\`\`\n${params.context.currentCode.slice(0, 500)}\n\`\`\`` : ''}

Remember: You're teaching them to fish, not giving them fish.`;

    // Build conversation for context
    let conversationContext = '';
    if (params.conversationHistory && params.conversationHistory.length > 0) {
      // Only include last 6 messages for context
      const recentHistory = params.conversationHistory.slice(-6);
      conversationContext = '\n\nRecent conversation:\n' +
        recentHistory.map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`).join('\n');
    }

    const userPrompt = `${conversationContext}

Student's question: ${params.message}

Respond helpfully as their tutor, guiding them without giving the answer directly.`;

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

    this.logger.log(`✅ Concept boost generated. Tokens: ${response.tokensUsed}`);

    return {
      boost,
      tokensUsed: response.tokensUsed,
      cost: response.cost,
    };
  }
}
