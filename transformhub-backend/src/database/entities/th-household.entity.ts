import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_households')
export class ThHousehold {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  lastName: string | null;

  @Column({ nullable: true })
  primaryMemberId: string | null;

  @Column({ type: 'text', nullable: true })
  primaryAddress: string | null;

  @Column({ default: 'formal' })
  salutation: string;

  @Column({ type: 'text', nullable: true })
  salutationText: string | null;

  @Column({ type: 'float', default: 0 })
  jointGivingTotal: number;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'jsonb', default: [] })
  memberIds: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
