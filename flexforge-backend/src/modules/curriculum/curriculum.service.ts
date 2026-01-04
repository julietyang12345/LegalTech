import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService, AITask } from '../ai/ai.service';
import { GenerateCurriculumDto } from './dto/generate-curriculum.dto';
import { SkillDetectorService, SkillType } from './services/skill-detector.service';
import { GeminiVideoIndexerService } from './services/gemini-video-indexer.service';
import { FileGeneratorService } from './services/file-generator.service';
import { buildCurriculumPrompt } from './prompts/curriculum-prompt';

export interface CurriculumResult {
  curriculum: any;
  tokensUsed: number;
  cost: number;
  skillDetection: any;
  warnings?: string[];
}

@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);

  constructor(
    private aiService: AiService,
    private skillDetector: SkillDetectorService,
    private videoIndexer: GeminiVideoIndexerService,
    private fileGenerator: FileGeneratorService,
    private configService: ConfigService,
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

    // Step 3: Build curriculum prompt
    const { systemPrompt, userPrompt } = buildCurriculumPrompt({
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

    // Step 4: Generate curriculum with AI
    this.logger.log('🤖 Generating curriculum with AI...');
    const aiResponse = await this.aiService.routeRequest(
      AITask.CURRICULUM_GENERATION,
      userPrompt,
      systemPrompt,
    );

    // Step 5: Parse and validate curriculum
    let curriculum: any;
    try {
      const cleanedContent = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?$/g, '')
        .trim();
      curriculum = JSON.parse(cleanedContent);

      this.logger.log('✅ Curriculum JSON parsed successfully');
    } catch (error) {
      this.logger.error('❌ Failed to parse curriculum JSON:', error.message);
      throw new BadRequestException('Failed to generate valid curriculum');
    }

    // Step 6: Process video placeholders (if video indexing enabled)
    if (this.configService.get('features.videoIndexing')) {
      curriculum = await this.processVideoPlaceholders(curriculum, userTier);
    }

    // Step 7: Generate file resources (starter code, hints, solutions)
    if (skillDetection.skillType === SkillType.CODE || 
        skillDetection.skillType === SkillType.AI_AGENT) {
      curriculum = await this.generateFileResources(curriculum, skillDetection.suggestedLanguage);
    }

    this.logger.log(
      `✅ Curriculum generated. Tokens: ${aiResponse.tokensUsed}, Cost: $${aiResponse.cost.toFixed(4)}`,
    );

    return {
      curriculum,
      tokensUsed: aiResponse.tokensUsed,
      cost: aiResponse.cost,
      skillDetection,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Process video placeholders and find actual videos
   */
  private async processVideoPlaceholders(
    curriculum: any,
    userTier: string,
  ): Promise<any> {
    this.logger.log('🎥 Processing video placeholders...');

    const allowPaidIndexing = userTier !== 'FREE';

    for (const day of curriculum.days) {
      if (day.video?.videoPlaceholder) {
        const result = await this.videoIndexer.findBestVideoSegment(
          day.video.videoPlaceholder,
          allowPaidIndexing,
        );

        if (result.success) {
          day.video.url = result.url;
          day.video.startTime = result.startTime;
          day.video.endTime = result.endTime;
          day.video.watchInstructions = result.watchInstructions;
          day.video.keyTopics = result.keyTopics;
          day.video.verified = result.verified;

          this.logger.log(`  ✅ Day ${day.day}: Found video`);
        } else {
          this.logger.warn(`  ⚠️ Day ${day.day}: Video not found, using placeholder`);
        }

        // Remove placeholder after processing
        delete day.video.videoPlaceholder;
      }
    }

    return curriculum;
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
