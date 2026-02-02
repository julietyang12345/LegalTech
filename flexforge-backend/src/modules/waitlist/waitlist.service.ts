import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Waitlist, WaitlistSource } from '../../database/entities/waitlist.entity';
import { WaitlistSignupDto, UpdatePricePreferenceDto } from './dto/waitlist.dto';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    @InjectRepository(Waitlist)
    private waitlistRepository: Repository<Waitlist>,
  ) {}

  async signup(
    dto: WaitlistSignupDto,
    userId?: string,
    metadata?: { userAgent?: string; referrer?: string },
  ): Promise<{ isNew: boolean; entry: Waitlist; totalCount: number }> {
    const email = dto.email.toLowerCase().trim();

    // Check if already signed up
    const existing = await this.waitlistRepository.findOne({
      where: { email },
    });

    if (existing) {
      // Update source if different (user came from a different place)
      if (dto.source && existing.source !== dto.source) {
        existing.source = dto.source;
        await this.waitlistRepository.save(existing);
      }

      const totalCount = await this.waitlistRepository.count();

      this.logger.log(`Waitlist: existing signup from ${email} (source: ${dto.source})`);

      return {
        isNew: false,
        entry: existing,
        totalCount,
      };
    }

    // Create new entry
    const entry = this.waitlistRepository.create({
      email,
      source: dto.source || WaitlistSource.FEATURE_GATE,
      pricePreference: dto.pricePreference,
      userId,
      metadata: {
        userAgent: metadata?.userAgent,
        referrer: metadata?.referrer,
        utmSource: dto.utmSource,
        utmMedium: dto.utmMedium,
        utmCampaign: dto.utmCampaign,
      },
    });

    await this.waitlistRepository.save(entry);

    const totalCount = await this.waitlistRepository.count();

    this.logger.log(`Waitlist: new signup from ${email} (source: ${dto.source}, total: ${totalCount})`);

    return {
      isNew: true,
      entry,
      totalCount,
    };
  }

  async updatePricePreference(dto: UpdatePricePreferenceDto): Promise<Waitlist | null> {
    const email = dto.email.toLowerCase().trim();

    const entry = await this.waitlistRepository.findOne({
      where: { email },
    });

    if (!entry) {
      return null;
    }

    entry.pricePreference = dto.pricePreference;
    await this.waitlistRepository.save(entry);

    this.logger.log(`Waitlist: price preference updated for ${email}: ${dto.pricePreference}`);

    return entry;
  }

  async getCount(): Promise<number> {
    return this.waitlistRepository.count();
  }

  async getStats(): Promise<{
    totalCount: number;
    bySource: Record<string, number>;
    byPricePreference: Record<string, number>;
    recentSignups: number; // Last 24 hours
  }> {
    const totalCount = await this.waitlistRepository.count();

    // Count by source
    const bySourceRaw = await this.waitlistRepository
      .createQueryBuilder('w')
      .select('w.source', 'source')
      .addSelect('COUNT(*)', 'count')
      .groupBy('w.source')
      .getRawMany();

    const bySource: Record<string, number> = {};
    bySourceRaw.forEach((row) => {
      bySource[row.source] = parseInt(row.count, 10);
    });

    // Count by price preference
    const byPriceRaw = await this.waitlistRepository
      .createQueryBuilder('w')
      .select('w.pricePreference', 'price')
      .addSelect('COUNT(*)', 'count')
      .where('w.pricePreference IS NOT NULL')
      .groupBy('w.pricePreference')
      .getRawMany();

    const byPricePreference: Record<string, number> = {};
    byPriceRaw.forEach((row) => {
      byPricePreference[row.price] = parseInt(row.count, 10);
    });

    // Recent signups (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const recentSignups = await this.waitlistRepository
      .createQueryBuilder('w')
      .where('w.createdAt >= :yesterday', { yesterday })
      .getCount();

    return {
      totalCount,
      bySource,
      byPricePreference,
      recentSignups,
    };
  }

  async markConverted(email: string, tier: string): Promise<void> {
    const entry = await this.waitlistRepository.findOne({
      where: { email: email.toLowerCase().trim() },
    });

    if (entry) {
      entry.convertedAt = new Date();
      entry.convertedTier = tier;
      await this.waitlistRepository.save(entry);

      this.logger.log(`Waitlist: ${email} converted to ${tier}`);
    }
  }
}
