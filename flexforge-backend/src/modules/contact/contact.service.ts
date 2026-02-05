import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resend } from 'resend';
import { ContactSubmission } from '../../database/entities/contact.entity';
import { ContactDto } from './dto/contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly resend: Resend | null;
  private readonly recipientEmail: string;
  private readonly fromEmail: string;

  constructor(
    @InjectRepository(ContactSubmission)
    private contactRepository: Repository<ContactSubmission>,
    private configService: ConfigService,
  ) {
    const resendApiKey = this.configService.get<string>('email.resend.apiKey');
    this.resend = resendApiKey ? new Resend(resendApiKey) : null;
    this.recipientEmail = this.configService.get<string>('email.contactRecipient') || 'juliet.y28@outlook.com';
    this.fromEmail = this.configService.get<string>('email.resend.fromEmail') || 'FlexForge <noreply@flexforge.ai>';

    if (!this.resend) {
      this.logger.warn('Resend API key not configured - contact form emails will be stored but not sent');
    }
  }

  async submitContact(dto: ContactDto, ipAddress?: string): Promise<{ success: boolean }> {
    // Save to database first
    const submission = this.contactRepository.create({
      name: dto.name,
      email: dto.email,
      message: dto.message,
      ipAddress: ipAddress || null,
      emailSent: false,
    });

    await this.contactRepository.save(submission);
    this.logger.log(`New contact submission from ${dto.name} (${dto.email})`);

    // Send email notification if Resend is configured
    if (this.resend) {
      try {
        await this.resend.emails.send({
          from: this.fromEmail,
          to: this.recipientEmail,
          subject: `[FlexForge Contact] New message from ${dto.name}`,
          html: this.buildEmailHtml(dto),
          text: this.buildEmailText(dto),
          replyTo: dto.email,
        });

        // Update submission to mark email as sent
        submission.emailSent = true;
        await this.contactRepository.save(submission);
        this.logger.log(`Contact email sent to ${this.recipientEmail}`);
      } catch (error) {
        this.logger.error(`Failed to send contact email: ${error.message}`);
        // Don't throw - the submission is saved, email sending is best-effort
      }
    }

    return { success: true };
  }

  private buildEmailHtml(dto: ContactDto): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
            .field { margin-bottom: 16px; }
            .label { font-weight: 600; color: #374151; margin-bottom: 4px; }
            .value { background: white; padding: 12px; border-radius: 6px; border: 1px solid #e5e7eb; }
            .message { white-space: pre-wrap; }
            .footer { margin-top: 20px; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">🔥 New Contact Form Submission</h2>
            </div>
            <div class="content">
              <div class="field">
                <div class="label">From:</div>
                <div class="value">${this.escapeHtml(dto.name)}</div>
              </div>
              <div class="field">
                <div class="label">Email:</div>
                <div class="value"><a href="mailto:${this.escapeHtml(dto.email)}">${this.escapeHtml(dto.email)}</a></div>
              </div>
              <div class="field">
                <div class="label">Message:</div>
                <div class="value message">${this.escapeHtml(dto.message)}</div>
              </div>
              <div class="footer">
                <p>This message was sent from the FlexForge contact form.</p>
                <p>Reply directly to this email to respond to ${this.escapeHtml(dto.name)}.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private buildEmailText(dto: ContactDto): string {
    return `
New Contact Form Submission
============================

From: ${dto.name}
Email: ${dto.email}

Message:
${dto.message}

---
This message was sent from the FlexForge contact form.
Reply directly to this email to respond to ${dto.name}.
    `.trim();
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async getSubmissions(limit = 50): Promise<ContactSubmission[]> {
    return this.contactRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
