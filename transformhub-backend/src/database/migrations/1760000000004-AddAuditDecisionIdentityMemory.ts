import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditDecisionIdentityMemory1760000000004 implements MigrationInterface {
  name = 'AddAuditDecisionIdentityMemory1760000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "th_audit_decisions" ADD COLUMN IF NOT EXISTS "inputKey" character varying');
    await queryRunner.query('ALTER TABLE "th_audit_decisions" ADD COLUMN IF NOT EXISTS "matchedPersonId" character varying');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_th_audit_decisions_inputKey" ON "th_audit_decisions" ("inputKey")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_th_audit_decisions_matchedPersonId" ON "th_audit_decisions" ("matchedPersonId")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_th_audit_decisions_permanent_inputKey" ON "th_audit_decisions" ("permanent", "inputKey")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_th_audit_decisions_permanent_inputKey"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_th_audit_decisions_matchedPersonId"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_th_audit_decisions_inputKey"');
    await queryRunner.query('ALTER TABLE "th_audit_decisions" DROP COLUMN IF EXISTS "matchedPersonId"');
    await queryRunner.query('ALTER TABLE "th_audit_decisions" DROP COLUMN IF EXISTS "inputKey"');
  }
}
