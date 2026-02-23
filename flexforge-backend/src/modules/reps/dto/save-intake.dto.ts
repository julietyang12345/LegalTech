import { IsString } from 'class-validator';

export class SaveIntakeDto {
  @IsString()
  background: string;

  @IsString()
  target: string;

  @IsString()
  struggle: string;
}
