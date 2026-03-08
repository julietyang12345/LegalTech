import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Session } from './session.entity';
import { Project } from './project.entity';
import { LearnerPrefs } from '../../modules/curriculum/types/learner-prefs.interface';

export enum QuotaTier {
  FREE = 'FREE',
  PRO = 'PRO',
  PREMIUM = 'PREMIUM',
  UNLIMITED = 'UNLIMITED',
}

export enum UserRole {
  MEMBER = 'MEMBER',
  ADMIN = 'ADMIN',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ nullable: true, unique: true })
  googleId: string;

  @Column({ nullable: true, unique: true })
  microsoftId: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  fullName: string;

  @Column({
    type: 'enum',
    enum: QuotaTier,
    default: QuotaTier.FREE, // Default to FREE - all users start free
  })
  quotaTier: QuotaTier;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.MEMBER,
  })
  role: UserRole;

  // Quota tracking (monthly)
  @Column({ default: 0 })
  curriculaGeneratedThisMonth: number;

  @Column({ default: 0 })
  aiTokensUsedThisMonth: number;

  @Column({ default: 0 })
  tokensUsedThisMonth: number;

  @Column({ default: 0 })
  aiTutorQuestionsThisMonth: number;

  @Column({ default: 0 })
  codeReviewsThisMonth: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  quotaResetDate: Date;

  // Daily AI usage tracking
  @Column({ default: 0 })
  aiTokensUsedToday: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  aiSpendingToday: number;

  @Column({ type: 'date', nullable: true })
  aiUsageDate: Date;

  // Feature access flags
  @Column({ default: false })
  hasStepByStepAccess: boolean;

  @Column({ default: false })
  hasCodeReviewAccess: boolean;

  @Column({ default: false })
  hasCareerPathAccess: boolean;

  // Stripe subscription
  @Column({ nullable: true })
  stripeCustomerId: string;

  @Column({ nullable: true })
  stripeSubscriptionId: string;

  @Column({ type: 'timestamp', nullable: true })
  subscriptionExpiresAt: Date;

  // Gamification
  @Column({ default: 0 })
  currentStreak: number;

  @Column({ default: 0 })
  karmaPoints: number;

  // Profile
  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  timezone: string;

  @Column({ default: false })
  emailVerified: boolean;

  // Settings & Learner Preferences
  @Column({ type: 'json', nullable: true })
  preferences: {
    notifications?: boolean;
    dailyReminders?: boolean;
    weeklyDigest?: boolean;
    theme?: 'light' | 'dark';
    learner?: LearnerPrefs; // AI-assisted onboarding preferences
    plannedSkills?: Array<{
      skill: string;
      icon: string;
      addedAt: string;
    }>; // Skills user plans to learn (shown on skill tree)
    skillComboGeneration?: {
      lastGeneratedAt: string;
      countToday: number;
    };
    // Daily usage tracking
    dailyCurriculumUsage?: {
      lastDate: string;
      count: number;
    };
    dailyAiTutorUsage?: {
      lastDate: string;
      count: number;
    };
    dailyDayCompletionUsage?: {
      lastDate: string;
      count: number;
    };
    // Security - password change timestamp for session invalidation
    passwordChangedAt?: string;
    // Reps intake context
    repsContext?: {
      background: string;
      target: string;
      struggle: string;
      updatedAt: string;
    };
  };

  // Relations
  @OneToMany(() => Session, (session) => session.user)
  sessions: Session[];

  @OneToMany(() => Project, (project) => project.user)
  projects: Project[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper methods

  /**
   * Get effective tier - admins always get UNLIMITED tier benefits
   */
  getEffectiveTier(): QuotaTier {
    if (this.role === UserRole.ADMIN) {
      return QuotaTier.UNLIMITED;
    }
    return this.quotaTier;
  }

  /**
   * Check if user is admin
   */
  isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }

  hasTierAccess(requiredTier: QuotaTier): boolean {
    const effectiveTier = this.getEffectiveTier();

    // UNLIMITED tier has access to everything
    if (effectiveTier === QuotaTier.UNLIMITED) return true;

    const tierLevels = {
      [QuotaTier.FREE]: 1,
      [QuotaTier.PRO]: 2,
      [QuotaTier.PREMIUM]: 3,
      [QuotaTier.UNLIMITED]: 4,
    };

    return tierLevels[effectiveTier] >= tierLevels[requiredTier];
  }

  getMonthlyQuotaLimits() {
    const effectiveTier = this.getEffectiveTier();

    switch (effectiveTier) {
      case QuotaTier.FREE:
        return {
          curricula: 3,
          aiTokens: 50000,
          aiTutorQuestions: 3, // 3 per day (checked daily, not monthly)
        };
      case QuotaTier.PRO:
        return {
          curricula: 30,
          aiTokens: 500000,
          aiTutorQuestions: Infinity, // Unlimited for PRO
        };
      case QuotaTier.PREMIUM:
        return {
          curricula: 100,
          aiTokens: 2000000,
          aiTutorQuestions: Infinity,
        };
      case QuotaTier.UNLIMITED:
        return {
          curricula: Infinity,
          aiTokens: Infinity,
          aiTutorQuestions: Infinity,
        };
      default:
        return {
          curricula: 3,
          aiTokens: 50000,
          aiTutorQuestions: 3,
        };
    }
  }

  /**
   * Get daily limits for regeneration and AI features
   * Curriculum generation and AI tutor are daily-limited by tier
   */
  getDailyLimits() {
    const effectiveTier = this.getEffectiveTier();

    switch (effectiveTier) {
      case QuotaTier.FREE:
        return {
          curriculumGenerations: 1, // 1 new curriculum per day
          dayContentRegens: 0, // No day content regenerations
          curriculumRegens: 0, // No curriculum regenerations
          aiTutorConversations: 2, // 3 AI tutor messages per day
          dayCompletions: 1, // 2 day completions per day
        };
      case QuotaTier.PRO:
        return {
          curriculumGenerations: 4, // 4 new curricula per day
          dayContentRegens: 4, // 4 day content regenerations per day
          curriculumRegens: 4,
          aiTutorConversations: 10, // 10 AI tutor messages per day
          dayCompletions: 3, // 4 day completions per day
        };
      case QuotaTier.PREMIUM:
        return {
          curriculumGenerations: 10, // 10 new curricula per day
          dayContentRegens: Infinity,
          curriculumRegens: Infinity,
          aiTutorConversations: Infinity, // Unlimited
          dayCompletions: Infinity, // Unlimited
        };
      case QuotaTier.UNLIMITED:
        return {
          curriculumGenerations: Infinity,
          dayContentRegens: Infinity,
          curriculumRegens: Infinity,
          aiTutorConversations: Infinity,
          dayCompletions: Infinity, // Unlimited
        };
      default:
        return {
          curriculumGenerations: 2,
          dayContentRegens: 2,
          curriculumRegens: 2,
          aiTutorConversations: 3,
          dayCompletions: 2,
        };
    }
  }

  shouldResetQuota(): boolean {
    const now = new Date();
    return now >= this.quotaResetDate;
  }

  resetQuota(): void {
    this.curriculaGeneratedThisMonth = 0;
    this.aiTokensUsedThisMonth = 0;
    this.aiTutorQuestionsThisMonth = 0;

    // Set next reset date (first day of next month)
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    nextMonth.setHours(0, 0, 0, 0);
    this.quotaResetDate = nextMonth;
  }
}
