import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKeySynonymPromotionFields1760000000014 implements MigrationInterface {
  name = 'AddKeySynonymPromotionFields1760000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_key_synonyms" ADD COLUMN IF NOT EXISTS "approvalCount" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE "th_key_synonyms" ADD COLUMN IF NOT EXISTS "promoted" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "th_key_synonyms" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_key_synonyms" DROP COLUMN IF EXISTS "lastSeenAt"`);
    await queryRunner.query(`ALTER TABLE "th_key_synonyms" DROP COLUMN IF EXISTS "promoted"`);
    await queryRunner.query(`ALTER TABLE "th_key_synonyms" DROP COLUMN IF EXISTS "approvalCount"`);
  }
}
