import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CurriculumService } from '../../src/modules/curriculum/curriculum.service';
import { AiService } from '../../src/modules/ai/ai.service';
import {
  SkillDetectorService,
  SkillType,
} from '../../src/modules/curriculum/services/skill-detector.service';
import { VideoMatchingService } from '../../src/modules/curriculum/services/youtube/video-matching.service';
import { FileGeneratorService } from '../../src/modules/curriculum/services/file-generator.service';
import { CurriculumCacheService } from '../../src/modules/curriculum/services/curriculum-cache.service';
import { UniversityResourceService } from '../../src/modules/curriculum/services/university/university-resource.service';
import { DocumentationFetchService } from '../../src/modules/curriculum/services/docs/documentation-fetch.service';
import { SkillLevel } from '../../src/database/entities/session.entity';

describe('Curriculum Generation (e2e)', () => {
  let curriculumService: CurriculumService;
  let aiService: jest.Mocked<AiService>;

  // Mock curriculum response that AI would return
  const mockCurriculumResponse = (durationDays: number) => ({
    content: JSON.stringify({
      finalProjectTitle: 'AI Prompt Engineering Project',
      finalProjectDescription: 'Build a complete prompt engineering toolkit',
      skillType: 'AI_AGENT',
      days: Array.from({ length: durationDays }, (_, i) => ({
        day: i + 1,
        title: `Day ${i + 1}: Learning Topic`,
        subtitle: 'Subtitle here',
        skills: ['skill1', 'skill2'],
        teaser: 'What you will learn',
        estimatedMinutes: 60,
        hasBossProject: true,
        bossMilestonePreview: 'Build a component',
        contentLayer: 'framework',
        videoStrategy: 'helpful',
        transferability: 'medium',
        contentSource: 'youtube',
      })),
      bossProjects: [
        {
          day: durationDays,
          title: 'Boss Project: AI Toolkit',
          description: 'Complete project built across all days',
          estimatedMinutes: 90,
          combinesDays: Array.from({ length: durationDays }, (_, i) => i + 1),
        },
      ],
      metadata: {
        recommendedTools: ['VSCode'],
        prerequisites: [],
        safetyLevel: 'low',
      },
    }),
    tokensUsed: 1000,
    cost: 0.01,
    provider: 'anthropic',
    model: 'claude-3-sonnet',
  });

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CurriculumService,
        {
          provide: AiService,
          useValue: {
            routeRequest: jest.fn(),
          },
        },
        {
          provide: SkillDetectorService,
          useValue: {
            detectSkillType: jest.fn().mockResolvedValue({
              skillType: SkillType.AI_AGENT,
              complexity: 'INTERMEDIATE',
              estimatedDaysNeeded: 7,
              suggestedLanguage: 'python',
              prerequisiteSkills: [],
            }),
            validateTimeframe: jest.fn().mockReturnValue({
              feasible: true,
              warning: null,
              recommendation: null,
            }),
          },
        },
        {
          provide: VideoMatchingService,
          useValue: {
            findBestVideo: jest.fn().mockResolvedValue({
              success: true,
              video: {
                videoId: 'test123',
                title: 'Test Video',
                channelName: 'Test Channel',
                duration: 600,
              },
              matchPercent: 85,
            }),
          },
        },
        {
          provide: FileGeneratorService,
          useValue: {
            generateTaskFiles: jest.fn().mockResolvedValue({
              starter: '// starter code',
              hints: '// hints',
              solution: '// solution',
            }),
            generateBossProjectFiles: jest.fn().mockResolvedValue({
              starter: '// boss starter',
              hints: '// boss hints',
              solution: '// boss solution',
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-value'),
          },
        },
        {
          provide: CurriculumCacheService,
          useValue: {
            getDayContent: jest.fn().mockResolvedValue(null),
            setDayContent: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: UniversityResourceService,
          useValue: {
            searchResources: jest.fn().mockResolvedValue({
              success: false,
              resources: [],
            }),
          },
        },
        {
          provide: DocumentationFetchService,
          useValue: {
            fetchDocumentation: jest.fn().mockResolvedValue({
              success: false,
              docs: [],
            }),
          },
        },
      ],
    }).compile();

    curriculumService = moduleRef.get<CurriculumService>(CurriculumService);
    aiService = moduleRef.get(AiService);
  });

  describe('generateCurriculum', () => {
    it('should generate 4-day curriculum with boss project on final day', async () => {
      // Setup mock AI response
      aiService.routeRequest.mockResolvedValue(mockCurriculumResponse(4));

      const result = await curriculumService.generateCurriculum(
        {
          skillName: 'AI prompt engineering',
          durationDays: 4,
          hoursPerDay: 1,
          skillLevel: SkillLevel.BEGINNER,
        },
        'FREE',
      );

      // Verify curriculum structure
      expect(result.curriculum.days).toHaveLength(4);
      expect(result.curriculum.bossProjects).toHaveLength(1);
      expect(result.curriculum.bossProjects[0].day).toBe(4);
      expect(result.curriculum.bossProjects[0].combinesDays).toEqual([
        1, 2, 3, 4,
      ]);

      // Verify each day has boss project flag
      result.curriculum.days.forEach((day: any) => {
        expect(day.hasBossProject).toBe(true);
        expect(day.bossMilestonePreview).toBeDefined();
      });

      // Verify metadata is added
      expect(result.curriculum.metadata).toBeDefined();
      expect(result.curriculum.metadata.skillName).toBe(
        'AI prompt engineering',
      );
    });

    it('should generate 7-day curriculum for PREMIUM users', async () => {
      aiService.routeRequest.mockResolvedValue(mockCurriculumResponse(7));

      const result = await curriculumService.generateCurriculum(
        {
          skillName: 'Python basics',
          durationDays: 7,
          hoursPerDay: 1,
          skillLevel: SkillLevel.BEGINNER,
        },
        'PREMIUM',
      );

      expect(result.curriculum.days).toHaveLength(7);
      expect(result.curriculum.bossProjects).toHaveLength(1);
      expect(result.curriculum.bossProjects[0].day).toBe(7);
    });

    it('should return skill detection info', async () => {
      aiService.routeRequest.mockResolvedValue(mockCurriculumResponse(4));

      const result = await curriculumService.generateCurriculum(
        {
          skillName: 'AI prompt engineering',
          durationDays: 4,
          hoursPerDay: 1,
          skillLevel: SkillLevel.BEGINNER,
        },
        'FREE',
      );

      expect(result.skillDetection).toBeDefined();
      expect(result.skillDetection.skillType).toBe(SkillType.AI_AGENT);
      expect(result.skillDetection.complexity).toBe('INTERMEDIATE');
    });

    it('should track tokens used and cost', async () => {
      aiService.routeRequest.mockResolvedValue(mockCurriculumResponse(4));

      const result = await curriculumService.generateCurriculum(
        {
          skillName: 'AI prompt engineering',
          durationDays: 4,
          hoursPerDay: 1,
          skillLevel: SkillLevel.BEGINNER,
        },
        'FREE',
      );

      expect(result.tokensUsed).toBe(1000);
      expect(result.cost).toBe(0.01);
    });
  });
});
