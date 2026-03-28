import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReviewFieldSuggestionDto {
  @IsString()
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsString()
  @IsOptional()
  reviewedBy?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
