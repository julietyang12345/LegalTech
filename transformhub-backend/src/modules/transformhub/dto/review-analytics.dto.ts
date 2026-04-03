import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { TRANSFORMHUB_MAX_ROWS_PER_REQUEST } from '../transformhub.constants';
import { CanonicalRowDto } from './canonical-row.dto';

export class ReviewAnalyticsDto {
  @IsArray()
  @ArrayMaxSize(TRANSFORMHUB_MAX_ROWS_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => CanonicalRowDto)
  rows: CanonicalRowDto[];

  @IsArray() @IsOptional() persons?: any[];
  @IsArray() @IsOptional() households?: any[];
  @IsArray() @IsOptional() previewRecords?: any[];
  @IsObject() @IsOptional() taxonomyState?: any;
  @IsObject() @IsOptional() finalAttributionDrafts?: Record<string, any>;
  @IsString() @IsOptional() fileClass?: string;
  @IsString() @IsOptional() sessionId?: string;
}
