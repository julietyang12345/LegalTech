import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { IsEmail, IsString, MinLength } from 'class-validator';

class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
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
  ) {
    console.log('🚀 AuthController loaded - NEW CODE v2');
  }

  private isProduction(): boolean {
    const nodeEnv =
      this.configService.get('NODE_ENV') || this.configService.get('nodeEnv');
    const isProd = nodeEnv !== 'development' && nodeEnv !== 'test';
    console.log(
      '🔧 isProduction check - NODE_ENV:',
      nodeEnv,
      '→ isProd:',
      isProd,
    );
    return isProd;
  }

  private setAuthCookie(res: Response, token: string) {
    const isProduction = this.isProduction();

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      domain: isProduction ? '.flexforge.ai' : undefined,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
    console.log('🔐 LOGIN: Starting login for', dto.email);
    const result = await this.authService.login(dto.email, dto.password);
    console.log('🔐 LOGIN: Got token, length:', result.access_token?.length);

    this.setAuthCookie(res, result.access_token);
    console.log(
      '🔐 LOGIN: Cookie set, checking headers:',
      res.getHeaders()['set-cookie'],
    );

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
}
