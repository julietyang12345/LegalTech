import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCanonicalRowResolutionSource1760000000007 implements MigrationInterface {
  name = 'AddCanonicalRowResolutionSource1760000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_canonical_rows" ADD COLUMN IF NOT EXISTS "resolution_source" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_canonical_rows" DROP COLUMN IF EXISTS "resolution_source"`);
  }
}
