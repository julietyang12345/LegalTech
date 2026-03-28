import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransformHubIdentityService } from './transformhub-identity.service';
import { TransformHubTaxonomyService } from './transformhub-taxonomy.service';
import { ThCanonicalRow } from '../../database/entities/th-canonical-row.entity';
import { ThHousehold } from '../../database/entities/th-household.entity';
import { ThOrganization } from '../../database/entities/th-organization.entity';
import { ThDonation } from '../../database/entities/th-donation.entity';
import { ThAttribution } from '../../database/entities/th-attribution.entity';
import { ThRelationship } from '../../database/entities/th-relationship.entity';
import { ThCampaign } from '../../database/entities/th-campaign.entity';
import { ThAppeal } from '../../database/entities/th-appeal.entity';
import { ThAuditDecision } from '../../database/entities/th-audit-decision.entity';

@Injectable()
export class TransformHubEntityModelService {
  constructor(
    private readonly identity: TransformHubIdentityService,
    private readonly taxonomy: TransformHubTaxonomyService,
    @InjectRepository(ThCanonicalRow)
    private readonly rowRepo: Repository<ThCanonicalRow>,
    @InjectRepository(ThHousehold)
    private readonly householdRepo: Repository<ThHousehold>,
    @InjectRepository(ThOrganization)
    private readonly organizationRepo: Repository<ThOrganization>,
    @InjectRepository(ThDonation)
    private readonly donationRepo: Repository<ThDonation>,
    @InjectRepository(ThAttribution)
    private readonly attributionRepo: Repository<ThAttribution>,
    @InjectRepository(ThRelationship)
    private readonly relationshipRepo: Repository<ThRelationship>,
    @InjectRepository(ThCampaign)
    private readonly campaignRepo: Repository<ThCampaign>,
    @InjectRepository(ThAppeal)
    private readonly appealRepo: Repository<ThAppeal>,
    @InjectRepository(ThAuditDecision)
    private readonly auditDecisionRepo: Repository<ThAuditDecision>,
  ) {}

