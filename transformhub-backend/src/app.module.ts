import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';

import { ThTransformSession } from './database/entities/th-transform-session.entity';
import { ThCanonicalRow } from './database/entities/th-canonical-row.entity';
import { ThCanonicalPerson } from './database/entities/th-canonical-person.entity';
import { ThTaxonomyException } from './database/entities/th-taxonomy-exception.entity';
import { ThHousehold } from './database/entities/th-household.entity';
import { ThOrganization } from './database/entities/th-organization.entity';
import { ThDonation } from './database/entities/th-donation.entity';
import { ThAttribution } from './database/entities/th-attribution.entity';
import { ThRelationship } from './database/entities/th-relationship.entity';
import { ThCampaign } from './database/entities/th-campaign.entity';
import { ThAppeal } from './database/entities/th-appeal.entity';
import { ThAuditDecision } from './database/entities/th-audit-decision.entity';
import { ThAuditRun } from './database/entities/th-audit-run.entity';
import { ThSchemaTemplate } from './database/entities/th-schema-template.entity';

import { TransformHubModule } from './modules/transformhub/transformhub.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.production', '.env.local', '.env'],
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const dbUrl = configService.get('database.url');
        const base = dbUrl
          ? { url: dbUrl, ssl: { rejectUnauthorized: false } }
          : {
              host: configService.get('database.host'),
              port: configService.get('database.port'),
              username: configService.get('database.username'),
              password: configService.get('database.password'),
              database: configService.get('database.database'),
            };
        return {
          type: 'postgres',
          ...base,
          entities: [ThTransformSession, ThCanonicalRow, ThCanonicalPerson, ThTaxonomyException, ThHousehold, ThOrganization, ThDonation, ThAttribution, ThRelationship, ThCampaign, ThAppeal, ThAuditDecision, ThAuditRun, ThSchemaTemplate],
          synchronize: configService.get('nodeEnv') === 'development',
          logging: configService.get('nodeEnv') === 'development',
          ssl: configService.get('database.ssl') ? { rejectUnauthorized: false } : false,
        };
      },
      inject: [ConfigService],
    }),

    TransformHubModule,
  ],
})
export class AppModule {}
