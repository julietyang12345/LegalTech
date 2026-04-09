import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_decision_log')
export class ThDecisionLog {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ nullable: true })
  rawImportId: string | null;

  @Column({ nullable: true })
  normalizedRowId: string | null;

  @Column()
  decisionType: string;

  @Column({ default: 'system' })
  decisionLevel: string;

  @Column({ default: 'auto_applied' })
  decisionMode: string;

  @Column({ default: 'applied' })
  status: string;

  @Column({ default: 'system' })
  actorType: string;

  @Column({ nullable: true })
  actorId: string | null;

  @Column({ nullable: true })
  targetType: string | null;

  @Column({ nullable: true })
  targetId: string | null;

  @Column({ type: 'float', nullable: true })
  confidence: number | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'jsonb', default: {} })
  rationale: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
