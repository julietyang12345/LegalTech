import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../user/user.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

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
