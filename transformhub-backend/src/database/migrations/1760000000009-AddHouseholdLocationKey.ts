import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHouseholdLocationKey1760000000009 implements MigrationInterface {
  name = 'AddHouseholdLocationKey1760000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_households" ADD COLUMN IF NOT EXISTS "locationKey" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_households" DROP COLUMN IF EXISTS "locationKey"`);
  }
}
