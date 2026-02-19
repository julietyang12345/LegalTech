import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { Progress } from './progress.entity';

export enum SkillLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
}

export enum SessionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}

export enum SessionMode {
  NORMAL = 'NORMAL',
  SPRINT = 'SPRINT',
  EXTENDED = 'EXTENDED',
  PAUSED = 'PAUSED',
}

export enum GoalType {
  CURRICULUM = 'curriculum',
  INTERVIEW = 'interview',
  PROJECT = 'project',
  AI_BUILDER = 'ai_builder',
  LANGUAGE = 'language',
}

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Session configuration
  @Column()
  skillName: string;

  @Column()
  durationDays: number;

  @Column({ type: 'float' })
  hoursPerDay: number;

  @Column({
    type: 'enum',
    enum: SkillLevel,
  })
  skillLevel: SkillLevel;

  // Curriculum (AI-generated JSON)
  @Column({ type: 'jsonb' })
  curriculum: any;

  // Session state
  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.ACTIVE,
  })
  status: SessionStatus;

  @Column({
    type: 'enum',
    enum: SessionMode,
    default: SessionMode.NORMAL,
  })
  mode: SessionMode;

  @Column({ default: 1 })
  currentDay: number;

  // Dates
  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  pausedAt: Date;

  // Life Happens tracking
  @Column({ nullable: true })
  originalDuration: number;

  // Curriculum cache tracking
  @Column({ type: 'uuid', nullable: true })
  variantId: string;

  @Column({ default: false })
  fromCache: boolean;

  // User-defined improve areas for content emphasis
  @Column({ type: 'jsonb', nullable: true, default: [] })
  improvementAreas: string[];

  // User-defined areas to reduce content for
  @Column({ type: 'jsonb', nullable: true, default: [] })
  lessOfAreas: string[];

  @Column({
    type: 'enum',
    enum: GoalType,
    default: GoalType.CURRICULUM,
  })
  goalType: GoalType;

  @Column({ default: 0 })
  extensionsDays: number;

  // Gap-first learning: assessment results with rubric-based scoring
  @Column({ type: 'jsonb', nullable: true })
  gapProfile: {
    gaps: Array<{
      category: string;
      description: string;
      severity: 'high' | 'medium' | 'low';
      evidence: string;
    }>;
    strengths: Array<{
      category: string;
      description: string;
    }>;
    dimensions: Array<{
      id: string; // rubric dimension ID (e.g., 'solution_design')
      name: string;
      score: number; // 1-5
      gap?: string;
      example?: string;
    }>;
    overallScore: number;
    microLessonPoints: string[];
    detectedLevel: string;
    assessmentRound: number;
    scenario: string;
    userResponse: string;
  };

  // Marks micro-lesson sessions (gap-targeted, 3-5 days)
  @Column({ default: false })
  isGapSession: boolean;

  // Links micro-lesson session back to eventual full session
  @Column({ type: 'uuid', nullable: true })
  parentSessionId: string;

  // Relations
  @OneToMany(() => Progress, (progress) => progress.session)
  progress: Progress[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper methods
  isActive(): boolean {
    return this.status === SessionStatus.ACTIVE;
  }

  getDayProgress(dayNumber: number): any {
    return this.curriculum.days?.find((d: any) => d.day === dayNumber);
  }

  getTotalDays(): number {
    return this.curriculum.days?.length || this.durationDays;
  }

  getProgressPercentage(): number {
    const totalDays = this.getTotalDays();
    return totalDays > 0 ? (this.currentDay / totalDays) * 100 : 0;
  }

  canAdvanceDay(): boolean {
    return this.isActive() && this.currentDay < this.getTotalDays();
  }
}
