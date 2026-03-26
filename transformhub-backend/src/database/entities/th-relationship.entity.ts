import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_relationships')
export class ThRelationship {
  @PrimaryColumn()
  id: string;

  @Column({ nullable: true })
  sessionId: string | null;

  @Column()
  type: string;

  @Column({ nullable: true })
  personId: string | null;

  @Column({ nullable: true })
  organizationId: string | null;

  @Column({ type: 'float', default: 0 })
  confidence: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
