import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.projects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // Project details
  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ nullable: true })
  sessionId: string;

  @Column({ nullable: true })
  dayNumber: number;

  @Column({ nullable: true })
  taskType: string; // "boss", "practice", "custom"

  // Skills demonstrated
  @Column({ type: 'simple-array' })
  skills: string[];

  @Column({ type: 'simple-array', nullable: true })
  aiToolsUsed: string[];

  // Time invested
  @Column({ default: 0 })
  timeInvestedHours: number;

  // Links
  @Column({ nullable: true })
  liveUrl: string;

  @Column({ nullable: true })
  githubUrl: string;

  @Column({ nullable: true })
  videoUrl: string;

  // Assets
  @Column({ nullable: true })
  thumbnailUrl: string;

  @Column({ type: 'simple-array', nullable: true })
  screenshots: string[];

  // Write-up
  @Column({ type: 'text', nullable: true })
  writeup: string;

  @Column({ type: 'json', nullable: true })
  metadata: {
    language?: string;
    framework?: string;
    technologies?: string[];
    challenges?: string[];
    learnings?: string[];
  };

  // Engagement
  @Column({ default: 0 })
  likes: number;

  @Column({ default: 0 })
  views: number;

  @Column({ default: 0 })
  comments: number;

  // Visibility
  @Column({ default: true })
  isPublic: boolean;

  @Column({ default: false })
  isFeatured: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper methods
  getSkillTags(): string[] {
    return [...this.skills, ...(this.aiToolsUsed || [])];
  }

  hasLiveDemo(): boolean {
    return !!this.liveUrl;
  }

  hasCode(): boolean {
    return !!this.githubUrl;
  }

  isComplete(): boolean {
    return !!this.title && !!this.description && this.skills.length > 0;
  }
}
