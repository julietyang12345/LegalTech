import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('th_taxonomy_exceptions')
export class ThTaxonomyException {
  @PrimaryColumn()
  id: string;

  @Column()
  rawValue: string;

  @Column()
  normalizedRawValue: string;

  @Column()
  type: string;

  @Column()
  sourceRowRef: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ default: 'open' })
  status: string;

  @Column({ nullable: true })
  resolvedCode: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ nullable: true })
  assignedTo: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ default: false })
  aiSuggested: boolean;

  @Column({ type: 'text', nullable: true })
  aiReasoning: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  ruleEvidence: Array<Record<string, any>>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  sampleValues: string[];

  @Column({ type: 'jsonb', nullable: true })
  aiSuggestion: Record<string, any> | null;

  @Column({ nullable: true })
  aiReviewStatus: string | null;

  @Column({ type: 'timestamp', nullable: true })
  aiReviewedAt: Date | null;

  @Column({ nullable: true })
  aiReviewedBy: string | null;

  @Column({ type: 'text', nullable: true })
  aiRejectedReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
