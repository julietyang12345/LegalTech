import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('th_source_crosswalk')
@Index(['personId'])
export class ThSourceCrosswalk {
  @PrimaryColumn()
  id: string; // `${personId}::${platform}::${fileClass}`

  @Column()
  personId: string;

  @Column()
  platform: string;

  @Column({ nullable: true })
  fileClass: string | null;

  /** Raw identifier as it appeared in the source file (e.g. "Jane Doe <jane@example.com>") */
  @Column({ nullable: true })
  rawKey: string | null;

  /** Donation total attributed to this person from this source */
  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  totalGiving: number;

  @Column({ default: 0 })
  donationCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  firstSeenAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
