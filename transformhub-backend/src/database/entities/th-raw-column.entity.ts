import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_raw_column')
export class ThRawColumn {
  @PrimaryColumn()
  id: string;

  @Column()
  rawImportId: string;

  @Column()
  rawTableId: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ type: 'int' })
  position: number;

  @Column()
  rawName: string;

  @Column({ nullable: true })
  normalizedKey: string | null;

  @Column({ nullable: true })
  inferredType: string | null;

  @Column({ type: 'float', default: 0 })
  nullRatio: number;

  @Column({ type: 'jsonb', default: [] })
  sampleValues: string[];

  @Column({ type: 'jsonb', default: {} })
  profile: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
