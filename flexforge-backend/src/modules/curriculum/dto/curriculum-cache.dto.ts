import { IsString, IsUUID, IsOptional, IsInt, IsNumber, IsEnum, Min, Max } from 'class-validator';
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
