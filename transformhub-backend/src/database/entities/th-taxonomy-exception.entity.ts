import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('th_taxonomy_exceptions')
export class ThTaxonomyException {
  @PrimaryColumn()
  id: string;

  @Column()
  rawValue: string;

  @Column()
  type: string;

  @Column()
  sourceRowRef: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ default: 'open' })
  status: string;

  @Column({ nullable: true })
  resolvedCode: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ nullable: true })
  assignedTo: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
