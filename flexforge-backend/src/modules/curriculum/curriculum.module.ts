import { Module } from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { CurriculumController } from './curriculum.controller';
import { GeminiVideoIndexerService } from './services/gemini-video-indexer.service';
import { FileGeneratorService } from './services/file-generator.service';
import { SkillDetectorService } from './services/skill-detector.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [CurriculumController],
  providers: [
    CurriculumService,
    GeminiVideoIndexerService,
    FileGeneratorService,
    SkillDetectorService,
  ],
  exports: [CurriculumService],
})
export class CurriculumModule {}