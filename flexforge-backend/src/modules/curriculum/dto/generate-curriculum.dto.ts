import {
  IsString,
  IsInt,
  IsNumber,
  IsEnum,
  IsOptional,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { SkillLevel, GoalType } from '../../../database/entities/session.entity';

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

  // Output type - what user wants to achieve (affects content style)
  @IsOptional()
  @IsString()
  outputType?:
    | 'learn_and_apply'
    | 'ship_project'
    | 'get_hired';

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

  // Explicit learning style choice from onboarding (overrides all other project-based logic)
  @IsOptional()
  @IsString()
  learningStyle?: 'projects' | 'practice';

  // Advanced mode: enables code writing exercises (codeCompletion) in intensive practice
  // Default: false (AI code review only)
  @IsOptional()
  codeWritingEnabled?: boolean;

  // Training mode goal type (defaults to CURRICULUM for standard learning)
  @IsOptional()
  @IsEnum(GoalType)
  goalType?: GoalType;
}
