import { IsString, IsOptional } from 'class-validator';

export class GenerateScenariosDto {
  @IsString()
  @IsOptional()
  skillName?: string;

  @IsString()
  @IsOptional()
  topic?: string;

  @IsString()
  @IsOptional()
  sourceSessionId?: string;

  @IsString()
  @IsOptional()
  sourceConcept?: string;
}
