import { IsString, IsOptional, IsArray, IsUrl, IsUUID } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  sessionId?: string;

  @IsUrl()
  @IsOptional()
  demoUrl?: string;

  @IsUrl()
  @IsOptional()
  githubUrl?: string;

  @IsUrl()
  @IsOptional()
  screenshotUrl?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skillsTags?: string[];
}
