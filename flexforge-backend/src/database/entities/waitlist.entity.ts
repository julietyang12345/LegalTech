import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum WaitlistSource {
  SHOWCASE_AI = 'showcase_ai',
  RATE_LIMIT = 'rate_limit',
  SETTINGS = 'settings',
  FEATURE_GATE = 'feature_gate',
  LANDING_PAGE = 'landing_page',
}

@Entity('waitlist')
export class Waitlist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index({ unique: true })
  email: string;

  @Column({
    type: 'enum',
    enum: WaitlistSource,
    default: WaitlistSource.FEATURE_GATE,
  })
  source: WaitlistSource;

  @Column({ nullable: true })
  pricePreference: string; // e.g., "$10/mo", "$15/mo", "$20/mo", "$25+/mo"

  @Column({ nullable: true })
  userId: string; // If user was logged in when signing up

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    userAgent?: string;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  };

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ default: true })
  marketingOptIn: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  convertedAt: Date; // When they became a paying customer

  @Column({ nullable: true })
  convertedTier: string; // Which tier they converted to
}
