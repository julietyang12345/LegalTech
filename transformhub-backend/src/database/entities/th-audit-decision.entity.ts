import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_audit_decisions')
export class ThAuditDecision {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ nullable: true })
  rowId: string | null;

  @Column({ nullable: true })
  inputKey: string | null;

  @Column({ nullable: true })
  matchedPersonId: string | null;

  @Column({ default: false })
  merge: boolean;

  @Column({ default: false })
  split: boolean;

  @Column({ nullable: true })
  taxonomy_map: string | null;

  @Column({ default: 'system' })
  made_by: string;

  @Column({ default: false })
  permanent: boolean;

  @Column({ default: false })
  disabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
