import {
  IsBoolean,
  IsInt,
  IsString,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class UpdateProgressDto {
  @IsBoolean()
  @IsOptional()
  completed?: boolean;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  confidenceScore?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  timeSpentMinutes?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
