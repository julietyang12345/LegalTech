import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { IsEmail, IsString, MinLength, Matches } from 'class-validator';
import { EdgeSignatureGuard } from './guards/edge-signature.guard';
import { ResetPasswordDto, CheckEmailExistsDto } from './dto/password-reset.dto';

// Extend Express Request to include edge-related properties
interface EdgeRequest extends Request {
  edgeUserId?: string;
  edgePayload?: Record<string, unknown>;
}

class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @IsString()
  name?: string;
}

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  private isProduction(): boolean {
    const nodeEnv =
      this.configService.get('NODE_ENV') || this.configService.get('nodeEnv');
    return nodeEnv !== 'development' && nodeEnv !== 'test';
  }

  private setAuthCookie(res: Response, token: string) {
    const isProduction = this.isProduction();

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      domain: isProduction ? '.flexforge.ai' : undefined,
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      path: '/',
    });
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(
      dto.email,
      dto.password,
      dto.name,
    );

    this.setAuthCookie(res, result.access_token);

    return {
      message: 'Registration successful',
      user: result.user,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto.email, dto.password);
    this.setAuthCookie(res, result.access_token);

    return {
      message: 'Login successful',
      user: result.user,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    const isProduction = this.isProduction();

    res.clearCookie('access_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      domain: isProduction ? '.flexforge.ai' : undefined,
      path: '/',
    });

    return { message: 'Logout successful' };
  }

  /**
   * Check if an email exists (internal endpoint for edge worker)
   * This endpoint is called by the edge worker to validate email before
   * generating password reset or verification tokens
   */
  @Post('check-email-exists')
  @HttpCode(HttpStatus.OK)
  async checkEmailExists(@Body() dto: CheckEmailExistsDto) {
    return this.authService.checkEmailExists(dto.email, dto.checkVerified);
  }

  /**
   * Reset password with edge-validated token
   * The edge worker validates the reset token and signs the request
   * This endpoint only processes requests with valid edge signatures
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(EdgeSignatureGuard)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: EdgeRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.edgeUserId;

    if (!userId) {
      throw new Error('User ID not found in edge-signed request');
    }

    const result = await this.authService.resetPassword(userId, dto.newPassword);

    // Clear any existing auth cookie since we invalidated sessions
    const isProduction = this.isProduction();
    res.clearCookie('access_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      domain: isProduction ? '.flexforge.ai' : undefined,
      path: '/',
    });

    return {
      message: 'Password reset successfully. Please log in with your new password.',
      ...result,
    };
  }

  /**
   * Verify email with edge-validated token
   * The edge worker validates the verification token and signs the request
   */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(EdgeSignatureGuard)
  async verifyEmail(@Req() req: EdgeRequest) {
    const userId = req.edgeUserId;

    if (!userId) {
      throw new Error('User ID not found in edge-signed request');
    }

    const result = await this.authService.verifyEmail(userId);

    return {
      message: 'Email verified successfully. You can now log in.',
      ...result,
    };
  }
}
