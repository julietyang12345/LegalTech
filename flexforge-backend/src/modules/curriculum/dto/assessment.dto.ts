import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  MaxLength,
  Min,
} from 'class-validator';

export class GenerateAssessmentDto {
  @IsString()
  skillName: string;

  @IsOptional()
  @IsString()
  goalType?: string;

  @IsOptional()
  @IsString()
  skillLevel?: string;

  @IsOptional()
  @IsArray()
  previousGaps?: Array<{ category: string; description: string }>;
}

export class AnalyzeGapsDto {
  @IsString()
  skillName: string;

  @IsString()
  scenario: string;

  @IsString()
  @MaxLength(20000)
  userResponse: string;

  @IsOptional()
  @IsString()
  goalType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  assessmentRound?: number;
}
