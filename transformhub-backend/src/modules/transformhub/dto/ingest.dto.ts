import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TRANSFORMHUB_MAX_BASE64_CHARS, TRANSFORMHUB_MAX_TEXT_CHARS } from '../transformhub.constants';

export class IngestDto {
  @IsString() @IsOptional() platform?: string;
  @IsString() @IsOptional() fileName?: string;
  @IsIn(['text', 'xlsx']) @IsOptional() kind?: 'text' | 'xlsx';
  @IsString() @IsOptional() @MaxLength(TRANSFORMHUB_MAX_TEXT_CHARS) contents?: string;
  @IsString() @IsOptional() @MaxLength(TRANSFORMHUB_MAX_BASE64_CHARS) contentsBase64?: string;
  @IsString() @IsOptional() sessionId?: string;
  @IsBoolean() @IsOptional() forceIngest?: boolean;
  @IsArray() @IsOptional() selectedWorkbookSheets?: string[];
}
