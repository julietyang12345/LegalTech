import { Test } from '@nestjs/testing';
import { CurriculumService } from '../../src/modules/curriculum/curriculum.service';
import { CurriculumModule } from '../../src/modules/curriculum/curriculum.module';
import { SkillLevel } from '../../src/database/entities/session.entity';

describe('Curriculum Generation (e2e)', () => {
  let curriculumService: CurriculumService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CurriculumModule],
    }).compile();
    
    curriculumService = moduleRef.get(CurriculumService);
  });
  
  it('should generate 4-day AI agent curriculum for FREE user', async () => {
    const result = await curriculumService.generateCurriculum(
      {
        skillName: 'AI prompt engineering',
        durationDays: 4,
        hoursPerDay: 1,
        skillLevel: SkillLevel.BEGINNER,
      },
      'FREE',
    );
    
    expect(result.curriculum.days).toHaveLength(4);
    expect(result.curriculum.days[0].activeRecall.part1).toBeDefined();
    expect(result.curriculum.days[0].activeRecall.part2.skipOnDay1).toBe(true);
    expect(result.curriculum.days[1].activeRecall.part2.skipOnDay1).toBe(false);
    expect(result.curriculum.bossProjects).toHaveLength(1);
    expect(result.curriculum.bossProjects[0].day).toBe(4);
  });
  
  it('should include adaptive difficulty for PREMIUM users', async () => {
    const result = await curriculumService.generateCurriculum(
      {
        skillName: 'Python basics',
        durationDays: 7,
        hoursPerDay: 1,
        skillLevel: SkillLevel.BEGINNER,
      },
      'PREMIUM',
    );
    
    const practiceProject = result.curriculum.days[0].practiceProject;
    expect(practiceProject.tierResources.premium.adaptiveDifficulty).toBeDefined();
  });
});