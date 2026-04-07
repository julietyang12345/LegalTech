import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditDecisionSplitConfirmationCount1760000000021 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "th_audit_decisions"
        ADD COLUMN IF NOT EXISTS "splitConfirmationCount" integer NOT NULL DEFAULT 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "th_audit_decisions"
        DROP COLUMN IF EXISTS "splitConfirmationCount";
    `);
  }
}
