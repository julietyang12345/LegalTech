import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { WaitlistService } from './waitlist.service';
import { WaitlistSignupDto, UpdatePricePreferenceDto } from './dto/waitlist.dto';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';

@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post('signup')
  @UseGuards(OptionalAuthGuard)
  @HttpCode(HttpStatus.OK)
  async signup(
    @Body() dto: WaitlistSignupDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.id;
    const metadata = {
      userAgent: req.headers['user-agent'],
      referrer: (req.headers['referer'] || req.headers['referrer']) as string | undefined,
    };

    const result = await this.waitlistService.signup(dto, userId, metadata);

    return {
      success: true,
      isNew: result.isNew,
      message: result.isNew
        ? "You're on the list! We'll notify you when we launch."
        : "You're already on our waitlist. We'll notify you soon!",
      position: result.totalCount,
    };
  }

  @Post('price-preference')
  @HttpCode(HttpStatus.OK)
  async updatePricePreference(@Body() dto: UpdatePricePreferenceDto) {
    const entry = await this.waitlistService.updatePricePreference(dto);

    if (!entry) {
      return {
        success: false,
        message: 'Email not found on waitlist. Please sign up first.',
      };
    }

    return {
      success: true,
      message: 'Thank you for your feedback!',
    };
  }

  @Get('count')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getCount() {
    const count = await this.waitlistService.getCount();
    return { count };
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getStats() {
    return this.waitlistService.getStats();
  }
}
