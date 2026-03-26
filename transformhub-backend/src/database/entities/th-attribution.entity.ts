import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_attributions')
export class ThAttribution {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column({ nullable: true })
  rowId: string | null;

  @Column({ nullable: true })
  donationId: string | null;

  @Column({ nullable: true })
  personId: string | null;

  @Column({ nullable: true })
  organizationId: string | null;

  @Column({ default: 'hard_credit' })
  kind: string;

  @Column({ default: false })
  workplace: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
