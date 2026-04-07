import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSourceCrosswalk1760000000018 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "th_source_crosswalk" (
        "id"            text        NOT NULL,
        "personId"      text        NOT NULL,
        "platform"      text        NOT NULL,
        "fileClass"     text,
        "rawKey"        text,
        "totalGiving"   numeric(15,2) NOT NULL DEFAULT 0,
        "donationCount" integer     NOT NULL DEFAULT 0,
        "firstSeenAt"   timestamptz,
        "lastSeenAt"    timestamptz,
        "createdAt"     timestamptz NOT NULL DEFAULT now(),
        "updatedAt"     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_th_source_crosswalk" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_th_source_crosswalk_person"
        ON "th_source_crosswalk" ("personId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "th_source_crosswalk";`);
  }
}
