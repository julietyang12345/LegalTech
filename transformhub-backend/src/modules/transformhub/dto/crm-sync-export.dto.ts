import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, ValidateNested } from 'class-validator';
import { TRANSFORMHUB_MAX_ROWS_PER_REQUEST } from '../transformhub.constants';
import { CanonicalRowDto } from './canonical-row.dto';

export class CrmSyncExportDto {
  @IsArray()
  @ArrayMaxSize(TRANSFORMHUB_MAX_ROWS_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => CanonicalRowDto)
  rows: CanonicalRowDto[];
  @IsArray() @IsOptional() persons?: any[];
  @IsArray() @IsOptional() households?: any[];
  @IsArray() @IsOptional() previewRecords?: any[];
}
