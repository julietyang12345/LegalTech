import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_donations')
export class ThDonation {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ nullable: true })
  rowId: string | null;

  @Column({ type: 'float', default: 0 })
  amount: number;

  @Column({ nullable: true })
  date: string | null;

  @Column({ nullable: true })
  fund: string | null;

  @Column({ nullable: true })
  appeal: string | null;

  @Column({ default: 'direct' })
  attribution_type: string;

  @Column({ nullable: true })
  canonical_person_id: string | null;

  @Column({ nullable: true })
  canonical_household_id: string | null;

  @Column({ nullable: true })
  canonical_org_id: string | null;

  @Column({ nullable: true })
  attribution_entry_id: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
