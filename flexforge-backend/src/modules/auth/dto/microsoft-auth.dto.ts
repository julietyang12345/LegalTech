import { IsString, MinLength } from 'class-validator';

export class MicrosoftAuthDto {
  @IsString()
  @MinLength(20)
  accessToken: string;
}

