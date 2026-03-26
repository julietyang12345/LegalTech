import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditRuns1760000000002 implements MigrationInterface {
  name = 'AddAuditRuns1760000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_audit_runs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "sessionId" character varying,
      "findings" jsonb NOT NULL,
      "errorCount" integer NOT NULL DEFAULT 0,
      "warningCount" integer NOT NULL DEFAULT 0,
      "infoCount" integer NOT NULL DEFAULT 0,
      "totalIssues" integer NOT NULL DEFAULT 0,
      "delta" jsonb NOT NULL DEFAULT '{}',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_audit_runs_session_id" ON "th_audit_runs" ("sessionId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_audit_runs_session_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_audit_runs"`);
  }
}
