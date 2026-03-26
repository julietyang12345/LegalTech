import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThTransformSession } from '../../database/entities/th-transform-session.entity';
import { ThCanonicalRow } from '../../database/entities/th-canonical-row.entity';
import { ThCanonicalPerson } from '../../database/entities/th-canonical-person.entity';
import { ThTaxonomyException } from '../../database/entities/th-taxonomy-exception.entity';
import { ThHousehold } from '../../database/entities/th-household.entity';
import { ThOrganization } from '../../database/entities/th-organization.entity';
import { ThDonation } from '../../database/entities/th-donation.entity';
import { ThAttribution } from '../../database/entities/th-attribution.entity';
import { ThRelationship } from '../../database/entities/th-relationship.entity';
import { ThCampaign } from '../../database/entities/th-campaign.entity';
import { ThAppeal } from '../../database/entities/th-appeal.entity';
import { ThAuditDecision } from '../../database/entities/th-audit-decision.entity';
import { ThAuditRun } from '../../database/entities/th-audit-run.entity';
import { ThSchemaTemplate } from '../../database/entities/th-schema-template.entity';
import { TransformHubController } from './transformhub.controller';
import { TransformHubService } from './transformhub.service';
import { TransformHubPipelineService } from './transformhub-pipeline.service';
import { TransformHubIdentityService } from './transformhub-identity.service';
import { TransformHubTaxonomyService } from './transformhub-taxonomy.service';
import { TransformHubEntityModelService } from './transformhub-entity-model.service';
import { TransformHubRoutingService } from './transformhub-routing.service';
import { TransformHubOutputService } from './transformhub-output.service';
import { TransformHubAuditRuleEngineService } from './transformhub-audit-rule-engine.service';
import { TransformHubApiKeyGuard } from './guards/transformhub-api-key.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ThTransformSession,
      ThCanonicalRow,
      ThCanonicalPerson,
      ThTaxonomyException,
      ThHousehold,
      ThOrganization,
      ThDonation,
      ThAttribution,
      ThRelationship,
      ThCampaign,
      ThAppeal,
      ThAuditDecision,
      ThAuditRun,
      ThSchemaTemplate,
    ]),
  ],
  controllers: [TransformHubController],
  providers: [
    TransformHubService,
    TransformHubPipelineService,
    TransformHubIdentityService,
    TransformHubTaxonomyService,
    TransformHubEntityModelService,
    TransformHubRoutingService,
    TransformHubOutputService,
    TransformHubAuditRuleEngineService,
    TransformHubApiKeyGuard,
  ],
})
export class TransformHubModule {}
