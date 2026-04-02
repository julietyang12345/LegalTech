import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { TRANSFORMHUB_MAX_ROWS_PER_REQUEST } from '../transformhub.constants';
import { CanonicalRowDto } from './canonical-row.dto';

export class EntityModelDto {
  @IsString() @IsOptional() sessionId?: string;
  @IsArray()
  @ArrayMaxSize(TRANSFORMHUB_MAX_ROWS_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => CanonicalRowDto)
  rows: CanonicalRowDto[];
  @IsArray() @IsOptional() existingPersons?: any[];
  @IsArray() @IsOptional() previewRecords?: any[];
  @IsArray() @IsOptional() households?: any[];
  @IsBoolean() @IsOptional() persist?: boolean;
}
