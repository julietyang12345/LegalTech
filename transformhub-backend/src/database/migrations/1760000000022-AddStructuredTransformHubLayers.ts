import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStructuredTransformHubLayers1760000000022 implements MigrationInterface {
  name = 'AddStructuredTransformHubLayers1760000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_raw_import" (
      "id" character varying PRIMARY KEY,
      "sessionId" character varying,
      "datasetId" character varying,
      "platform" character varying NOT NULL,
      "fileName" character varying NOT NULL,
      "kind" character varying,
      "sourceSheetName" character varying,
      "fingerprint" character varying,
      "rowCount" integer NOT NULL DEFAULT 0,
      "status" character varying NOT NULL DEFAULT 'ingested',
      "rawPayload" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "structureAnalysis" jsonb,
      "workbookMeta" jsonb,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_raw_table" (
      "id" character varying PRIMARY KEY,
      "rawImportId" character varying NOT NULL,
      "sessionId" character varying,
      "tableName" character varying NOT NULL,
      "sourceSheetName" character varying,
      "tableType" character varying,
      "classificationSource" character varying NOT NULL DEFAULT 'system',
      "classificationConfidence" double precision NOT NULL DEFAULT 0,
      "rowCount" integer NOT NULL DEFAULT 0,
      "columnCount" integer NOT NULL DEFAULT 0,
      "headers" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "preview" jsonb,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_raw_column" (
      "id" character varying PRIMARY KEY,
      "rawImportId" character varying NOT NULL,
      "rawTableId" character varying NOT NULL,
      "sessionId" character varying,
      "position" integer NOT NULL,
      "rawName" character varying NOT NULL,
      "normalizedKey" character varying,
      "inferredType" character varying,
      "nullRatio" double precision NOT NULL DEFAULT 0,
      "sampleValues" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "profile" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_mapping_rule" (
      "id" character varying PRIMARY KEY,
      "sessionId" character varying,
      "orgId" character varying,
      "scope" character varying NOT NULL DEFAULT 'session',
      "sourcePlatform" character varying,
      "sourceFileClass" character varying,
      "ruleType" character varying NOT NULL DEFAULT 'field_mapping',
      "sourceKey" character varying NOT NULL,
      "targetField" character varying NOT NULL,
      "confidence" double precision NOT NULL DEFAULT 0,
      "origin" character varying NOT NULL DEFAULT 'deterministic',
      "approvalStatus" character varying NOT NULL DEFAULT 'approved',
      "active" boolean NOT NULL DEFAULT true,
      "version" integer NOT NULL DEFAULT 1,
      "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_normalized_source_row" (
      "id" character varying PRIMARY KEY,
      "sessionId" character varying,
      "rawImportId" character varying,
      "rawTableId" character varying,
      "sourceRowRef" character varying NOT NULL,
      "sourcePlatform" character varying,
      "sourceFileClass" character varying,
      "mappedByRuleIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "mappingConfidence" double precision NOT NULL DEFAULT 0,
      "status" character varying NOT NULL DEFAULT 'normalized',
      "normalizedPayload" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "canonicalPersonId" character varying,
      "canonicalHouseholdId" character varying,
      "canonicalDonationId" character varying,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_source_evidence" (
      "id" character varying PRIMARY KEY,
      "sessionId" character varying,
      "canonicalEntityType" character varying NOT NULL,
      "canonicalEntityId" character varying NOT NULL,
      "evidenceType" character varying NOT NULL DEFAULT 'row_link',
      "normalizedRowId" character varying,
      "rawImportId" character varying,
      "rawTableId" character varying,
      "sourceRowRef" character varying,
      "fieldName" character varying,
      "rawValue" text,
      "normalizedValue" text,
      "confidence" double precision NOT NULL DEFAULT 0,
      "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_decision_log" (
      "id" character varying PRIMARY KEY,
      "sessionId" character varying,
      "rawImportId" character varying,
      "normalizedRowId" character varying,
      "decisionType" character varying NOT NULL,
      "decisionLevel" character varying NOT NULL DEFAULT 'system',
      "decisionMode" character varying NOT NULL DEFAULT 'auto_applied',
      "status" character varying NOT NULL DEFAULT 'applied',
      "actorType" character varying NOT NULL DEFAULT 'system',
      "actorId" character varying,
      "targetType" character varying,
      "targetId" character varying,
      "confidence" double precision,
      "summary" text,
      "rationale" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_raw_import_sessionId" ON "th_raw_import" ("sessionId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_raw_table_rawImportId" ON "th_raw_table" ("rawImportId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_raw_column_rawTableId" ON "th_raw_column" ("rawTableId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_mapping_rule_session_platform_class" ON "th_mapping_rule" ("sessionId", "sourcePlatform", "sourceFileClass")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_normalized_source_row_session_sourceRowRef" ON "th_normalized_source_row" ("sessionId", "sourceRowRef")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_source_evidence_entity" ON "th_source_evidence" ("canonicalEntityType", "canonicalEntityId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_decision_log_session_type" ON "th_decision_log" ("sessionId", "decisionType")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_decision_log_session_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_source_evidence_entity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_normalized_source_row_session_sourceRowRef"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_mapping_rule_session_platform_class"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_raw_column_rawTableId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_raw_table_rawImportId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_raw_import_sessionId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_decision_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_source_evidence"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_normalized_source_row"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_mapping_rule"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_raw_column"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_raw_table"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_raw_import"`);
  }
}
