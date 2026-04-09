import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_raw_import')
export class ThRawImport {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ nullable: true })
  datasetId: string | null;

  @Column()
  platform: string;

  @Column()
  fileName: string;

  @Column({ nullable: true })
  kind: string | null;

  @Column({ nullable: true })
  sourceSheetName: string | null;

  @Column({ nullable: true })
  fingerprint: string | null;

  @Column({ type: 'int', default: 0 })
  rowCount: number;

  @Column({ default: 'ingested' })
  status: string;

  @Column({ type: 'jsonb', default: {} })
  rawPayload: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  structureAnalysis: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  workbookMeta: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
