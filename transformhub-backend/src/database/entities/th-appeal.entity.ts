import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_appeals')
export class ThAppeal {
  @PrimaryColumn()
  id: string;

  @Column()
  canonical_code: string;

  @Column({ nullable: true })
  parent_campaign: string | null;

  @Column({ type: 'jsonb', default: [] })
  required_fields: string[];

  @Column({ default: true })
  active_flag: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
