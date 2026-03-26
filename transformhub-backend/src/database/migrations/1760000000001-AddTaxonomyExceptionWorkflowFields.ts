import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTaxonomyExceptionWorkflowFields1760000000001 implements MigrationInterface {
  name = 'AddTaxonomyExceptionWorkflowFields1760000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "sessionId" character varying`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'open'`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "notes" text`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "assignedTo" character varying`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_taxonomy_exceptions_status" ON "th_taxonomy_exceptions" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_taxonomy_exceptions_session_id" ON "th_taxonomy_exceptions" ("sessionId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_taxonomy_exceptions_session_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_taxonomy_exceptions_status"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "assignedTo"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "notes"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "sessionId"`);
  }
}
