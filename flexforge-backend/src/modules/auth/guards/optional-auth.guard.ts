import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional JWT Auth Guard
 * - If token is provided and valid: attaches user to request
 * - If no token or invalid: continues without user (no error)
 * Use this for endpoints that work for both authenticated and anonymous users
 */
@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Call the parent canActivate
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    // Don't throw error if no user - just return null
    // This allows the request to continue for anonymous users
    if (err || !user) {
      return null;
    }
    return user;
  }
}
