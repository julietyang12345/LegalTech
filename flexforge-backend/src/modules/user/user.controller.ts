import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  async getProfile(@Request() req) {
    const user = await this.userService.findById(req.user.id);

    // Don't send password
    const { password, ...result } = user;

    return { user: result };
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
    },
  ) {
    const user = await this.userService.updateProfile(req.user.id, {
      preferences,
    });

    return {
      message: 'Preferences updated successfully',
      preferences: user.preferences,
    };
  }
}
