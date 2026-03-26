import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { TRANSFORMHUB_PUBLIC_KEY } from '../decorators/public-transformhub.decorator';

@Injectable()
export class TransformHubApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(TRANSFORMHUB_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const configuredKey = this.configService.get<string>('transformhub.apiKey');
    if (!configuredKey) {
      throw new UnauthorizedException('TransformHub API key is not configured. Set TRANSFORMHUB_API_KEY.');
    }

    const authHeader = String(request.headers.authorization || '');
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const headerToken = String(request.headers['x-transformhub-api-key'] || '').trim();
    const presentedKey = bearerToken || headerToken;

    if (!presentedKey || presentedKey !== configuredKey) {
      throw new UnauthorizedException('Invalid TransformHub API key.');
    }

    return true;
  }
}
