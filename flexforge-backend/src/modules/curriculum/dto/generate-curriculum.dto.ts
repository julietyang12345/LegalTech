import { IsString, IsInt, IsNumber, IsEnum, IsOptional, Min, Max } from 'class-validator';
import { SkillLevel } from '../../../database/entities/session.entity';
import { OutputType } from '../types/learner-prefs.interface';

export class GenerateCurriculumDto {
  @IsString()
  skillName: string;

  @IsInt()
  @Min(1)
  @Max(30)
  durationDays: number;

  @IsNumber()
  @Min(0.5)
  @Max(8)
  hoursPerDay: number;

  @IsEnum(SkillLevel)
  skillLevel: SkillLevel;

  @IsOptional()
  @IsString()
  outputType?: OutputType;
}