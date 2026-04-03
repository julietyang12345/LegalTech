import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewDatasets1760000000015 implements MigrationInterface {
  name = 'AddReviewDatasets1760000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasReviewActionsTable = await queryRunner.hasTable('th_review_actions');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "th_review_datasets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "fingerprint" character varying NOT NULL,
        "platform" character varying NOT NULL,
        "fileClass" character varying NOT NULL,
        "fileName" character varying NOT NULL,
        "rawParsedFile" jsonb NOT NULL,
        "cleanedParsedFile" jsonb NOT NULL,
        "latestSessionId" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_th_review_datasets_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_th_review_datasets_fingerprint" ON "th_review_datasets" ("fingerprint")`);
    await queryRunner.query(`ALTER TABLE "th_transform_sessions" ADD COLUMN IF NOT EXISTS "datasetId" character varying`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_transform_sessions_datasetId" ON "th_transform_sessions" ("datasetId")`);
    if (hasReviewActionsTable) {
      await queryRunner.query(`ALTER TABLE "th_review_actions" ADD COLUMN IF NOT EXISTS "datasetId" character varying`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_review_actions_datasetId" ON "th_review_actions" ("datasetId")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasReviewActionsTable = await queryRunner.hasTable('th_review_actions');

    if (hasReviewActionsTable) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_review_actions_datasetId"`);
      await queryRunner.query(`ALTER TABLE "th_review_actions" DROP COLUMN IF EXISTS "datasetId"`);
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_transform_sessions_datasetId"`);
    await queryRunner.query(`ALTER TABLE "th_transform_sessions" DROP COLUMN IF EXISTS "datasetId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_review_datasets_fingerprint"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_review_datasets"`);
  }
}
