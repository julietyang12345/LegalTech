import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Progress } from '../../database/entities/progress.entity';
import { Session } from '../../database/entities/session.entity';
import { User } from '../../database/entities/user.entity';
import { ProgressService } from './progress.service';
import { ProgressController } from './progress.controller';
import { AiModule } from '../ai/ai.module';
import { CompanionModule } from '../companion/companion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Progress, Session, User]),
    AiModule,
    CompanionModule,
  ],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
