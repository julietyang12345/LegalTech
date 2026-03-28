import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('th_key_synonyms')
export class ThKeySynonym {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  sourcePlatform: string | null;

  @Column({ nullable: true })
  sourceFileClass: string | null;

  @Column()
  canonicalTarget: string;

  @Column()
  rawKey: string;

  @Column()
  cleanedKey: string;

  @Column()
  strippedKey: string;

  @Column({ default: 'approved_ai' })
  source: string;

  @Column({ default: 'high' })
  confidence: string;

  @Column({ nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
