import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User, QuotaTier } from '../../database/entities/user.entity';
import { SessionStatus } from '../../database/entities/session.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  private readonly unlimitedQuotaEmail: string | undefined;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private configService: ConfigService,
  ) {
    this.unlimitedQuotaEmail = this.configService.get<string>('UNLIMITED_QUOTA_EMAIL');
  }

  /**
   * Check if email has unlimited quota access
   */
  private hasUnlimitedAccess(email: string): boolean {
    if (!this.unlimitedQuotaEmail) return false;
    return email.toLowerCase() === this.unlimitedQuotaEmail.toLowerCase();
  }

  /**
   * Create new user
   */
  async create(userData: {
    email: string;
    password: string;
    fullName?: string;
  }): Promise<User> {
    const user = this.usersRepository.create({
      email: userData.email,
      password: userData.password,
      fullName: userData.fullName,
      quotaTier: QuotaTier.FREE,
      tokensUsedThisMonth: 0,
      curriculaGeneratedThisMonth: 0,
      codeReviewsThisMonth: 0,
      quotaResetDate: new Date(),
      hasStepByStepAccess: false,
      hasCodeReviewAccess: false,
      hasCareerPathAccess: false,
    });

    return this.usersRepository.save(user);
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations: ['sessions', 'projects'],
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
    });
  }

  /**
   * Validate user password
   */
  async validatePassword(user: User, password: string): Promise<boolean> {
    // In production, use bcrypt.compare(password, user.password)
    return user.password === password;
  }

  /**
   * Update user profile
   */
  async updateProfile(id: string, updates: Partial<User>): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    Object.assign(user, updates);
    return this.usersRepository.save(user);
  }

  /**
   * Update user
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    Object.assign(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  /**
   * Upgrade user tier
   */
  async upgradeTier(
    userId: string,
    newTier: QuotaTier,
    stripeCustomerId?: string,
    stripeSubscriptionId?: string,
  ): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.quotaTier = newTier;

    // Set feature access based on tier
    if (newTier === QuotaTier.PRO || newTier === QuotaTier.PREMIUM || newTier === QuotaTier.UNLIMITED) {
      user.hasStepByStepAccess = true;
    }

    if (newTier === QuotaTier.PREMIUM || newTier === QuotaTier.UNLIMITED) {
      user.hasCodeReviewAccess = true;
      user.hasCareerPathAccess = true;
    }

    // Set Stripe info
    if (stripeCustomerId) {
      user.stripeCustomerId = stripeCustomerId;
    }
    if (stripeSubscriptionId) {
      user.stripeSubscriptionId = stripeSubscriptionId;
      user.subscriptionExpiresAt = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ); // 30 days
    }

    return this.usersRepository.save(user);
  }

  /**
   * Downgrade user tier (e.g., subscription cancelled)
   */
  async downgradeTier(userId: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.quotaTier = QuotaTier.FREE;
    user.hasStepByStepAccess = false;
    user.hasCodeReviewAccess = false;
    user.hasCareerPathAccess = false;
    user.stripeSubscriptionId = null;
    user.subscriptionExpiresAt = null;

    return this.usersRepository.save(user);
  }

  /**
   * Check user's quota
   */
  async checkQuota(userId: string): Promise<{
    hasQuota: boolean;
    tokensRemaining: number;
    curriculaRemaining: number;
    codeReviewsRemaining: number;
    tier: QuotaTier;
  }> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if quota needs reset (monthly)
    const now = new Date();
    const quotaResetDate = new Date(user.quotaResetDate);
    const daysSinceReset = Math.floor(
      (now.getTime() - quotaResetDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceReset >= 30) {
      // Reset quota
      user.tokensUsedThisMonth = 0;
      user.curriculaGeneratedThisMonth = 0;
      user.codeReviewsThisMonth = 0;
      user.quotaResetDate = now;
      await this.usersRepository.save(user);
    }

    // UNLIMITED tier or env-configured email bypasses all quota checks
    if (user.quotaTier === QuotaTier.UNLIMITED || this.hasUnlimitedAccess(user.email)) {
      return {
        hasQuota: true,
        tokensRemaining: Infinity,
        curriculaRemaining: Infinity,
        codeReviewsRemaining: Infinity,
        tier: QuotaTier.UNLIMITED,
      };
    }

    // Quota limits based on tier
    const quotaLimits = {
      [QuotaTier.FREE]: {
        tokens: 50000,
        curricula: 3,
        codeReviews: 0,
      },
      [QuotaTier.PRO]: {
        tokens: 500000,
        curricula: 20,
        codeReviews: 0,
      },
      [QuotaTier.PREMIUM]: {
        tokens: 2000000,
        curricula: 100,
        codeReviews: 8,
      },
    };

    const limits = quotaLimits[user.quotaTier];
    const tokensRemaining = limits.tokens - user.tokensUsedThisMonth;
    const curriculaRemaining =
      limits.curricula - user.curriculaGeneratedThisMonth;
    const codeReviewsRemaining =
      limits.codeReviews - user.codeReviewsThisMonth;

    return {
      hasQuota: tokensRemaining > 0 && curriculaRemaining > 0,
      tokensRemaining: Math.max(0, tokensRemaining),
      curriculaRemaining: Math.max(0, curriculaRemaining),
      codeReviewsRemaining: Math.max(0, codeReviewsRemaining),
      tier: user.quotaTier,
    };
  }

  /**
   * Increment AI usage
   */
  async incrementUsage(
    userId: string,
    tokensUsed: number,
    curriculaGenerated: number = 0,
    codeReviews: number = 0,
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.tokensUsedThisMonth += tokensUsed;
    user.curriculaGeneratedThisMonth += curriculaGenerated;
    user.codeReviewsThisMonth += codeReviews;

    await this.usersRepository.save(user);
  }

  /**
   * Get user's stats
   */
  async getStats(userId: string): Promise<{
    totalSessions: number;
    completedSessions: number;
    activeSessions: number;
    totalProjects: number;
    tokensUsedThisMonth: number;
    curriculaGeneratedThisMonth: number;
    codeReviewsThisMonth: number;
    quotaTier: QuotaTier;
    memberSince: Date;
    currentStreak?: number;
  }> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['sessions', 'projects'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const completedSessions = user.sessions.filter(
      (session) => session.status === SessionStatus.COMPLETED,
    ).length;

    const activeSessions = user.sessions.filter(
      (session) => session.status === SessionStatus.ACTIVE,
    ).length;

    return {
      totalSessions: user.sessions.length,
      completedSessions,
      activeSessions,
      totalProjects: user.projects.length,
      tokensUsedThisMonth: user.tokensUsedThisMonth,
      curriculaGeneratedThisMonth: user.curriculaGeneratedThisMonth,
      codeReviewsThisMonth: user.codeReviewsThisMonth,
      quotaTier: user.quotaTier,
      memberSince: user.createdAt,
      currentStreak: user.currentStreak,
    };
  }

  /**
   * Get tier features (what user has access to)
   */
  async getTierFeatures(userId: string): Promise<{
    tier: QuotaTier;
    features: {
      videoTimestamps: string;
      examplesPerConcept: number;
      practiceProjects: string;
      stepByStepGuides: boolean;
      personalizedReviews: boolean;
      bossProjectAdaptation: boolean;
      codeReview: boolean;
      careerPath: boolean;
      monthlyQuota: {
        curricula: number;
        codeReviews: number;
      };
    };
    upgradeOptions?: {
      nextTier: QuotaTier;
      price: number;
      additionalFeatures: string[];
    };
  }> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const tierFeatures = {
      [QuotaTier.FREE]: {
        tier: QuotaTier.FREE,
        features: {
          videoTimestamps: 'Days 1-2 only',
          examplesPerConcept: 1,
          practiceProjects: 'Day 1 only',
          stepByStepGuides: false,
          personalizedReviews: false,
          bossProjectAdaptation: false,
          codeReview: false,
          careerPath: false,
          monthlyQuota: {
            curricula: 3,
            codeReviews: 0,
          },
        },
        upgradeOptions: {
          nextTier: QuotaTier.PRO,
          price: 15,
          additionalFeatures: [
            'All video timestamps',
            '3 examples per concept',
            'All practice projects unlocked',
            'Step-by-step guides',
            'Personalized reviews',
            '20 curricula/month',
          ],
        },
      },
      [QuotaTier.PRO]: {
        tier: QuotaTier.PRO,
        features: {
          videoTimestamps: 'All days',
          examplesPerConcept: 3,
          practiceProjects: 'All unlocked',
          stepByStepGuides: true,
          personalizedReviews: true,
          bossProjectAdaptation: false,
          codeReview: false,
          careerPath: false,
          monthlyQuota: {
            curricula: 20,
            codeReviews: 0,
          },
        },
        upgradeOptions: {
          nextTier: QuotaTier.PREMIUM,
          price: 39,
          additionalFeatures: [
            '5 examples per concept',
            'Adaptive boss projects (difficulty adjusts to you)',
            'AI code review (8/month)',
            'Weakness analysis',
            'AI-powered career path',
            '100 curricula/month',
          ],
        },
      },
      [QuotaTier.PREMIUM]: {
        tier: QuotaTier.PREMIUM,
        features: {
          videoTimestamps: 'All days (premium search)',
          examplesPerConcept: 5,
          practiceProjects: 'All unlocked',
          stepByStepGuides: true,
          personalizedReviews: true,
          bossProjectAdaptation: true,
          codeReview: true,
          careerPath: true,
          monthlyQuota: {
            curricula: 100,
            codeReviews: 8,
          },
        },
      },
      [QuotaTier.UNLIMITED]: {
        tier: QuotaTier.UNLIMITED,
        features: {
          videoTimestamps: 'All days (unlimited)',
          examplesPerConcept: 10,
          practiceProjects: 'All unlocked',
          stepByStepGuides: true,
          personalizedReviews: true,
          bossProjectAdaptation: true,
          codeReview: true,
          careerPath: true,
          monthlyQuota: {
            curricula: Infinity,
            codeReviews: Infinity,
          },
        },
      },
    };

    return tierFeatures[user.quotaTier];
  }

  /**
   * Increment daily streak
   */
  async incrementStreak(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.currentStreak = (user.currentStreak || 0) + 1;
    await this.usersRepository.save(user);
  }

  /**
   * Add karma points (for community features)
   */
  async addKarmaPoints(userId: string, points: number): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.karmaPoints = (user.karmaPoints || 0) + points;
    await this.usersRepository.save(user);
  }
}
