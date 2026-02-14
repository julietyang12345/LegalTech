import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, LoginTicket } from 'google-auth-library';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    const googleClientId = this.configService.get<string>('google.clientId');
    this.googleClient = new OAuth2Client(googleClientId);
  }

  async register(email: string, password: string, name?: string) {
    const user = await this.userService.create({
      email,
      password,
      fullName: name,
    });

    const payload = { email: user.email, sub: user.id, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        quotaTier: user.quotaTier,
      },
      access_token: token,
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateCredentials(email, password);

    // Check if email is verified
    if (!user.emailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    const payload = { email: user.email, sub: user.id, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        quotaTier: user.quotaTier,
      },
      access_token: token,
    };
  }

  async googleLogin(idToken: string) {
    // Verify the Google ID token
    const googleClientId = this.configService.get<string>('google.clientId');
    let ticket: LoginTicket;
    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: googleClientId,
      });
    } catch (error) {
      this.logger.error('Google token verification failed:', error);
      throw new UnauthorizedException('Invalid Google credential');
    }

    const googlePayload = ticket.getPayload();
    if (!googlePayload || !googlePayload.email) {
      throw new UnauthorizedException('Invalid Google credential');
    }

    const { sub: googleId, email, name, email_verified } = googlePayload;

    if (!email_verified) {
      throw new UnauthorizedException('Google email is not verified');
    }

    // Try to find user by googleId first
    let user = await this.userService.findByGoogleId(googleId);

    if (!user) {
      // Try to find by email (link existing account)
      user = await this.userService.findByEmail(email.toLowerCase());

      if (user) {
        // Link Google account to existing user
        await this.userService.linkGoogleAccount(user.id, googleId);
        // Also verify email if not already verified
        if (!user.emailVerified) {
          await this.userService.setEmailVerified(user.id, true);
        }
      } else {
        // Create new user from Google
        user = await this.userService.createFromGoogle({
          email: email.toLowerCase(),
          name: name || email.split('@')[0],
          googleId,
        });
      }
    }

    const payload = { email: user.email, sub: user.id, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name || user.fullName,
        role: user.role,
        quotaTier: user.quotaTier,
      },
      access_token: token,
      isNewUser: !user.preferences?.learner?.completedOnboarding,
    };
  }

  async validateUser(userId: string) {
    return this.userService.findById(userId);
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.userService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await this.userService.validatePassword(
      user,
      password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Wrong password');
    }

    return user;
  }

  /**
   * Check if an email exists (for edge worker validation)
   * @param email - Email address to check
   * @param checkVerified - If true, also return verification status
   */
  async checkEmailExists(email: string, checkVerified: boolean = false) {
    const user = await this.userService.findByEmail(email);

    if (!user) {
      return { exists: false };
    }

    const result: {
      exists: boolean;
      userId?: string;
      name?: string;
      emailVerified?: boolean;
    } = {
      exists: true,
      userId: user.id,
      name: user.name || user.fullName,
    };

    if (checkVerified) {
      result.emailVerified = user.emailVerified;
    }

    return result;
  }

  /**
   * Reset password for a user (after edge token validation)
   * @param userId - User ID (validated by edge worker)
   * @param newPassword - New password (plaintext, will be hashed)
   */
  async resetPassword(userId: string, newPassword: string) {
    this.logger.log(`Resetting password for user: ${userId}`);

    // Update password
    await this.userService.updatePassword(userId, newPassword);

    // Invalidate all existing sessions (security best practice)
    await this.userService.invalidateAllSessions(userId);

    this.logger.log(`Password reset completed for user: ${userId}`);

    return { success: true };
  }

  /**
   * Verify user's email (after edge token validation)
   * @param userId - User ID (validated by edge worker)
   */
  async verifyEmail(userId: string) {
    this.logger.log(`Verifying email for user: ${userId}`);

    await this.userService.setEmailVerified(userId, true);

    this.logger.log(`Email verified for user: ${userId}`);

    return { success: true };
  }
}
