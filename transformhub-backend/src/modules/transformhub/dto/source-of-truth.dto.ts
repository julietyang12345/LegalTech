import { IsArray, IsObject, IsOptional } from 'class-validator';

export class SourceOfTruthDto {
  @IsArray() @IsOptional() rows?: any[];
  @IsObject() @IsOptional() axes?: any;
}
