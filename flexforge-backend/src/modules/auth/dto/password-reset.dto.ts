import { IsString, MinLength, Matches, IsEmail, IsOptional, IsBoolean } from 'class-validator';

/**
 * DTO for requesting a password reset email
 */
export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

/**
 * DTO for resetting password with token validation done by edge
 */
export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  newPassword: string;
}

/**
 * DTO for checking if an email exists (internal use by edge worker)
 */
export class CheckEmailExistsDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsBoolean()
  checkVerified?: boolean;
}
