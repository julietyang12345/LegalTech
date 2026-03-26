import { IsArray, IsOptional, IsString } from 'class-validator';

export class HouseholdResolveDto {
  @IsArray() persons: any[];
  @IsString() @IsOptional() sessionId?: string;
}
