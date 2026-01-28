import { IsString, IsInt, IsNumber, IsEnum, IsOptional, IsArray, Min, Max } from 'class-validator';
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

  // From onboarding directions
  @IsOptional()
  @IsString()
  selectedDirection?: string;

  @IsOptional()
  @IsString()
  selectedDirectionOutcome?: string; // "You'll be able to..." - specific deliverable

  @IsOptional()
  @IsArray()
  directionKeywords?: string[];

  @IsOptional()
  @IsString()
  selectedLanguage?: string; // User's chosen language (overrides auto-detection)

  // Feeling-based inputs (from onboarding)
  @IsOptional()
  @IsString()
  familiarity?: 'new' | 'know_basics' | 'skilled';

  @IsOptional()
  @IsString()
  sessionLength?: 'short' | 'medium' | 'long';

  @IsOptional()
  @IsString()
  contentDepth?: 'fast' | 'medium' | 'deep';
}