import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SkillScore } from '../../database/entities/skill-score.entity';
import { AbilityService } from './ability.service';
import { AbilityController } from './ability.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SkillScore])],
  controllers: [AbilityController],
  providers: [AbilityService],
  exports: [AbilityService],
})
export class AbilityModule {}
