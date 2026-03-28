import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { TRANSFORMHUB_MAX_ROWS_PER_REQUEST } from '../transformhub.constants';
import { CanonicalRowDto } from './canonical-row.dto';

export class UpdateSessionDto {
  @IsArray() @IsOptional()
  @ArrayMaxSize(TRANSFORMHUB_MAX_ROWS_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => CanonicalRowDto)
  rows?: CanonicalRowDto[];
  @IsString() @IsIn(['blocked', 'review', 'ready', 'posted']) @IsOptional() status?: string;
  @IsObject() @IsOptional() preflight?: any;
  @IsObject() @IsOptional() personResult?: any;
  @IsObject() @IsOptional() householdResult?: any;
}
