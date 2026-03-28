import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCanonicalHouseholds1760000000008 implements MigrationInterface {
  name = 'AddCanonicalHouseholds1760000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "th_households" (
      "id" character varying PRIMARY KEY,
      "lastName" character varying,
      "primaryMemberId" character varying,
      "primaryAddress" text,
      "locationKey" character varying,
      "salutation" character varying NOT NULL DEFAULT 'formal',
      "salutationText" text,
      "jointGivingTotal" double precision NOT NULL DEFAULT 0,
      "version" integer NOT NULL DEFAULT 1,
      "memberIds" jsonb NOT NULL DEFAULT '[]',
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_th_households_last_name" ON "th_households" ("lastName")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_th_households_last_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "th_households"`);
  }
}
