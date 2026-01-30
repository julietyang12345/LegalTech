import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
  ) {}

  private async track(
    userId: string,
    action: string,
    resourceId: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    try {
      await this.auditLogRepo.save({
        userId,
        action,
        resourceType: 'session',
        resourceId,
        metadata,
      });
    } catch (error) {
      // Log but don't fail the main operation
      this.logger.warn(`Analytics tracking failed: ${error.message}`);
    }
  }

  async sessionStarted(
    userId: string,
    sessionId: string,
    skillName: string,
    dayNumber: number,
  ): Promise<void> {
    await this.track(userId, 'session_started', sessionId, {
      skill_name: skillName,
      day_number: dayNumber,
    });
    this.logger.debug(
      `📊 Tracked session_started: session=${sessionId}, skill=${skillName}, day=${dayNumber}`,
    );
  }

  async stepCompleted(
    userId: string,
    sessionId: string,
    step: string,
    dayNumber: number,
  ): Promise<void> {
    await this.track(userId, 'session_step_completed', sessionId, {
      step,
      day_number: dayNumber,
    });
    this.logger.debug(
      `📊 Tracked session_step_completed: session=${sessionId}, step=${step}, day=${dayNumber}`,
    );
  }

  async sessionCompleted(
    userId: string,
    sessionId: string,
    dayNumber: number,
  ): Promise<void> {
    await this.track(userId, 'session_completed', sessionId, {
      day_number: dayNumber,
    });
    this.logger.debug(
      `📊 Tracked session_completed: session=${sessionId}, day=${dayNumber}`,
    );
  }
}
