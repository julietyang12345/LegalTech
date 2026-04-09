import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_normalized_source_row')
export class ThNormalizedSourceRow {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ nullable: true })
  rawImportId: string | null;

  @Column({ nullable: true })
  rawTableId: string | null;

  @Column()
  sourceRowRef: string;

  @Column({ nullable: true })
  sourcePlatform: string | null;

  @Column({ nullable: true })
  sourceFileClass: string | null;

  @Column({ type: 'jsonb', default: [] })
  mappedByRuleIds: string[];

  @Column({ type: 'float', default: 0 })
  mappingConfidence: number;

  @Column({ default: 'normalized' })
  status: string;

  @Column({ type: 'jsonb', default: {} })
  normalizedPayload: Record<string, unknown>;

  @Column({ nullable: true })
  canonicalPersonId: string | null;

  @Column({ nullable: true })
  canonicalHouseholdId: string | null;

  @Column({ nullable: true })
  canonicalDonationId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
