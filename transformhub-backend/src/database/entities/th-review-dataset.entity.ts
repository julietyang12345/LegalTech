import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_review_datasets')
export class ThReviewDataset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  fingerprint: string;

  @Column()
  platform: string;

  @Column()
  fileClass: string;

  @Column()
  fileName: string;

  @Column({ type: 'jsonb' })
  rawParsedFile: object;

  @Column({ type: 'jsonb' })
  cleanedParsedFile: object;

  @Column({ nullable: true })
  latestSessionId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
