import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaxonomySuggestionProtocol1760000000008 implements MigrationInterface {
  name = 'AddTaxonomySuggestionProtocol1760000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "ruleEvidence" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "sampleValues" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "aiSuggestion" jsonb`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "aiReviewStatus" character varying`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "aiReviewedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "aiReviewedBy" character varying`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "aiRejectedReason" text`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_taxonomy_exceptions_ai_review_status" ON "th_taxonomy_exceptions" ("aiReviewStatus")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_taxonomy_exceptions_ai_review_status"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "aiRejectedReason"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "aiReviewedBy"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "aiReviewedAt"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "aiReviewStatus"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "aiSuggestion"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "sampleValues"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "ruleEvidence"`);
  }
}
