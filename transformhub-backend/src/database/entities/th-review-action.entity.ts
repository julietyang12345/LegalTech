import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('th_review_actions')
export class ThReviewAction {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ nullable: true })
  datasetId: string | null;

  @Column()
  actionType: string;

  @Column()
  entityType: string;

  @Column({ nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'float', nullable: true })
  confidence: number | null;

  @Column({ default: 'user' })
  userId: string;

  @CreateDateColumn()
  createdAt: Date;
}
