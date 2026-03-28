import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropCanonicalPersonSourceRowRefs1760000000011 implements MigrationInterface {
  name = 'DropCanonicalPersonSourceRowRefs1760000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "th_canonical_persons" DROP COLUMN IF EXISTS "sourceRowRefs"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE \"th_canonical_persons\" ADD COLUMN IF NOT EXISTS \"sourceRowRefs\" jsonb NOT NULL DEFAULT '[]'");
  }
}
