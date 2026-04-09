import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_raw_table')
export class ThRawTable {
  @PrimaryColumn()
  id: string;

  @Column()
  rawImportId: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column()
  tableName: string;

  @Column({ nullable: true })
  sourceSheetName: string | null;

  @Column({ nullable: true })
  tableType: string | null;

  @Column({ default: 'system' })
  classificationSource: string;

  @Column({ type: 'float', default: 0 })
  classificationConfidence: number;

  @Column({ type: 'int', default: 0 })
  rowCount: number;

  @Column({ type: 'int', default: 0 })
  columnCount: number;

  @Column({ type: 'jsonb', default: [] })
  headers: string[];

  @Column({ type: 'jsonb', nullable: true })
  preview: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
