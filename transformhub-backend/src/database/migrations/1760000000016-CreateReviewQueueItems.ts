import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReviewQueueItems1760000000016 implements MigrationInterface {
  name = 'CreateReviewQueueItems1760000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "th_review_queue_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "inputKey" character varying,
        "candidatePersonId" character varying,
        "score" double precision NOT NULL DEFAULT 0,
        "isHighConfidence" boolean NOT NULL DEFAULT false,
        "displayNameA" character varying,
        "displayNameB" character varying,
        "evidenceFields" jsonb,
        "status" character varying NOT NULL DEFAULT 'pending',
        "resolvedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_th_review_queue_items_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_th_review_queue_items_status_score" ON "th_review_queue_items" ("status", "score" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_th_review_queue_items_candidatePersonId" ON "th_review_queue_items" ("candidatePersonId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_review_queue_items_candidatePersonId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_review_queue_items_status_score"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_review_queue_items"`);
  }
}
