import { IsString, IsOptional, IsNumber, IsArray, Min, Max } from 'class-validator';

export class CompleteRepDto {
  @IsString()
  @IsOptional()
  scratchPadContent?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(5)
  confidenceScore?: number;

  @IsArray()
  @IsOptional()
  tasksCompleted?: string[];
}