  async buildEntityModel(rows: any[], existingPersons: any[] = [], sessionId?: string, persist = true): Promise<any> {
    const personResolution = await this.identity.resolvePersons(rows, existingPersons, {
      usePersistentIdentityMemory: Boolean(sessionId),
      seedExistingPersonsFromDb: Boolean(sessionId) && existingPersons.length === 0,
      baselinePlatform: rows[0]?.source_platform,
      baselineFileClass: 'ledger',
    });
    const householdsResolution = await this.identity.resolveHouseholds(personResolution.persons, {
      usePersistentHouseholdMemory: Boolean(sessionId),
    });
    const normalizedRows = this.taxonomy.applyNormalizedTaxonomy(rows);
    const householdByMemberId = new Map<string, string>();
    const personMatchByRef = new Map<string, any>(personResolution.matches.map((match: any) => [match.inputRef, match]));

    householdsResolution.households.forEach((household: any) => {
      household.memberIds.forEach((memberId: string) => householdByMemberId.set(memberId, household.id));
    });

    const organizations: any[] = [];
    const organizationIds = new Map<string, string>();
    const relationships: any[] = [];
    const attributions: any[] = [];
    const donations: any[] = [];

    const normalizeKey = (value: string) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const ensureOrganization = (name: string) => {
      const key = String(name || '').trim().toLowerCase();
      if (!key) return null;
      if (!organizationIds.has(key)) {
        const id = `ORG-${String(organizationIds.size + 10000).padStart(5, '0')}`;
        organizationIds.set(key, id);
        organizations.push({ id, name, normalizedName: key, matchingGift: true, workplaceGivingLink: true });
      }
      return organizationIds.get(key) ?? null;
    };

    const resolvedRows = normalizedRows.map((row: any, index: number) => {
      const personMatch = personMatchByRef.get(row.source_row_ref);
      const canonicalPersonId = row.canonical_person_id ?? personMatch?.matchedPersonId ?? null;
      const canonicalHouseholdId = canonicalPersonId
        ? householdByMemberId.get(canonicalPersonId) ?? row.canonical_household_id ?? null
        : row.canonical_household_id ?? null;
      const looksLikeOrganization = /corp|inc|llc|foundation|company|employer/i.test(String(row.entity_name || ''));
      const canonicalOrgId = row.canonical_org_id ?? (looksLikeOrganization ? ensureOrganization(row.entity_name) : null);
      const attributionEntryId = row.attribution_entry_id ?? (/matching gift|employer match|soft credit|tribute/i.test(String(row.memo || ''))
        ? `ATTR-${String(index + 10000).padStart(5, '0')}`
        : null);
      const donationId = `DON-${String(index + 10000).padStart(5, '0')}`;

      if (canonicalOrgId && canonicalPersonId) {
        const relationshipType = /matching gift|employer match|workplace/i.test(String(row.memo || '')) ? 'employer' : 'advisor';
        relationships.push({
          id: `REL-${normalizeKey(`${canonicalPersonId}-${canonicalOrgId}-${relationshipType}`)}`,
          sessionId: sessionId ?? null,
          type: relationshipType,
          personId: canonicalPersonId,
          organizationId: canonicalOrgId,
          confidence: row.mapping_confidence,
        });
      }

      if (attributionEntryId) {
        attributions.push({
          id: attributionEntryId,
          sessionId: sessionId ?? null,
          rowId: row.id,
          donationId,
          personId: canonicalPersonId,
          organizationId: canonicalOrgId,
          kind: /tribute/i.test(String(row.memo || '')) ? 'tribute' : /soft credit/i.test(String(row.memo || '')) ? 'soft_credit' : 'hard_credit',
          workplace: /matching gift|employer match|workplace/i.test(String(row.memo || '')),
        });
      }

      donations.push({
        id: donationId,
        sessionId: sessionId ?? null,
        rowId: row.id,
        amount: Math.max(Number(row.debit || 0), Number(row.credit || 0)),
        date: row.date,
        fund: row.normalized_fund,
        appeal: row.normalized_appeal,
        attribution_type: attributionEntryId ? 'linked' : 'direct',
        canonical_person_id: canonicalPersonId,
        canonical_household_id: canonicalHouseholdId,
        canonical_org_id: canonicalOrgId,
        attribution_entry_id: attributionEntryId,
      });

      return {
        ...row,
        canonical_person_id: canonicalPersonId,
        canonical_household_id: canonicalHouseholdId,
        canonical_org_id: canonicalOrgId,
        attribution_entry_id: attributionEntryId,
        normalized_fund: row.normalized_fund ?? null,
        normalized_appeal: row.normalized_appeal ?? null,
      };
    });

    const campaigns = Array.from(
      new Map(
        resolvedRows
          .filter((row: any) => row.normalized_fund)
          .map((row: any) => [
            row.normalized_fund,
            {
              id: `CAM-${normalizeKey(row.normalized_fund)}`,
              canonical_code: row.normalized_fund,
              total_raised: resolvedRows
                .filter((candidate: any) => candidate.normalized_fund === row.normalized_fund)
                .reduce((sum: number, candidate: any) => sum + Math.max(Number(candidate.debit || 0), Number(candidate.credit || 0)), 0),
              legacy_codes: Array.from(new Set(resolvedRows.filter((candidate: any) => candidate.normalized_fund === row.normalized_fund).map((candidate: any) => candidate.raw_fund).filter(Boolean))),
              versions: 1,
            },
          ]),
      ).values(),
    );

    const appeals = Array.from(
      new Map(
        resolvedRows
          .filter((row: any) => row.normalized_appeal)
          .map((row: any) => [
            row.normalized_appeal,
            {
              id: `APP-${normalizeKey(row.normalized_appeal)}`,
              canonical_code: row.normalized_appeal,
              parent_campaign: row.normalized_fund,
              required_fields: ['date', 'amount'],
              active_flag: !row.taxonomy_exception_id,
            },
          ]),
      ).values(),
    );

    const auditDecisions = resolvedRows
      .filter((row: any) => row.taxonomy_exception_id || row.needs_review)
      .map((row: any) => ({
        id: `AUD-${normalizeKey(row.id)}`,
        sessionId: sessionId ?? null,
        rowId: row.id,
        merge: Boolean(row.canonical_person_id),
        split: row.review_status === 'rejected',
        taxonomy_map: row.normalized_fund || row.normalized_appeal,
        made_by: 'system',
        permanent: false,
      }));

    if (persist && sessionId) {
      await this.persistEntityModel(
        sessionId,
        resolvedRows,
        householdsResolution.households,
        organizations,
        donations,
        attributions,
        relationships,
        campaigns,
        appeals,
        auditDecisions,
      );
    }

    return {
      rows: resolvedRows,
      persons: personResolution.persons,
      households: householdsResolution.households,
      organizations,
      donations,
      attributions,
      relationships,
      campaigns,
      appeals,
      auditDecisions,
      summary: {
        personCount: personResolution.persons.length,
        householdCount: householdsResolution.households.length,
        organizationCount: organizations.length,
        donationCount: donations.length,
      },
      persisted: Boolean(persist && sessionId),
    };
  }

  private async persistEntityModel(
    sessionId: string,
    rows: any[],
    households: any[],
    organizations: any[],
    donations: any[],
    attributions: any[],
    relationships: any[],
    campaigns: any[],
    appeals: any[],
    auditDecisions: any[],
  ) {
    await this.rowRepo.save(rows.map((row) => ({ ...row, sessionId })) as any);
    await this.householdRepo.save(
      households.map((household) => ({
        ...household,
        primaryMemberId: household.memberIds?.[0] ?? null,
      })) as any,
    );
    await this.organizationRepo.save(organizations as any);
    await this.donationRepo.save(donations as any);
    await this.attributionRepo.save(attributions as any);
    await this.relationshipRepo.save(relationships as any);
    await this.campaignRepo.save(campaigns as any);
    await this.appealRepo.save(appeals as any);
    await this.auditDecisionRepo.save(auditDecisions as any);
  }
}
