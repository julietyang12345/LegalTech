import { IsEmail, IsOptional, IsString, IsEnum } from 'class-validator';
import { WaitlistSource } from '../../../database/entities/waitlist.entity';

export class WaitlistSignupDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsEnum(WaitlistSource)
  source?: WaitlistSource;

  @IsOptional()
  @IsString()
  pricePreference?: string;

  @IsOptional()
  @IsString()
  utmSource?: string;

  @IsOptional()
  @IsString()
  utmMedium?: string;

  @IsOptional()
  @IsString()
  utmCampaign?: string;
}

export class UpdatePricePreferenceDto {
  @IsEmail()
  email: string;

  @IsString()
  pricePreference: string;
}
