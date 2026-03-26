import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditRuleMetadata1760000000003 implements MigrationInterface {
  name = 'AddAuditRuleMetadata1760000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_audit_runs" ADD "engineVersion" character varying NOT NULL DEFAULT '2026.03.25'`);
    await queryRunner.query(`ALTER TABLE "th_audit_runs" ADD "ruleCatalog" jsonb NOT NULL DEFAULT '[]'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_audit_runs" DROP COLUMN "ruleCatalog"`);
    await queryRunner.query(`ALTER TABLE "th_audit_runs" DROP COLUMN "engineVersion"`);
  }
}
