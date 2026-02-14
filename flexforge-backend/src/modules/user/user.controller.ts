import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(
    private userService: UserService,
    private configService: ConfigService,
  ) {}

  @Get('me')
  async getProfile(@Request() req) {
    const user = await this.userService.findById(req.user.id);

    // Don't send password hash, but indicate if user has one set
    const { password, ...result } = user;

    return { user: { ...result, hasPassword: !!password } };
  }

  @Get('quota')
  async getQuota(@Request() req) {
    const quota = await this.userService.checkQuota(req.user.id);
    return { quota };
  }

  @Patch('profile')
  async updateProfile(
    @Request() req,
    @Body() updates: { name?: string; location?: string; timezone?: string },
  ) {
    const user = await this.userService.updateProfile(req.user.id, updates);
    const { password, ...result } = user;

    return {
      message: 'Profile updated successfully',
      user: result,
    };
  }

  @Patch('preferences')
  async updatePreferences(
    @Request() req,
    @Body()
    preferences: {
      notifications?: boolean;
      dailyReminders?: boolean;
      weeklyDigest?: boolean;
      theme?: 'light' | 'dark';
    },
  ) {
    // Deep-merge: preserve existing preferences (learner, plannedSkills, etc.)
    const existing = await this.userService.findById(req.user.id);
    const merged = { ...(existing.preferences || {}), ...preferences };
    const user = await this.userService.updateProfile(req.user.id, {
      preferences: merged,
    });

    return {
      message: 'Preferences updated successfully',
      preferences: user.preferences,
    };
  }

  @Patch('password')
  async changePassword(
    @Request() req,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    if (!body.currentPassword || !body.newPassword) {
      throw new BadRequestException('Current password and new password are required');
    }

    if (body.newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    const user = await this.userService.findById(req.user.id);

    if (!user.password) {
      throw new BadRequestException(
        'Cannot change password for accounts without a password. Use Google sign-in instead.',
      );
    }

    const isValid = await this.userService.validatePassword(user, body.currentPassword);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.userService.updatePassword(req.user.id, body.newPassword);
    await this.userService.invalidateAllSessions(req.user.id);

    return { message: 'Password changed successfully' };
  }

  /**
   * GET /api/v1/users/planned-skills
   * Get user's planned skills (wishlist)
   */
  @Get('planned-skills')
  async getPlannedSkills(@Request() req) {
    const plannedSkills = await this.userService.getPlannedSkills(req.user.id);
    return { plannedSkills };
  }

  /**
   * POST /api/v1/users/planned-skills
   * Add a skill to plan/wishlist
   */
  @Post('planned-skills')
  async addPlannedSkill(
    @Request() req,
    @Body() body: { skill: string; icon: string },
  ) {
    const plannedSkills = await this.userService.addPlannedSkill(
      req.user.id,
      body.skill,
      body.icon,
    );
    return {
      message: 'Skill added to plan',
      plannedSkills,
    };
  }

  /**
   * DELETE /api/v1/users/planned-skills/:skill
   * Remove a skill from plan/wishlist
   */
  @Delete('planned-skills/:skill')
  async removePlannedSkill(@Request() req, @Param('skill') skill: string) {
    const plannedSkills = await this.userService.removePlannedSkill(
      req.user.id,
      decodeURIComponent(skill),
    );
    return {
      message: 'Skill removed from plan',
      plannedSkills,
    };
  }

  /**
   * DELETE /api/v1/users/me
   * Delete user account and all associated data (GDPR compliance)
   */
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.userService.deleteAccount(req.user.id);

    // Clear auth cookie
    const isProduction =
      this.configService.get('nodeEnv') !== 'development' &&
      this.configService.get('nodeEnv') !== 'test';

    res.clearCookie('access_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      domain: isProduction ? '.flexforge.ai' : undefined,
      path: '/',
    });

    return {
      message: 'Account deleted successfully. All your data has been removed.',
    };
  }
}
