import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKeySynonyms1760000000013 implements MigrationInterface {
  name = 'CreateKeySynonyms1760000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "th_key_synonyms" (
        "id" character varying NOT NULL,
        "sourcePlatform" character varying,
        "sourceFileClass" character varying,
        "canonicalTarget" character varying NOT NULL,
        "rawKey" character varying NOT NULL,
        "cleanedKey" character varying NOT NULL,
        "strippedKey" character varying NOT NULL,
        "source" character varying NOT NULL DEFAULT 'approved_ai',
        "confidence" character varying NOT NULL DEFAULT 'high',
        "approvedBy" character varying,
        "approvedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_th_key_synonyms_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_th_key_synonyms_scope_target" ON "th_key_synonyms" ("sourcePlatform", "sourceFileClass", "canonicalTarget")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_th_key_synonyms_stripped_key" ON "th_key_synonyms" ("strippedKey")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_th_key_synonyms_stripped_key"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_th_key_synonyms_scope_target"');
    await queryRunner.query('DROP TABLE IF EXISTS "th_key_synonyms"');
  }
}
