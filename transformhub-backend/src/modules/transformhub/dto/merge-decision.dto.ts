import { IsIn, IsOptional, IsString } from 'class-validator';

export class MergeDecisionDto {
  @IsString() sessionId: string;
  @IsString() inputRef: string;
  @IsIn(['confirmed', 'separated']) action: 'confirmed' | 'separated';
  @IsString() @IsOptional() matchedPersonId?: string;
}
