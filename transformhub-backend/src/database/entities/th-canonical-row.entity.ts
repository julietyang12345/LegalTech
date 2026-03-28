import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ThTransformSession } from './th-transform-session.entity';

@Entity('th_canonical_rows')
export class ThCanonicalRow {
  @PrimaryColumn()
  id: string;

  @Column()
  sessionId: string;

  @ManyToOne(() => ThTransformSession, (session) => session.rows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session: ThTransformSession;

  @Column({ nullable: true })
  date: string;

  @Column({ nullable: true })
  entity_name: string;

  @Column({ nullable: true })
  account_code: string;

  @Column({ nullable: true })
  account_name: string;

  @Column({ nullable: true })
  debit: string;

  @Column({ nullable: true })
  credit: string;

  @Column({ default: 'USD' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  memo: string;

  @Column()
  source_platform: string;

  @Column()
  source_row_ref: string;

  @Column()
  journal_id: string;

  @Column({ type: 'float', default: 0 })
  mapping_confidence: number;

  @Column({ default: 'pending' })
  review_status: string;

  @Column({ default: true })
  needs_review: boolean;

  @Column({ type: 'text', nullable: true })
  suggested_fix: string | null;

  @Column({ nullable: true })
  qbo_account_id: string | null;

  @Column({ nullable: true })
  qbo_txn_id: string | null;

  @Column({ nullable: true })
  canonical_person_id: string | null;

  @Column({ nullable: true })
  canonical_household_id: string | null;

  @Column({ nullable: true })
  raw_fund: string | null;

  @Column({ nullable: true })
  raw_appeal: string | null;

  @Column({ nullable: true })
  taxonomy_exception_id: string | null;

  @Column({ nullable: true })
  canonical_org_id: string | null;

  @Column({ nullable: true })
  attribution_entry_id: string | null;

  @Column({ nullable: true })
  normalized_fund: string | null;

  @Column({ nullable: true })
  normalized_appeal: string | null;

  @Column({ nullable: true })
  resolution_source: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
