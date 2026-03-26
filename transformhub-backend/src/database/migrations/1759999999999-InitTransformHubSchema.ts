import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitTransformHubSchema1759999999999 implements MigrationInterface {
  name = 'InitTransformHubSchema1759999999999';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'th_transform_sessions_status_enum') THEN
        CREATE TYPE "th_transform_sessions_status_enum" AS ENUM ('review', 'ready', 'posted');
      END IF;
    END$$`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_transform_sessions" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "status" "th_transform_sessions_status_enum" NOT NULL DEFAULT 'review',
      "fileName" character varying NOT NULL,
      "platform" character varying NOT NULL,
      "parsedFile" jsonb NOT NULL,
      "schema" jsonb NOT NULL,
      "guardrails" jsonb NOT NULL,
      "preflight" jsonb,
      "receipts" jsonb NOT NULL DEFAULT '[]',
      "fingerprint" character varying,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_canonical_rows" (
      "id" character varying PRIMARY KEY,
      "sessionId" uuid NOT NULL,
      "date" character varying,
      "entity_name" character varying,
      "account_code" character varying,
      "account_name" character varying,
      "debit" character varying,
      "credit" character varying,
      "currency" character varying NOT NULL DEFAULT 'USD',
      "memo" text,
      "source_platform" character varying NOT NULL,
      "source_row_ref" character varying NOT NULL,
      "journal_id" character varying NOT NULL,
      "mapping_confidence" double precision NOT NULL DEFAULT 0,
      "review_status" character varying NOT NULL DEFAULT 'pending',
      "needs_review" boolean NOT NULL DEFAULT true,
      "suggested_fix" text,
      "qbo_account_id" character varying,
      "qbo_txn_id" character varying,
      "canonical_person_id" character varying,
      "canonical_household_id" character varying,
      "raw_fund" character varying,
      "raw_appeal" character varying,
      "taxonomy_exception_id" character varying,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "FK_th_canonical_rows_session" FOREIGN KEY ("sessionId") REFERENCES "th_transform_sessions"("id") ON DELETE CASCADE
    )`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_canonical_rows_session_id" ON "th_canonical_rows" ("sessionId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_canonical_rows_source_row_ref" ON "th_canonical_rows" ("source_row_ref")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_canonical_rows_taxonomy_exception_id" ON "th_canonical_rows" ("taxonomy_exception_id")`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_taxonomy_exceptions" (
      "id" character varying PRIMARY KEY,
      "rawValue" character varying NOT NULL,
      "type" character varying NOT NULL,
      "sourceRowRef" character varying NOT NULL,
      "resolvedCode" character varying,
      "resolvedAt" TIMESTAMP,
      "aiSuggested" boolean NOT NULL DEFAULT false,
      "aiReasoning" text,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_taxonomy_exceptions_source_row_ref" ON "th_taxonomy_exceptions" ("sourceRowRef")`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_canonical_persons" (
      "id" character varying PRIMARY KEY,
      "firstName" character varying,
      "lastName" character varying,
      "email" character varying,
      "phone" character varying,
      "addressLine1" character varying,
      "city" character varying,
      "state" character varying,
      "zip" character varying,
      "tags" jsonb NOT NULL DEFAULT '[]',
      "lifecycle" character varying NOT NULL DEFAULT 'active',
      "sourceRowRefs" jsonb NOT NULL DEFAULT '[]',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "th_canonical_persons"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_th_taxonomy_exceptions_source_row_ref"');
    await queryRunner.query('DROP TABLE IF EXISTS "th_taxonomy_exceptions"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_th_canonical_rows_taxonomy_exception_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_th_canonical_rows_source_row_ref"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_th_canonical_rows_session_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "th_canonical_rows"');
    await queryRunner.query('DROP TABLE IF EXISTS "th_transform_sessions"');
    await queryRunner.query('DROP TYPE IF EXISTS "th_transform_sessions_status_enum"');
  }
}
