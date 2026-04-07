import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriftAlertAndDisabledFields1760000000017 implements MigrationInterface {
  name = 'AddDriftAlertAndDisabledFields1760000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // isDriftAlert flag on review queue items
    await queryRunner.query(
      `ALTER TABLE "th_review_queue_items" ADD COLUMN IF NOT EXISTS "isDriftAlert" boolean NOT NULL DEFAULT false`,
    );
    // disabled flag on audit decisions (for the "Applied automatically" toggle)
    await queryRunner.query(
      `ALTER TABLE "th_audit_decisions" ADD COLUMN IF NOT EXISTS "disabled" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "th_audit_decisions" DROP COLUMN IF EXISTS "disabled"`);
    await queryRunner.query(`ALTER TABLE "th_review_queue_items" DROP COLUMN IF EXISTS "isDriftAlert"`);
  }
}
