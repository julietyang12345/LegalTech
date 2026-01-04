import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  action: string; // 'curriculum_generated', 'ai_tutor_query', 'session_created', etc.

  @Column({ nullable: true })
  resourceType: string;

  @Column('uuid', { nullable: true })
  resourceId: string;

  // AI usage tracking
  @Column({ nullable: true })
  aiModel: string;

  @Column({ nullable: true })
  tokensUsed: number;

  @Column('decimal', { precision: 10, scale: 6, nullable: true })
  costUsd: number;

  @Column('jsonb', { nullable: true })
  metadata: any;

  @Column({ type: 'inet', nullable: true })
  ipAddress: string;

  @CreateDateColumn()
  createdAt: Date;
}