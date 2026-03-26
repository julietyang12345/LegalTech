import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ThCanonicalRow } from './th-canonical-row.entity';

export enum TransformSessionStatus {
  REVIEW = 'review',
  READY = 'ready',
  POSTED = 'posted',
}

@Entity('th_transform_sessions')
export class ThTransformSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: TransformSessionStatus,
    default: TransformSessionStatus.REVIEW,
  })
  status: TransformSessionStatus;

  @Column()
  fileName: string;

  @Column()
  platform: string;

  @Column({ type: 'jsonb' })
  parsedFile: object;

  @Column({ type: 'jsonb' })
  schema: object;

  @Column({ type: 'jsonb' })
  guardrails: object[];

  @Column({ type: 'jsonb', nullable: true })
  preflight: object | null;

  @Column({ type: 'jsonb', default: [] })
  receipts: object[];

  @Column({ nullable: true })
  fingerprint: string;

  @OneToMany(() => ThCanonicalRow, (row) => row.session, { cascade: true })
  rows: ThCanonicalRow[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
