import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Guard that verifies HMAC signatures from the Edge Worker
 * This ensures that sensitive operations (password reset, email verify)
 * can only be performed after proper token validation by the edge
 */
@Injectable()
export class EdgeSignatureGuard implements CanActivate {
  private readonly logger = new Logger(EdgeSignatureGuard.name);
  private readonly secret: string;
  private readonly maxAgeSeconds = 300; // 5 minutes

  constructor(private configService: ConfigService) {
    this.secret = this.configService.get<string>('EDGE_SIGNING_SECRET') || '';
    if (!this.secret) {
      this.logger.warn('EDGE_SIGNING_SECRET is not configured - edge signature validation will fail');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const signature = request.headers['x-edge-signature'];
    const timestampStr = request.headers['x-edge-timestamp'];
    const userId = request.headers['x-edge-user-id'];
    const payloadStr = request.headers['x-edge-payload'];

    if (!signature || !timestampStr || !userId) {
      this.logger.warn('Missing edge signature headers');
      throw new UnauthorizedException('Invalid request signature');
    }

    // Parse and validate timestamp
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      this.logger.warn('Invalid timestamp format');
      throw new UnauthorizedException('Invalid request signature');
    }

    const now = Math.floor(Date.now() / 1000);
    const age = now - timestamp;

    // Reject if older than maxAgeSeconds or more than 60 seconds in the future
    if (age > this.maxAgeSeconds || age < -60) {
      this.logger.warn(`Request timestamp out of range: age=${age}s`);
      throw new UnauthorizedException('Request expired');
    }

    // Parse payload
    let payload: Record<string, unknown>;
    try {
      payload = payloadStr ? JSON.parse(payloadStr) : { userId, timestamp };
    } catch {
      this.logger.warn('Invalid payload format');
      throw new UnauthorizedException('Invalid request signature');
    }

    // Verify signature
    const isValid = this.verifySignature(payload, signature);

    if (!isValid) {
      this.logger.warn('Invalid signature');
      throw new UnauthorizedException('Invalid request signature');
    }

    // SECURITY: Use userId from the SIGNED payload, not the header
    // This prevents replay attacks where attacker changes X-Edge-User-Id header
    const signedUserId = payload.userId as string;
    if (!signedUserId) {
      this.logger.warn('Missing userId in signed payload');
      throw new UnauthorizedException('Invalid request signature');
    }

    // Optionally warn if header doesn't match (indicates tampering attempt)
    if (userId && userId !== signedUserId) {
      this.logger.warn(`User ID mismatch: header=${userId}, signed=${signedUserId}`);
    }

    // Attach userId from SIGNED payload to request for use in handlers
    request.edgeUserId = signedUserId;
    request.edgePayload = payload;

    return true;
  }

  private verifySignature(
    payload: Record<string, unknown>,
    signature: string,
  ): boolean {
    if (!this.secret) {
      return false;
    }

    try {
      // Create deterministic string from payload (sorted keys)
      const sortedPayload = JSON.stringify(
        payload,
        Object.keys(payload).sort(),
      );

      // Generate expected signature
      const expectedSignature = createHmac('sha256', this.secret)
        .update(sortedPayload)
        .digest('base64');


      // Timing-safe comparison
      const signatureBuffer = Buffer.from(signature, 'base64');
      const expectedBuffer = Buffer.from(expectedSignature, 'base64');

      if (signatureBuffer.length !== expectedBuffer.length) {
        this.logger.warn(`Signature length mismatch: ${signatureBuffer.length} vs ${expectedBuffer.length}`);
        return false;
      }

      return timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch (error) {
      this.logger.error('Signature verification error:', error);
      return false;
    }
  }
}
