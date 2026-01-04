import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Session } from './session.entity';

@Entity('progress')
export class Progress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @ManyToOne(() => Session, (session) => session.progress, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session: Session;

  // Task identification
  @Column()
  dayNumber: number;

  @Column()
  taskId: string; // e.g., "day1-task1", "day1-practice", "day4-boss"

  @Column()
  taskType: string; // "task1", "practice", "boss"

  // Completion tracking
  @Column({ default: false })
  completed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  // Confidence tracking (1-5 scale)
  @Column({ type: 'int', nullable: true })
  confidenceScore: number;

  // Time tracking
  @Column({ default: 0 })
  timeSpentMinutes: number;

  // Attempts tracking
  @Column({ default: 0 })
  attempts: number;

  @Column({ default: 0 })
  hintsUsed: number;

  // Notes from reflection
  @Column({ type: 'text', nullable: true })
  notes: string;

  // Stuck detection
  @Column({ default: false })
  markedAsStuck: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastAttemptAt: Date;

  // Code submissions (if applicable)
  @Column({ type: 'text', nullable: true })
  submittedCode: string;

  @Column({ type: 'json', nullable: true })
  codeReview: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper methods
  isLowConfidence(): boolean {
    return this.confidenceScore !== null && this.confidenceScore < 3;
  }

  isHighConfidence(): boolean {
    return this.confidenceScore !== null && this.confidenceScore >= 4;
  }

  isStuck(): boolean {
    if (this.markedAsStuck) return true;

    // Auto-detect stuck: opened task 5+ times without completion
    if (this.attempts >= 5 && !this.completed) return true;

    // Auto-detect stuck: no progress for 72 hours
    if (this.lastAttemptAt) {
      const hoursSinceLastAttempt =
        (Date.now() - this.lastAttemptAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastAttempt >= 72 && !this.completed) return true;
    }

    return false;
  }
}
