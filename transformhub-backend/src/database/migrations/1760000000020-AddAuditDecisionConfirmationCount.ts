import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditDecisionConfirmationCount1760000000020 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "th_audit_decisions"
        ADD COLUMN IF NOT EXISTS "confirmationCount" integer NOT NULL DEFAULT 1;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "th_audit_decisions"
        DROP COLUMN IF EXISTS "confirmationCount";
    `);
  }
}
