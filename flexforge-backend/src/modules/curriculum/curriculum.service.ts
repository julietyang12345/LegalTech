import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AiService, AITask } from '../ai/ai.service';
import { GenerateCurriculumDto } from './dto/generate-curriculum.dto';
import { SkillDetectorService, SkillType } from './services/skill-detector.service';
import { VideoMatchingService } from './services/video-matching.service';
import { FileGeneratorService } from './services/file-generator.service';
import { CurriculumCacheService } from './services/curriculum-cache.service';
import {
  buildOverviewPrompt,
  buildPreviewPrompt,
  buildDayDetailPrompt,
  buildBossDetailPrompt,
  DayDetailParams,
  BossDetailParams,
} from './prompts/curriculum-prompt';

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

export interface PreviewResult {
  preview: any; // Skeleton curriculum for all days
  tokensUsed: number;
  cost: number;
  skillDetection: any;
  warnings?: string[];
  fromCache?: boolean;
}

@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);

  constructor(
    private aiService: AiService,
    private skillDetector: SkillDetectorService,
    private videoMatcher: VideoMatchingService,
    private fileGenerator: FileGeneratorService,
    private configService: ConfigService,
    private cacheService: CurriculumCacheService,
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

    // Step 3: Build OVERVIEW prompt (Phase 1 - skeleton only)
    const { systemPrompt, userPrompt } = buildOverviewPrompt({
      skillName: dto.skillName,
      durationDays: dto.durationDays,
      hoursPerDay: dto.hoursPerDay,
      skillLevel: dto.skillLevel,
      skillType: skillDetection.skillType,
      complexity: skillDetection.complexity,
      userTier,
      suggestedLanguage: skillDetection.suggestedLanguage,
      prerequisiteSkills: skillDetection.prerequisiteSkills,
    });

    // Step 4: Generate curriculum OVERVIEW with AI (Phase 1)
    this.logger.log('🤖 Generating curriculum overview (Phase 1)...');
    const aiResponse = await this.aiService.routeRequest(
      AITask.CURRICULUM_GENERATION,
      userPrompt,
      systemPrompt,
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

    // Add metadata to curriculum
    curriculum.metadata = {
      skillName: dto.skillName,
      durationDays: dto.durationDays,
      hoursPerDay: dto.hoursPerDay,
      skillLevel: dto.skillLevel,
      skillType: skillDetection.skillType,
      complexity: skillDetection.complexity,
      suggestedLanguage: skillDetection.suggestedLanguage,
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
   * PHASE 1: Generate PREVIEW (skeleton only for all days)
   * Fast generation (~500-1000 tokens) for user to see timeline before committing
   * NO video search - that happens in Phase 2 when user clicks "Start Learning"
   */
  async generatePreview(dto: GenerateCurriculumDto): Promise<PreviewResult> {
    this.logger.log(
      `🎯 Generating curriculum PREVIEW: ${dto.skillName} (${dto.durationDays} days)`,
    );

    // Step 0: Check cache first - return cached preview if available
    const tempSessionId = crypto.randomUUID();
    const cachedResult = await this.cacheService.tryGetFromCache(dto, 'preview', tempSessionId);

    if (cachedResult) {
      this.logger.log(`📦 Preview cache HIT for "${dto.skillName}" - returning cached preview`);

      // Extract skill detection from cached metadata
      const skillDetection = {
        skillType: cachedResult.curriculum.metadata?.skillType,
        complexity: cachedResult.curriculum.metadata?.complexity,
        suggestedLanguage: cachedResult.curriculum.metadata?.suggestedLanguage,
      };

      return {
        preview: cachedResult.curriculum,
        tokensUsed: 0,
        cost: 0,
        skillDetection,
        warnings: [],
        fromCache: true,
      };
    }

    this.logger.log(`🆕 Preview cache MISS for "${dto.skillName}" - generating fresh`);

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

    // Step 3: Build PREVIEW prompt (skeleton only for ALL days)
    const { systemPrompt, userPrompt } = buildPreviewPrompt({
      skillName: dto.skillName,
      durationDays: dto.durationDays,
      hoursPerDay: dto.hoursPerDay,
      skillLevel: dto.skillLevel,
      skillType: skillDetection.skillType,
      complexity: skillDetection.complexity,
      userTier: 'FREE', // Preview doesn't need tier-specific content
      suggestedLanguage: skillDetection.suggestedLanguage,
    });

    // Step 4: Generate preview with AI (fast, skeleton only)
    this.logger.log('🤖 Generating curriculum preview (skeleton only)...');
    const aiResponse = await this.aiService.routeRequest(
      AITask.CURRICULUM_GENERATION,
      userPrompt,
      systemPrompt,
    );

    // Step 5: Parse preview response
    let preview: any;
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
        preview = JSON.parse(cleanedContent);
      } catch (parseError) {
        this.logger.warn('First parse failed, attempting to fix JSON...');
        const fixedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
        preview = JSON.parse(fixedContent);
        this.logger.log('✅ JSON fixed and parsed successfully');
      }

      this.logger.log('✅ Curriculum preview parsed successfully');
    } catch (error) {
      this.logger.error('❌ Failed to parse preview JSON:', error.message);
      throw new BadRequestException('Failed to generate curriculum preview. Please try again.');
    }

    // Step 6: Add metadata and status to all days
    preview.metadata = {
      skillName: dto.skillName,
      durationDays: dto.durationDays,
      hoursPerDay: dto.hoursPerDay,
      skillLevel: dto.skillLevel,
      skillType: skillDetection.skillType,
      complexity: skillDetection.complexity,
      suggestedLanguage: skillDetection.suggestedLanguage,
    };

    // Mark all days as skeletons (not yet loaded)
    if (preview.days) {
      preview.days = preview.days.map((day: any, index: number) => ({
        ...day,
        status: index === 0 ? 'unlockable' : 'locked',
        detailsLoaded: false,
      }));
    }

    this.logger.log(
      `✅ Preview generated. Tokens: ${aiResponse.tokensUsed}, Cost: $${aiResponse.cost.toFixed(4)}`,
    );

    // Cache the new preview for future users
    await this.cacheService.cacheNewContent(dto, preview, 'preview', tempSessionId);
    this.logger.log(`📦 Preview cached for "${dto.skillName}"`);

    return {
      preview,
      tokensUsed: aiResponse.tokensUsed,
      cost: aiResponse.cost,
      skillDetection,
      warnings: warnings.length > 0 ? warnings : undefined,
      fromCache: false,
    };
  }

  /**
   * PHASE 2: Generate full content for a specific day
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

    // Use skeleton's title + first skill as search concept
    const searchConcept = dayOverview.skills?.[0]
      ? `${dayOverview.title} ${dayOverview.skills[0]}`
      : dayOverview.title;

    // Decide video search based on videoStrategy (AI-decided)
    let videoSearchPromise: Promise<any> | null = null;

    if (videoStrategy === 'skip') {
      // AI decided video adds no value for this topic
      this.logger.log(`📝 Skipping video search for Day ${dayNumber} (videoStrategy: skip)`);
    } else if (videoStrategy === 'optional' || contentSource === 'university') {
      // Optional or university: search but prefer trusted educational channels
      this.logger.log(`🎓 Starting educational video search for: "${searchConcept}"`);
      videoSearchPromise = this.videoMatcher.findBestVideo({
        concept: `${searchConcept} lecture tutorial MIT Stanford freeCodeCamp`,
        userSlot: videoStrategy === 'optional' ? 6 : 10,
        userLevel: levelMap[curriculum.metadata.skillLevel] || 'beginner',
        skillType: curriculum.metadata.skillType,
      }, { deepVerify: true }).catch(error => {
        this.logger.warn(`⚠️ Educational video search failed: ${error.message}`);
        return null;
      });
    } else {
      // helpful or recommended: standard video search
      this.logger.log(`🎥 Starting video search for: "${searchConcept}"`);
      videoSearchPromise = this.videoMatcher.findBestVideo({
        concept: searchConcept,
        userSlot: 6,
        userLevel: levelMap[curriculum.metadata.skillLevel] || 'beginner',
        skillType: curriculum.metadata.skillType,
      }, { deepVerify: true }).catch(error => {
        this.logger.warn(`⚠️ Video search failed: ${error.message}`);
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
      complexity: curriculum.metadata.complexity,
      userTier,
      hoursPerDay: curriculum.metadata.hoursPerDay,
      suggestedLanguage: curriculum.metadata.suggestedLanguage,
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
    } catch (error) {
      this.logger.error(`❌ Failed to parse Day ${dayNumber} details:`, error.message);
      throw new BadRequestException('Failed to generate day details. Please try again.');
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

    // Await video search result (should be done or almost done by now)
    // videoSearchPromise is null if contentSource is 'text' or 'docs'
    const videoResult = videoSearchPromise ? await videoSearchPromise : null;

    // Merge strategy metadata into dayContent for frontend
    dayContent.contentLayer = contentLayer;
    dayContent.videoStrategy = videoStrategy;
    dayContent.transferability = transferability;
    dayContent.contentSource = contentSource;

    if (dayContent.video && videoResult?.success && videoResult.video) {
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
          ? this.secondsToTime(alt.watchPlan.primarySegment.startSeconds)
          : undefined,
        endTime: alt.watchPlan?.primarySegment
          ? this.secondsToTime(alt.watchPlan.primarySegment.endSeconds)
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
        url: `https://www.youtube.com/watch?v=${video.videoId}`,
        videoId: video.videoId,
        title: video.title,
        channelName: video.channelName,
        duration: video.duration,
        startTime: watchPlan?.primarySegment ? this.secondsToTime(watchPlan.primarySegment.startSeconds) : undefined,
        endTime: watchPlan?.primarySegment ? this.secondsToTime(watchPlan.primarySegment.endSeconds) : undefined,
        watchInstructions: watchPlan?.primarySegment?.description || `Watch this video to learn about ${dayContent.title}`,
        keyTopics: watchPlan?.keyTopics?.length ? watchPlan.keyTopics : dayContent.video.watchPoints,
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
      };
      this.logger.log(`✅ Day ${dayNumber} video found: ${video.title} (${videoResult.matchPercent}% match)${alternatives.length > 0 ? ` + ${alternatives.length} alternatives` : ''}`);
    } else if (dayContent.video && videoResult && !videoResult.success) {
      this.logger.warn(`⚠️ Day ${dayNumber} video not found: ${videoResult.error}`);
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
   * Convert seconds to MM:SS format
   */
  private secondsToTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Generate starter code, hints, and solution files
   */
  private async generateFileResources(
    curriculum: any,
    language?: string,
  ): Promise<any> {
    this.logger.log('📦 Generating file resources...');

    for (const day of curriculum.days) {
      // Generate files for task1
      if (day.task1?.answer) {
        try {
          const files = await this.fileGenerator.generateTaskFiles({
            taskId: day.task1.id,
            taskTitle: day.task1.title,
            taskDescription: day.task1.description,
            answer: day.task1.answer,
            language,
          });

          day.task1.files = files;
          this.logger.log(`  ✅ Day ${day.day} Task 1: Files generated`);
        } catch (error) {
          this.logger.warn(`  ⚠️ Day ${day.day} Task 1: File generation failed`);
        }
      }

      // Generate files for practice project
      if (day.practiceProject?.answer) {
        try {
          const files = await this.fileGenerator.generateTaskFiles({
            taskId: day.practiceProject.id,
            taskTitle: day.practiceProject.title,
            taskDescription: day.practiceProject.coreChallenge,
            answer: day.practiceProject.answer,
            language,
          });

          day.practiceProject.files = files;
          this.logger.log(`  ✅ Day ${day.day} Practice: Files generated`);
        } catch (error) {
          this.logger.warn(`  ⚠️ Day ${day.day} Practice: File generation failed`);
        }
      }
    }

    // Generate files for boss projects
    if (curriculum.bossProjects) {
      for (const boss of curriculum.bossProjects) {
        if (boss.answer) {
          try {
            const files = await this.fileGenerator.generateBossProjectFiles({
              projectId: `boss-day${boss.day}`,
              title: boss.title,
              requirements: boss.free.requirements || [],
              answer: boss.answer,
              dayNumber: boss.day,
              language,
            });

            boss.files = files;
            this.logger.log(`  ✅ Boss Project Day ${boss.day}: Files generated`);
          } catch (error) {
            this.logger.warn(`  ⚠️ Boss Project Day ${boss.day}: File generation failed`);
          }
        }
      }
    }

    return curriculum;
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
}
