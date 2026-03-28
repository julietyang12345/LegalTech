import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNormalizedTaxonomyExceptionKey1760000000006 implements MigrationInterface {
  name = 'AddNormalizedTaxonomyExceptionKey1760000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ADD COLUMN IF NOT EXISTS "normalizedRawValue" character varying`);
    await queryRunner.query(`UPDATE "th_taxonomy_exceptions" SET "normalizedRawValue" = regexp_replace(lower(trim(coalesce("rawValue", ''))), '\\s+', ' ', 'g') WHERE "normalizedRawValue" IS NULL OR "normalizedRawValue" = ''`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" ALTER COLUMN "normalizedRawValue" SET NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_taxonomy_exceptions_type_normalized_raw_value" ON "th_taxonomy_exceptions" ("type", "normalizedRawValue")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_taxonomy_exceptions_status_type_normalized_raw_value" ON "th_taxonomy_exceptions" ("status", "type", "normalizedRawValue")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_taxonomy_exceptions_status_type_normalized_raw_value"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_taxonomy_exceptions_type_normalized_raw_value"`);
    await queryRunner.query(`ALTER TABLE "th_taxonomy_exceptions" DROP COLUMN IF EXISTS "normalizedRawValue"`);
  }
}
