import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_source_evidence')
export class ThSourceEvidence {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column()
  canonicalEntityType: string;

  @Column()
  canonicalEntityId: string;

  @Column({ default: 'row_link' })
  evidenceType: string;

  @Column({ nullable: true })
  normalizedRowId: string | null;

  @Column({ nullable: true })
  rawImportId: string | null;

  @Column({ nullable: true })
  rawTableId: string | null;

  @Column({ nullable: true })
  sourceRowRef: string | null;

  @Column({ nullable: true })
  fieldName: string | null;

  @Column({ type: 'text', nullable: true })
  rawValue: string | null;

  @Column({ type: 'text', nullable: true })
  normalizedValue: string | null;

  @Column({ type: 'float', default: 0 })
  confidence: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
