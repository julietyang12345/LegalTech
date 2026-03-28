import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { ThTransformSession } from './entities/th-transform-session.entity';
import { ThCanonicalRow } from './entities/th-canonical-row.entity';
import { ThIdentityMemory } from './entities/th-identity-memory.entity';
import { ThTaxonomyException } from './entities/th-taxonomy-exception.entity';
import { ThHousehold } from './entities/th-household.entity';
import { ThOrganization } from './entities/th-organization.entity';
import { ThDonation } from './entities/th-donation.entity';
import { ThAttribution } from './entities/th-attribution.entity';
import { ThRelationship } from './entities/th-relationship.entity';
import { ThCampaign } from './entities/th-campaign.entity';
import { ThAppeal } from './entities/th-appeal.entity';
import { ThAuditDecision } from './entities/th-audit-decision.entity';
import { ThAuditRun } from './entities/th-audit-run.entity';
import { ThSchemaTemplate } from './entities/th-schema-template.entity';
import { ThKeySynonym } from './entities/th-key-synonym.entity';

dotenv.config();

function parseDbConfig() {
  const url = process.env.DATABASE_URL;
  if (url) {
    return { url, ssl: { rejectUnauthorized: false } };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'flexforge',
    password: process.env.DB_PASSWORD || 'flexforge_dev_password',
    database: process.env.DB_DATABASE || 'transformhub_dev',
  };
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...parseDbConfig(),
  entities: [ThTransformSession, ThCanonicalRow, ThIdentityMemory, ThTaxonomyException, ThHousehold, ThOrganization, ThDonation, ThAttribution, ThRelationship, ThCampaign, ThAppeal, ThAuditDecision, ThAuditRun, ThSchemaTemplate, ThKeySynonym],
  migrations: [join(__dirname, 'migrations', '*.{js,ts}')],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
