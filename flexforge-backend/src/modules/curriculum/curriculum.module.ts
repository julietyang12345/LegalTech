import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurriculumService } from './curriculum.service';
import { CurriculumController } from './curriculum.controller';
import { FileGeneratorService } from './services/file-generator.service';
import { SkillDetectorService } from './services/skill-detector.service';
import { VideoMatchingService } from './services/video-matching.service';
import { CurriculumCacheService } from './services/curriculum-cache.service';
import { AiModule } from '../ai/ai.module';
import {
  CurriculumCacheKey,
  CurriculumCacheVariant,
  CurriculumServe,
  SkillAlias,
} from '../../database/entities/curriculum-cache.entity';

@Module({
  imports: [
    AiModule,
    TypeOrmModule.forFeature([
      CurriculumCacheKey,
      CurriculumCacheVariant,
      CurriculumServe,
      SkillAlias,
    ]),
  ],
  controllers: [CurriculumController],
  providers: [
    CurriculumService,
    FileGeneratorService,
    SkillDetectorService,
    VideoMatchingService,
    CurriculumCacheService,
  ],
  exports: [CurriculumService, VideoMatchingService, CurriculumCacheService],
})
export class CurriculumModule {}