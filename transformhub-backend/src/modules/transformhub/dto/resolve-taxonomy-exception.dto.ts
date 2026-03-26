import { IsOptional, IsString } from 'class-validator';

export class ResolveTaxonomyExceptionDto {
  @IsString()
  resolvedCode: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  assignedTo?: string;
}
