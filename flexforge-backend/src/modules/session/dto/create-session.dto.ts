import {
  IsString,
  IsInt,
  IsNumber,
  IsEnum,
  IsOptional,
  IsObject,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { SkillLevel, GoalType } from '../../../database/entities/session.entity';

/** Shape of the gap profile passed from assessment → session creation */
export interface GapProfileDto {
  gaps: Array<{
    category: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    evidence: string;
  }>;
  strengths: Array<{
    category: string;
    description: string;
  }>;
  dimensions: Array<{
    id: string;
    name: string;
    score: number;
    gap?: string;
    example?: string;
  }>;
  overallScore: number;
  microLessonPoints: string[];
  detectedLevel: string;
  assessmentRound: number;
  scenario: string;
  userResponse: string;
}

export class CreateSessionDto {
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
  @IsObject()
  previewCurriculum?: any; // Preview curriculum to reuse (avoids regeneration)

  @IsOptional()
  @IsEnum(GoalType)
  goalType?: GoalType;

  // Gap-first learning: assessment results to inject into curriculum generation
  @IsOptional()
  @IsObject()
  gapProfile?: GapProfileDto;

  // When true, generates short micro-curriculum targeting specific gaps
  @IsOptional()
  @IsBoolean()
  microLessonMode?: boolean;
}
