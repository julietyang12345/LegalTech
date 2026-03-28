import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCanonicalPersonScope1760000000010 implements MigrationInterface {
  name = 'AddCanonicalPersonScope1760000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "th_canonical_persons" ADD COLUMN IF NOT EXISTS "sourcePlatform" character varying');
    await queryRunner.query('ALTER TABLE "th_canonical_persons" ADD COLUMN IF NOT EXISTS "sourceFileClass" character varying');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_th_canonical_persons_source_platform_file_class" ON "th_canonical_persons" ("sourcePlatform", "sourceFileClass")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_th_canonical_persons_source_platform_file_class"');
    await queryRunner.query('ALTER TABLE "th_canonical_persons" DROP COLUMN IF EXISTS "sourceFileClass"');
    await queryRunner.query('ALTER TABLE "th_canonical_persons" DROP COLUMN IF EXISTS "sourcePlatform"');
  }
}
