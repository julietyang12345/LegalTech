import { IsString, IsOptional, IsArray, IsUrl } from 'class-validator';

export class UpdateProjectDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

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
