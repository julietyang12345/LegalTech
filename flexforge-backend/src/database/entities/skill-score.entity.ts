import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('skill_scores')
@Index(['userId', 'skillType', 'dimensionId'])
@Index(['userId', 'createdAt'])
export class SkillScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  skillType: string;

  @Column()
  dimensionId: string;

  @Column({ type: 'float' })
  score: number;

  @Column()
  source: string; // 'rep' | 'lesson'

  @Column({ nullable: true })
  sourceId: string;

  @Column({ nullable: true })
  skillName: string;

  @Column({ nullable: true })
  phaseId: string;

  @CreateDateColumn()
  createdAt: Date;
}
