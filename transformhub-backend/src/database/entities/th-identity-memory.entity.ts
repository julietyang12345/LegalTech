import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('th_identity_memory')
export class ThIdentityMemory {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  addressLine1: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  state: string;

  @Column({ nullable: true })
  zip: string;

  @Column({ type: 'jsonb', default: [] })
  tags: string[];

  @Column({ default: 'active' })
  lifecycle: string;

  @Column({ nullable: true })
  sourcePlatform: string | null;

  @Column({ nullable: true })
  sourceFileClass: string | null;

  @Column({ type: 'jsonb', default: [] })
  fingerprints: string[];

  @Column({ nullable: true, default: 'confirmed' })
  decisionState: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastConfirmedAt: Date | null;

  @Column({ default: false })
  isSuspicious: boolean;

  @Column({ type: 'jsonb', nullable: true })
  suspiciousReasons: string[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  suspiciousLastEvaluatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
