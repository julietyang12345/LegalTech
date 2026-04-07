import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ReviewQueueItemStatus = 'pending' | 'approved' | 'kept_separate';

@Entity('th_review_queue_items')
export class ThReviewQueueItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  inputKey: string | null;

  @Column({ nullable: true })
  candidatePersonId: string | null;

  @Column({ type: 'float', default: 0 })
  score: number;

  @Column({ default: false })
  isHighConfidence: boolean;

  @Column({ default: false })
  isDriftAlert: boolean;

  @Column({ nullable: true })
  displayNameA: string | null;

  @Column({ nullable: true })
  displayNameB: string | null;

  @Column({ type: 'jsonb', nullable: true })
  evidenceFields: string[] | null;

  @Column({ default: 'pending' })
  status: ReviewQueueItemStatus;

  @Column({ nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
