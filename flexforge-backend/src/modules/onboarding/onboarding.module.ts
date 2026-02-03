import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { AiModule } from '../ai/ai.module';
import { CurriculumModule } from '../curriculum/curriculum.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AiModule,
    forwardRef(() => CurriculumModule), // For SkillDetectorService (content moderation)
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
