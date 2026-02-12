import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthService } from '../auth.service';

// Extract JWT from cookie or Authorization header (cookie takes priority)
const cookieOrHeaderExtractor = (req: Request): string | null => {
  // First try to get from HTTP-only cookie
  if (req.cookies?.access_token) {
    return req.cookies.access_token;
  }
  // Fallback to Authorization header for backwards compatibility
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: cookieOrHeaderExtractor,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  async validate(payload: any) {
    const user = await this.authService.validateUser(payload.sub);

    if (!user) {
      throw new UnauthorizedException();
    }

    // Invalidate tokens issued before password change
    const passwordChangedAt = user.preferences?.passwordChangedAt;
    if (passwordChangedAt && payload.iat) {
      const changedTimestamp = Math.floor(new Date(passwordChangedAt).getTime() / 1000);
      if (payload.iat < changedTimestamp) {
        throw new UnauthorizedException('Password was changed. Please log in again.');
      }
    }

    // Return full user object including preferences for curriculum personalization
    return user;
  }
}
