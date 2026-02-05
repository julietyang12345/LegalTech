import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ContactService } from './contact.service';
import { ContactDto } from './dto/contact.dto';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 submissions per minute
  async submitContact(
    @Body() dto: ContactDto,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    // Get IP address for rate limiting tracking
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.headers['x-real-ip'] as string ||
      req.ip;

    await this.contactService.submitContact(dto, ipAddress);

    return {
      success: true,
      message: 'Thank you for your message. We will get back to you soon.',
    };
  }
}
