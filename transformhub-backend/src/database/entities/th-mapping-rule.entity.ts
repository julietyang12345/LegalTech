import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_mapping_rule')
export class ThMappingRule {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ nullable: true })
  orgId: string | null;

  @Column({ default: 'session' })
  scope: string;

  @Column({ nullable: true })
  sourcePlatform: string | null;

  @Column({ nullable: true })
  sourceFileClass: string | null;

  @Column({ default: 'field_mapping' })
  ruleType: string;

  @Column()
  sourceKey: string;

  @Column()
  targetField: string;

  @Column({ type: 'float', default: 0 })
  confidence: number;

  @Column({ default: 'deterministic' })
  origin: string;

  @Column({ default: 'approved' })
  approvalStatus: string;

  @Column({ default: true })
  active: boolean;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
