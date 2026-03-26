import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('th_audit_runs')
export class ThAuditRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ type: 'jsonb' })
  findings: object[];

  @Column({ type: 'int', default: 0 })
  errorCount: number;

  @Column({ type: 'int', default: 0 })
  warningCount: number;

  @Column({ type: 'int', default: 0 })
  infoCount: number;

  @Column({ type: 'int', default: 0 })
  totalIssues: number;

  @Column({ type: 'jsonb', default: {} })
  delta: object;

  @Column({ default: '2026.03.25' })
  engineVersion: string;

  @Column({ type: 'jsonb', default: [] })
  ruleCatalog: object[];

  @CreateDateColumn()
  createdAt: Date;
}
