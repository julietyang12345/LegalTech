import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSuspiciousProfileFields1760000000019 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "th_identity_memory"
        ADD COLUMN IF NOT EXISTS "isSuspicious" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "suspiciousReasons" jsonb NULL,
        ADD COLUMN IF NOT EXISTS "suspiciousLastEvaluatedAt" timestamptz NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "th_identity_memory"
        DROP COLUMN IF EXISTS "isSuspicious",
        DROP COLUMN IF EXISTS "suspiciousReasons",
        DROP COLUMN IF EXISTS "suspiciousLastEvaluatedAt";
    `);
  }
}
