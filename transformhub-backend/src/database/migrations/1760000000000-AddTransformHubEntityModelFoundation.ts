import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransformHubEntityModelFoundation1760000000000 implements MigrationInterface {
  name = 'AddTransformHubEntityModelFoundation1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_canonical_rows" ADD COLUMN IF NOT EXISTS "canonical_org_id" character varying`);
    await queryRunner.query(`ALTER TABLE "th_canonical_rows" ADD COLUMN IF NOT EXISTS "attribution_entry_id" character varying`);
    await queryRunner.query(`ALTER TABLE "th_canonical_rows" ADD COLUMN IF NOT EXISTS "normalized_fund" character varying`);
    await queryRunner.query(`ALTER TABLE "th_canonical_rows" ADD COLUMN IF NOT EXISTS "normalized_appeal" character varying`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_households" (
      "id" character varying PRIMARY KEY,
      "lastName" character varying,
      "primaryMemberId" character varying,
      "primaryAddress" text,
      "salutation" character varying NOT NULL DEFAULT 'formal',
      "salutationText" text,
      "jointGivingTotal" double precision NOT NULL DEFAULT 0,
      "version" integer NOT NULL DEFAULT 1,
      "memberIds" jsonb NOT NULL DEFAULT '[]',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_organizations" (
      "id" character varying PRIMARY KEY,
      "name" character varying NOT NULL,
      "normalizedName" character varying NOT NULL,
      "matchingGift" boolean NOT NULL DEFAULT false,
      "workplaceGivingLink" boolean NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_donations" (
      "id" character varying PRIMARY KEY,
      "sessionId" character varying,
      "rowId" character varying,
      "amount" double precision NOT NULL DEFAULT 0,
      "date" character varying,
      "fund" character varying,
      "appeal" character varying,
      "attribution_type" character varying NOT NULL DEFAULT 'direct',
      "canonical_person_id" character varying,
      "canonical_household_id" character varying,
      "canonical_org_id" character varying,
      "attribution_entry_id" character varying,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_attributions" (
      "id" character varying PRIMARY KEY,
      "sessionId" character varying,
      "rowId" character varying,
      "donationId" character varying,
      "personId" character varying,
      "organizationId" character varying,
      "kind" character varying NOT NULL DEFAULT 'hard_credit',
      "workplace" boolean NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_relationships" (
      "id" character varying PRIMARY KEY,
      "sessionId" character varying,
      "type" character varying NOT NULL,
      "personId" character varying,
      "organizationId" character varying,
      "confidence" double precision NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_campaigns" (
      "id" character varying PRIMARY KEY,
      "canonical_code" character varying NOT NULL,
      "total_raised" double precision NOT NULL DEFAULT 0,
      "legacy_codes" jsonb NOT NULL DEFAULT '[]',
      "versions" integer NOT NULL DEFAULT 1,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_appeals" (
      "id" character varying PRIMARY KEY,
      "canonical_code" character varying NOT NULL,
      "parent_campaign" character varying,
      "required_fields" jsonb NOT NULL DEFAULT '[]',
      "active_flag" boolean NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_audit_decisions" (
      "id" character varying PRIMARY KEY,
      "sessionId" character varying,
      "rowId" character varying,
      "merge" boolean NOT NULL DEFAULT false,
      "split" boolean NOT NULL DEFAULT false,
      "taxonomy_map" character varying,
      "made_by" character varying NOT NULL DEFAULT 'system',
      "permanent" boolean NOT NULL DEFAULT false,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_canonical_rows_canonical_org_id" ON "th_canonical_rows" ("canonical_org_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_canonical_rows_normalized_fund" ON "th_canonical_rows" ("normalized_fund")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_canonical_rows_normalized_appeal" ON "th_canonical_rows" ("normalized_appeal")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_th_organizations_normalized_name" ON "th_organizations" ("normalizedName")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_th_campaigns_canonical_code" ON "th_campaigns" ("canonical_code")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_th_appeals_canonical_code" ON "th_appeals" ("canonical_code")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_appeals_canonical_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_campaigns_canonical_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_organizations_normalized_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_canonical_rows_normalized_appeal"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_canonical_rows_normalized_fund"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_canonical_rows_canonical_org_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_audit_decisions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_appeals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_campaigns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_relationships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_attributions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_donations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_organizations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_households"`);
    await queryRunner.query(`ALTER TABLE "th_canonical_rows" DROP COLUMN IF EXISTS "normalized_appeal"`);
    await queryRunner.query(`ALTER TABLE "th_canonical_rows" DROP COLUMN IF EXISTS "normalized_fund"`);
    await queryRunner.query(`ALTER TABLE "th_canonical_rows" DROP COLUMN IF EXISTS "attribution_entry_id"`);
    await queryRunner.query(`ALTER TABLE "th_canonical_rows" DROP COLUMN IF EXISTS "canonical_org_id"`);
  }
}
