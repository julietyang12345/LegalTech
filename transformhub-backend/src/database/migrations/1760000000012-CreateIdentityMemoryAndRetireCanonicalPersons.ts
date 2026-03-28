import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdentityMemoryAndRetireCanonicalPersons1760000000012 implements MigrationInterface {
  name = 'CreateIdentityMemoryAndRetireCanonicalPersons1760000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "th_identity_memory" (
        "id" character varying NOT NULL,
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
        "sourcePlatform" character varying,
        "sourceFileClass" character varying,
        "fingerprints" jsonb NOT NULL DEFAULT '[]',
        "decisionState" character varying DEFAULT 'confirmed',
        "lastConfirmedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_th_identity_memory_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_th_identity_memory_source_platform_file_class" ON "th_identity_memory" ("sourcePlatform", "sourceFileClass")');
    await queryRunner.query(`
      INSERT INTO "th_identity_memory" (
        "id", "firstName", "lastName", "email", "phone", "addressLine1", "city", "state", "zip",
        "tags", "lifecycle", "sourcePlatform", "sourceFileClass", "fingerprints", "decisionState", "lastConfirmedAt", "createdAt", "updatedAt"
      )
      SELECT
        "id", "firstName", "lastName", "email", "phone", "addressLine1", "city", "state", "zip",
        COALESCE("tags", '[]'::jsonb), COALESCE("lifecycle", 'active'), "sourcePlatform", "sourceFileClass", '[]'::jsonb, 'confirmed', "updatedAt", "createdAt", "updatedAt"
      FROM "th_canonical_persons"
      ON CONFLICT ("id") DO NOTHING
    `);
    await queryRunner.query('DROP TABLE IF EXISTS "th_canonical_persons"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "th_canonical_persons" (
        "id" character varying NOT NULL,
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
        "sourcePlatform" character varying,
        "sourceFileClass" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_th_canonical_persons_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_th_canonical_persons_source_platform_file_class" ON "th_canonical_persons" ("sourcePlatform", "sourceFileClass")');
    await queryRunner.query(`
      INSERT INTO "th_canonical_persons" (
        "id", "firstName", "lastName", "email", "phone", "addressLine1", "city", "state", "zip",
        "tags", "lifecycle", "sourcePlatform", "sourceFileClass", "createdAt", "updatedAt"
      )
      SELECT
        "id", "firstName", "lastName", "email", "phone", "addressLine1", "city", "state", "zip",
        COALESCE("tags", '[]'::jsonb), COALESCE("lifecycle", 'active'), "sourcePlatform", "sourceFileClass", "createdAt", "updatedAt"
      FROM "th_identity_memory"
      ON CONFLICT ("id") DO NOTHING
    `);
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_th_identity_memory_source_platform_file_class"');
    await queryRunner.query('DROP TABLE IF EXISTS "th_identity_memory"');
  }
}
