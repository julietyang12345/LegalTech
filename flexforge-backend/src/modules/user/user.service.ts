import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, QuotaTier, UserRole } from '../../database/entities/user.entity';
import { SessionStatus } from '../../database/entities/session.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly adminEmails: string[];

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private configService: ConfigService,
  ) {
    // ADMIN_EMAILS can be comma-separated list: "admin@example.com,owner@example.com"
    const adminEmailsConfig =
      this.configService.get<string>('ADMIN_EMAILS') || '';
    this.adminEmails = adminEmailsConfig
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    this.logger.log(`🔐 Loaded ${this.adminEmails.length} admin email(s)`);
  }

  /**
   * Check if email is an admin
   */
  private isAdminEmail(email: string): boolean {
    return this.adminEmails.includes(email.toLowerCase());
  }

  /**
   * Create new user
   */
  async create(userData: {
    email: string;
    password: string;
    fullName?: string;
  }): Promise<User> {
    const isAdmin = this.isAdminEmail(userData.email);

    // Hash password with bcrypt (10 rounds)
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const user = this.usersRepository.create({
      email: userData.email,
      password: hashedPassword,
      fullName: userData.fullName,
      role: isAdmin ? UserRole.ADMIN : UserRole.MEMBER,
      quotaTier: QuotaTier.FREE, // All users start FREE
      tokensUsedThisMonth: 0,
      curriculaGeneratedThisMonth: 0,
      codeReviewsThisMonth: 0,
      quotaResetDate: new Date(),
      //hasStepByStepAccess: false,
      hasStepByStepAccess: true,
      hasCodeReviewAccess: false,
      hasCareerPathAccess: false,
    });

    return this.usersRepository.save(user);
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['sessions', 'projects'],
    });

    if (user && this.isAdminEmail(user.email)) {
      user.role = UserRole.ADMIN;
    }
    return user;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const user = await this.usersRepository.findOne({
      where: { email },
    });

    if (user && this.isAdminEmail(user.email)) {
      user.role = UserRole.ADMIN;
    }
    return user;
  }

  /**
   * Validate user password
   */
  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password);
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
    if (
      newTier === QuotaTier.PRO ||
      newTier === QuotaTier.PREMIUM ||
      newTier === QuotaTier.UNLIMITED
    ) {
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

    // Use effective tier (admins get UNLIMITED)
    const effectiveTier = user.getEffectiveTier();

    // UNLIMITED tier bypasses all quota checks
    if (effectiveTier === QuotaTier.UNLIMITED) {
      return {
        hasQuota: true,
        tokensRemaining: Infinity,
        curriculaRemaining: Infinity,
        codeReviewsRemaining: Infinity,
        tier: effectiveTier,
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
        curricula: 30,
        codeReviews: 0,
      },
      [QuotaTier.PREMIUM]: {
        tokens: 2000000,
        curricula: 100,
        codeReviews: 8,
      },
    };

    const limits = quotaLimits[effectiveTier];
    const tokensRemaining = limits.tokens - user.tokensUsedThisMonth;
    const curriculaRemaining =
      limits.curricula - user.curriculaGeneratedThisMonth;
    const codeReviewsRemaining = limits.codeReviews - user.codeReviewsThisMonth;

    return {
      hasQuota: tokensRemaining > 0 && curriculaRemaining > 0,
      tokensRemaining: Math.max(0, tokensRemaining),
      curriculaRemaining: Math.max(0, curriculaRemaining),
      codeReviewsRemaining: Math.max(0, codeReviewsRemaining),
      tier: effectiveTier,
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
            curricula: 30,
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

    // Use effective tier (admins get UNLIMITED features)
    return tierFeatures[user.getEffectiveTier()];
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

  /**
   * Update skill combo generation tracking
   */
  async updateSkillComboGeneration(
    userId: string,
    countToday: number,
  ): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.preferences = {
      ...user.preferences,
      skillComboGeneration: {
        lastGeneratedAt: new Date().toISOString(),
        countToday,
      },
    };

    await this.usersRepository.save(user);
  }

  /**
   * Check daily curriculum generation limit
   * Returns { allowed: boolean, remaining: number, limit: number }
   */
  async checkDailyCurriculumLimit(userId: string): Promise<{
    allowed: boolean;
    remaining: number;
    limit: number;
    used: number;
  }> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const dailyLimits = user.getDailyLimits();
    const limit = dailyLimits.curriculumGenerations;

    // Check if it's a new day
    const today = new Date().toISOString().split('T')[0];
    const dailyUsage = user.preferences?.dailyCurriculumUsage;
    const lastDate = dailyUsage?.lastDate?.split('T')[0];
    const used = lastDate === today ? (dailyUsage?.count || 0) : 0;

    const remaining = Math.max(0, limit - used);
    const allowed = limit === Infinity || used < limit;

    return { allowed, remaining, limit, used };
  }

  /**
   * Increment daily curriculum generation count
   */
  async incrementDailyCurriculumUsage(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const today = new Date().toISOString().split('T')[0];
    const dailyUsage = user.preferences?.dailyCurriculumUsage;
    const lastDate = dailyUsage?.lastDate?.split('T')[0];
    const currentCount = lastDate === today ? (dailyUsage?.count || 0) : 0;

    user.preferences = {
      ...user.preferences,
      dailyCurriculumUsage: {
        lastDate: new Date().toISOString(),
        count: currentCount + 1,
      },
    };

    await this.usersRepository.save(user);
  }

  /**
   * Check daily AI tutor message limit
   * Returns { allowed: boolean, remaining: number, limit: number }
   */
  async checkDailyAiTutorLimit(userId: string): Promise<{
    allowed: boolean;
    remaining: number;
    limit: number;
    used: number;
  }> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const dailyLimits = user.getDailyLimits();
    const limit = dailyLimits.aiTutorConversations;

    // Check if it's a new day
    const today = new Date().toISOString().split('T')[0];
    const dailyUsage = user.preferences?.dailyAiTutorUsage;
    const lastDate = dailyUsage?.lastDate?.split('T')[0];
    const used = lastDate === today ? (dailyUsage?.count || 0) : 0;

    const remaining = Math.max(0, limit - used);
    const allowed = limit === Infinity || used < limit;

    return { allowed, remaining, limit, used };
  }

  /**
   * Increment daily AI tutor message count
   */
  async incrementDailyAiTutorUsage(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const today = new Date().toISOString().split('T')[0];
    const dailyUsage = user.preferences?.dailyAiTutorUsage;
    const lastDate = dailyUsage?.lastDate?.split('T')[0];
    const currentCount = lastDate === today ? (dailyUsage?.count || 0) : 0;

    user.preferences = {
      ...user.preferences,
      dailyAiTutorUsage: {
        lastDate: new Date().toISOString(),
        count: currentCount + 1,
      },
    };

    await this.usersRepository.save(user);
  }

  /**
   * Get planned skills for a user
   */
  async getPlannedSkills(
    userId: string,
  ): Promise<Array<{ skill: string; icon: string; addedAt: string }>> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.preferences?.plannedSkills || [];
  }

  /**
   * Add a planned skill
   */
  async addPlannedSkill(
    userId: string,
    skill: string,
    icon: string,
  ): Promise<Array<{ skill: string; icon: string; addedAt: string }>> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const plannedSkills = user.preferences?.plannedSkills || [];

    // Check if skill already exists
    if (plannedSkills.some((s) => s.skill.toLowerCase() === skill.toLowerCase())) {
      return plannedSkills;
    }

    const newPlannedSkill = {
      skill,
      icon,
      addedAt: new Date().toISOString(),
    };

    user.preferences = {
      ...user.preferences,
      plannedSkills: [...plannedSkills, newPlannedSkill],
    };

    await this.usersRepository.save(user);
    return user.preferences.plannedSkills;
  }

  /**
   * Remove a planned skill
   */
  async removePlannedSkill(
    userId: string,
    skill: string,
  ): Promise<Array<{ skill: string; icon: string; addedAt: string }>> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const plannedSkills = user.preferences?.plannedSkills || [];
    const filtered = plannedSkills.filter(
      (s) => s.skill.toLowerCase() !== skill.toLowerCase(),
    );

    user.preferences = {
      ...user.preferences,
      plannedSkills: filtered,
    };

    await this.usersRepository.save(user);
    return user.preferences.plannedSkills;
  }
}
