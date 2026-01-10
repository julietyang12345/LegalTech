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

export enum QuotaTier {
  FREE = 'FREE',
  PRO = 'PRO',
  PREMIUM = 'PREMIUM',
  UNLIMITED = 'UNLIMITED',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  fullName: string;

  @Column({
    type: 'enum',
    enum: QuotaTier,
    default: QuotaTier.FREE,
  })
  quotaTier: QuotaTier;

  // Quota tracking
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

  // Settings
  @Column({ type: 'json', nullable: true })
  preferences: {
    notifications?: boolean;
    dailyReminders?: boolean;
    weeklyDigest?: boolean;
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
  hasTierAccess(requiredTier: QuotaTier): boolean {
    // UNLIMITED tier has access to everything
    if (this.quotaTier === QuotaTier.UNLIMITED) return true;

    const tierLevels = {
      [QuotaTier.FREE]: 1,
      [QuotaTier.PRO]: 2,
      [QuotaTier.PREMIUM]: 3,
      [QuotaTier.UNLIMITED]: 4,
    };

    return tierLevels[this.quotaTier] >= tierLevels[requiredTier];
  }

  getMonthlyQuotaLimits() {
    switch (this.quotaTier) {
      case QuotaTier.FREE:
        return {
          curricula: 3,
          aiTokens: 50000,
          aiTutorQuestions: 0,
        };
      case QuotaTier.PRO:
        return {
          curricula: 20,
          aiTokens: 500000,
          aiTutorQuestions: 20,
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
          aiTutorQuestions: 0,
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
