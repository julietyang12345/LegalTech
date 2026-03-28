import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNonLedgerSessionState1760000000006 implements MigrationInterface {
  name = 'AddNonLedgerSessionState1760000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "th_transform_sessions" ADD COLUMN IF NOT EXISTS "personResult" jsonb');
    await queryRunner.query('ALTER TABLE "th_transform_sessions" ADD COLUMN IF NOT EXISTS "householdResult" jsonb');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "th_transform_sessions" DROP COLUMN IF EXISTS "householdResult"');
    await queryRunner.query('ALTER TABLE "th_transform_sessions" DROP COLUMN IF EXISTS "personResult"');
  }
}
