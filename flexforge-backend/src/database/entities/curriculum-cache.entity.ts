import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';

// ============================================================================
// CACHE KEY - Unique combination of topic + parameters
// ============================================================================

@Entity('curriculum_cache_keys')
@Index('idx_cache_key_lookup', ['cacheKeyHash'], { where: '"is_active" = true' })
export class CurriculumCacheKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cache_key_hash', unique: true, length: 64 })
  cacheKeyHash: string;

  // Original params (aligned with GenerateCurriculumDto)
  @Column({ name: 'skill_name', length: 500 })
  skillName: string;

  @Column({ name: 'skill_name_normalized', length: 500 })
  skillNameNormalized: string;

  @Column({ name: 'duration_days' })
  durationDays: number;

  @Column({ name: 'hours_per_day', type: 'decimal', precision: 3, scale: 1 })
  hoursPerDay: number;

  @Column({ name: 'skill_level', length: 20 })
  skillLevel: string;

  // Versioning (for cache invalidation)
  @Column({ name: 'prompt_version', length: 20, default: '1.0.0' })
  promptVersion: string;

  @Column({ name: 'model_version', length: 50, default: 'claude-sonnet-4' })
  modelVersion: string;

  // Winner reference
  @Column({ name: 'winner_variant_id', type: 'uuid', nullable: true })
  winnerVariantId: string | null;

  // Stats
  @Column({ name: 'cache_hits', default: 0 })
  cacheHits: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({
    name: 'expires_at',
    type: 'timestamptz',
    default: () => "NOW() + INTERVAL '90 days'",
  })
  expiresAt: Date;

  // Relations
  @OneToMany(() => CurriculumCacheVariant, (variant) => variant.cacheKey)
  variants: CurriculumCacheVariant[];
}

// ============================================================================
// CACHE VARIANT - Different generated versions for same params
// ============================================================================

export enum QualityStatus {
  TESTING = 'testing',
  GOOD = 'good',
  BAD = 'bad',
  WINNER = 'winner',
}

@Entity('curriculum_cache_variants')
@Index('idx_variant_cache_key', ['cacheKeyId'], { where: '"is_active" = true' })
export class CurriculumCacheVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cache_key_id', type: 'uuid' })
  cacheKeyId: string;

  @ManyToOne(() => CurriculumCacheKey, (key) => key.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cache_key_id' })
  cacheKey: CurriculumCacheKey;

  // Content
  @Column({ type: 'jsonb' })
  content: Record<string, any>;

  @Column({ name: 'content_hash', length: 64 })
  contentHash: string;

  // Core metrics (regen-focused) - computed from serve logs
  @Column({ name: 'times_served', default: 0 })
  timesServed: number;

  @Column({ name: 'times_regenerated', default: 0 })
  timesRegenerated: number;

  @Column({ name: 'immediate_regens', default: 0 })
  immediateRegens: number;

  @Column({ name: 'quick_regens', default: 0 })
  quickRegens: number;

  @Column({ name: 'considered_regens', default: 0 })
  consideredRegens: number;

  // Secondary signals
  @Column({ name: 'times_completed_day1', default: 0 })
  timesCompletedDay1: number;

  @Column({ name: 'bounce_count', default: 0 })
  bounceCount: number;

  // Computed rate
  @Column({ name: 'regen_rate', type: 'decimal', precision: 5, scale: 4, nullable: true })
  regenRate: number | null;

  @Column({
    name: 'quality_status',
    type: 'enum',
    enum: QualityStatus,
    default: QualityStatus.TESTING,
  })
  qualityStatus: QualityStatus;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'generated_at' })
  generatedAt: Date;

  @Column({ name: 'last_served_at', type: 'timestamptz', nullable: true })
  lastServedAt: Date | null;
}

// ============================================================================
// SERVE LOG - Every serve tracked for analysis
// ============================================================================

export enum RegenCategory {
  IMMEDIATE = 'immediate', // < 30 sec (might be misclick)
  QUICK = 'quick',         // 30s - 2min (glanced, rejected)
  CONSIDERED = 'considered', // > 2min (read it, still rejected - WORST)
}

@Entity('curriculum_serves')
@Index('idx_serve_variant', ['variantId'])
@Index('idx_serve_session', ['sessionId'])
@Index('idx_serve_user_variant_session', ['userId', 'variantId', 'sessionId'], { unique: true })
export class CurriculumServe {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId: string;

  @ManyToOne(() => CurriculumCacheVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant: CurriculumCacheVariant;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'served_at', type: 'timestamptz', default: () => 'NOW()' })
  servedAt: Date;

  // Outcome tracking
  @Column({ default: false })
  regenerated: boolean;

  @Column({ name: 'regenerated_at', type: 'timestamptz', nullable: true })
  regeneratedAt: Date | null;

  @Column({ name: 'seconds_before_regen', nullable: true })
  secondsBeforeRegen: number | null;

  @Column({
    name: 'regen_category',
    type: 'enum',
    enum: RegenCategory,
    nullable: true,
  })
  regenCategory: RegenCategory | null;

  @Column({ name: 'completed_day1', default: false })
  completedDay1: boolean;

  @Column({ default: false })
  bounced: boolean;
}

// ============================================================================
// SKILL ALIASES - Map similar topics to canonical names
// ============================================================================

@Entity('skill_aliases')
export class SkillAlias {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 500 })
  alias: string;

  @Column({ length: 500 })
  canonical: string;
}
