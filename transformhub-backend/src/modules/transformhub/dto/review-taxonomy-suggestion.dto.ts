import { IsIn, IsOptional, IsString } from 'class-validator';

export class ReviewTaxonomySuggestionDto {
  @IsString()
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsString()
  @IsOptional()
  resolvedCode?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsString()
  @IsOptional()
  reviewedBy?: string;
}
