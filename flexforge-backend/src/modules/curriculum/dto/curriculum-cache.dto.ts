import { IsString, IsUUID, IsOptional, IsInt, IsNumber, IsEnum, IsArray, Min, Max } from 'class-validator';
import { SkillLevel } from '../../../database/entities/session.entity';

/**
 * DTO for generating curriculum with caching support
 * Extends the base generate request with session tracking
 */
export class GenerateCurriculumWithCacheDto {
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

  @IsUUID()
  sessionId: string; // Client-generated UUID for this generation session
}

/**
 * DTO for regenerating curriculum
 * Includes the previous variant ID to record the negative signal
 */
export class RegenerateCurriculumDto {
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

  @IsUUID()
  sessionId: string;

  @IsUUID()
  previousVariantId: string; // The variant being rejected
}

/**
 * DTO for recording day 1 completion (positive signal)
 */
export class RecordCompletionDto {
  @IsUUID()
  variantId: string;

  @IsUUID()
  sessionId: string;
}

/**
 * DTO for recording bounce (negative signal - user left quickly)
 */
export class RecordBounceDto {
  @IsUUID()
  variantId: string;

  @IsUUID()
  sessionId: string;
}

/**
 * DTO for recording regeneration signal (user clicked "Generate New")
 * Just records the signal - does NOT generate new curriculum
 */
export class RecordRegenerationDto {
  @IsUUID()
  previousVariantId: string;

  @IsUUID()
  sessionId: string;
}

/**
 * DTO for refreshing video for a specific day
 * Used when user clicks "Find New Video" after exhausting alternatives
 */
export class RefreshVideoDto {
  @IsUUID()
  sessionId: string;

  @IsInt()
  @Min(1)
  dayNumber: number;

  @IsString()
  concept: string; // The topic/concept to search for

  @IsEnum(SkillLevel)
  skillLevel: SkillLevel;

  @IsOptional()
  @IsString({ each: true })
  excludeVideoIds?: string[]; // Video IDs to exclude from search
}

/**
 * DTO for generating full day content
 * Called when user clicks "Start Learning" on a day
 */
export class GenerateDayDetailsDto {
  @IsUUID()
  sessionId: string;

  @IsInt()
  @Min(1)
  dayNumber: number;

  // The full curriculum object (skeleton) is passed from frontend
  // This allows stateless backend - no need to store curriculum between requests
  curriculum: any;
}

/**
 * DTO for getting transcript summary for a video
 * PRO feature only
 */
export class GetTranscriptSummaryDto {
  @IsString()
  videoId: string;

  @IsOptional()
  @IsString()
  concept?: string; // Optional context for better summary
}

/**
 * Response for curriculum generation with cache info
 */
export interface CurriculumCacheResponse {
  message: string;
  curriculum: any;
  variantId: string;
  fromCache: boolean;
  metadata?: {
    tokensUsed?: number;
    cost?: number;
    cacheHit?: boolean;
  };
  warnings?: string[];
}
