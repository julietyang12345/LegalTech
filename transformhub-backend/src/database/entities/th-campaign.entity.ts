import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_campaigns')
export class ThCampaign {
  @PrimaryColumn()
  id: string;

  @Column()
  canonical_code: string;

  @Column({ type: 'float', default: 0 })
  total_raised: number;

  @Column({ type: 'jsonb', default: [] })
  legacy_codes: string[];

  @Column({ type: 'int', default: 1 })
  versions: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
