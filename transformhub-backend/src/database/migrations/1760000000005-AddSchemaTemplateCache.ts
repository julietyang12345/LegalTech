import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSchemaTemplateCache1760000000005 implements MigrationInterface {
  name = 'AddSchemaTemplateCache1760000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_schema_templates" (
      "fingerprint" character varying PRIMARY KEY,
      "platform" character varying NOT NULL,
      "reportType" character varying NOT NULL,
      "fieldMap" jsonb NOT NULL DEFAULT '{}',
      "unresolvedFields" jsonb NOT NULL DEFAULT '[]',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_th_schema_templates_platform" ON "th_schema_templates" ("platform")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_th_schema_templates_platform"');
    await queryRunner.query('DROP TABLE IF EXISTS "th_schema_templates"');
  }
}
