import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import {
  SessionStatus,
  SessionMode,
} from '../../../database/entities/session.entity';

export class UpdateSessionDto {
  @IsEnum(SessionStatus)
  @IsOptional()
  status?: SessionStatus;

  @IsEnum(SessionMode)
  @IsOptional()
  mode?: SessionMode;

  @IsInt()
  @Min(1)
  @IsOptional()
  currentDay?: number;
}