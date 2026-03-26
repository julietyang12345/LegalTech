import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_organizations')
export class ThOrganization {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  normalizedName: string;

  @Column({ default: false })
  matchingGift: boolean;

  @Column({ default: false })
  workplaceGivingLink: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
