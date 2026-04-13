import { Injectable } from '@nestjs/common';
import { TransformHubAuditRuleEngineService } from './transformhub-audit-rule-engine.service';

@Injectable()
export class TransformHubOutputService {
  constructor(private readonly auditEngine: TransformHubAuditRuleEngineService) {}

  private roundAmount(value: number, increment = 100) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.round(value / increment) * increment;
  }

  private normalizeIdentity(record: any) {
    return String(
      record?.organizationName
      || record?.donorName
      || record?.displayName
      || [record?.firstName, record?.lastName].filter(Boolean).join(' ')
      || record?.sourceRowRef
      || record?.id
      || '',
    ).trim().toLowerCase();
  }

  private parseAmount(value: unknown) {
    const normalized = String(value ?? '').replace(/[^0-9.-]+/g, '');
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private hasAssignedStaffField(schema: any) {
    return Boolean(String(schema?.fieldMap?.assigned_staff ?? '').trim());
  }

  private buildAnalyticsEvidenceRows(records: any[] = []) {
    return records
      .map((record: any) => {
        const recurring = String(record?.recurring ?? record?.frequency ?? '').toLowerCase();
        return {
          sourceRowRef: String(record?.sourceRowRef ?? record?.id ?? ''),
          date: record?.date ? String(record.date) : null,
          amount: this.parseAmount(record?.amount),
          source: String(record?.sourceFile || record?.source_file || 'Current file'),
          type: String(record?.type || record?.frequency || record?.method || record?.fund || 'Gift'),
          recurring: recurring.includes('true') || recurring.includes('monthly') || recurring.includes('quarterly') || recurring.includes('yearly'),
        };
      })
      .sort((left: any, right: any) => {
        const leftTime = left.date ? new Date(left.date).getTime() : 0;
        const rightTime = right.date ? new Date(right.date).getTime() : 0;
        return rightTime - leftTime;
      });
  }

  private summarizeAttribution(record: any, personById: Map<string, any>) {
    const attribution = record?.attribution ?? null;
    if (!attribution) {
      return {
        primaryPersonId: null,
        secondaryPersonId: null,
        organizationName: null,
        attributionMode: 'direct',
        summary: 'Direct row credit',
      };
    }
    const primary = attribution.primaryPersonId ? personById.get(attribution.primaryPersonId) : null;
    const secondary = attribution.secondaryPersonId ? personById.get(attribution.secondaryPersonId) : null;
    if (attribution.mode === 'joint_split') {
      return {
        primaryPersonId: attribution.primaryPersonId ?? null,
        secondaryPersonId: attribution.secondaryPersonId ?? null,
        organizationName: attribution.organizationName || null,
        attributionMode: attribution.mode,
        summary: `${primary ? `${primary.firstName} ${primary.lastName}`.trim() : 'Primary'} ${attribution.splitPercent}% / ${secondary ? `${secondary.firstName} ${secondary.lastName}`.trim() : 'Secondary'} ${Math.max(0, 100 - Number(attribution.splitPercent || 0))}%`,
      };
    }
    if (attribution.mode === 'soft_credit') {
      return {
        primaryPersonId: attribution.primaryPersonId ?? null,
        secondaryPersonId: attribution.secondaryPersonId ?? null,
        organizationName: attribution.organizationName || null,
        attributionMode: attribution.mode,
        summary: `${primary ? `${primary.firstName} ${primary.lastName}`.trim() : 'Primary'} hard credit / ${secondary ? `${secondary.firstName} ${secondary.lastName}`.trim() : 'Secondary'} soft credit`,
      };
    }
    if (attribution.mode === 'org_match') {
      return {
        primaryPersonId: attribution.primaryPersonId ?? null,
        secondaryPersonId: attribution.secondaryPersonId ?? null,
        organizationName: attribution.organizationName || null,
        attributionMode: attribution.mode,
        summary: `${primary ? `${primary.firstName} ${primary.lastName}`.trim() : 'Primary'} with ${attribution.organizationName || 'organization'} match`,
      };
    }
    return {
      primaryPersonId: attribution.primaryPersonId ?? null,
      secondaryPersonId: attribution.secondaryPersonId ?? null,
      organizationName: attribution.organizationName || null,
      attributionMode: attribution.mode || 'person',
      summary: `${primary ? `${primary.firstName} ${primary.lastName}`.trim() : 'Primary'} hard credit`,
    };
  }

  buildDonorReport(rows: any[], persons: any[] = [], households: any[] = [], previewRecords: any[] = []) {
    const personById = new Map((persons || []).map((person: any) => [person.id, person]));
    const householdByName = new Map((households || []).map((household: any) => [household.label || household.addressee || household.lastName, household]));
    const attributionRows = (previewRecords || [])
      .filter((record: any) => record.amount !== undefined || record.attribution)
      .map((record: any) => {
        const attribution = this.summarizeAttribution(record, personById);
        const household = householdByName.get(record.householdName) ?? null;
        return {
          source_row_ref: record.sourceRowRef,
          amount: this.parseAmount(record.amount),
          household_id: household?.id ?? null,
          primary_person_id: attribution.primaryPersonId,
          secondary_person_id: attribution.secondaryPersonId,
          organization_name: attribution.organizationName,
          attribution_mode: attribution.attributionMode,
          credit_summary: attribution.summary,
        };
      });
    return {
      persons,
      households,
      attributionRows,
      donationCount: rows.length || attributionRows.length,
      totalDebit: rows.length > 0 ? rows.reduce((sum, row) => sum + Number(row.debit || 0), 0) : attributionRows.reduce((sum, row) => sum + row.amount, 0),
      totalCredit: rows.length > 0 ? rows.reduce((sum, row) => sum + Number(row.credit || 0), 0) : attributionRows.reduce((sum, row) => sum + row.amount, 0),
      generatedAt: new Date().toISOString(),
    };
  }

  buildAuditDashboard(rows: any[], latestRun?: any) {
    const auditResult = this.auditEngine.runAuditRules(rows);
    return {
      ...auditResult,
      engineVersion: latestRun?.engineVersion ?? auditResult.engineVersion,
      ruleCatalog: latestRun?.ruleCatalog ?? auditResult.ruleCatalog,
      latestPersistedRunId: latestRun?.id ?? null,
      delta: latestRun?.delta ?? { trend: 'baseline', newFindings: [], resolvedFindings: [] },
      deltaTrend: latestRun?.delta?.trend ?? 'baseline',
      generatedAt: new Date().toISOString(),
    };
  }

  buildCampaignPerformanceReport(rows: any[]) {
    const grouped = new Map<string, { canonicalCode: string; totalRaised: number; donationCount: number; retentionBucket: string }>();

    rows.forEach((row) => {
      const canonicalCode = row.normalized_fund || row.normalized_appeal || row.raw_fund || row.raw_appeal;
      if (!canonicalCode) return;
      const current = grouped.get(canonicalCode) ?? {
        canonicalCode,
        totalRaised: 0,
        donationCount: 0,
        retentionBucket: /monthly|recurring|sustain/i.test(String(row.memo || '')) ? 'retained' : 'standard',
      };
      current.totalRaised += Math.max(Number(row.debit || 0), Number(row.credit || 0));
      current.donationCount += 1;
      grouped.set(canonicalCode, current);
    });

    return {
      campaigns: Array.from(grouped.values()),
      generatedAt: new Date().toISOString(),
    };
  }

  buildCrmSyncExport(rows: any[], persons: any[] = [], households: any[] = [], previewRecords: any[] = []) {
    const personById = new Map((persons || []).map((person: any) => [person.id, person]));
    const householdByName = new Map((households || []).map((household: any) => [household.label || household.addressee || household.lastName, household]));
    const previewRows = (previewRecords || []).map((record: any) => {
      const attribution = this.summarizeAttribution(record, personById);
      const household = householdByName.get(record.householdName) ?? null;
      return {
        canonical_person_id: attribution.primaryPersonId,
        canonical_household_id: household?.id ?? null,
        canonical_org_id: null,
        name: record.displayName || record.donorName || record.householdName || record.sourceRowRef,
        formatted_for: household?.formalSalutation || household?.salutationText || 'crm_import',
        addressee: household?.addressee || record.householdName || null,
        attribution_mode: attribution.attributionMode,
        organization_credit: attribution.organizationName,
        source_row_ref: record.sourceRowRef,
      };
    });
    return {
      persons,
      households,
      rows: rows.length > 0
        ? rows
        .filter((row) => row.canonical_person_id || row.canonical_household_id)
        .map((row) => ({
          canonical_person_id: row.canonical_person_id,
          canonical_household_id: row.canonical_household_id,
          canonical_org_id: row.canonical_org_id ?? null,
          name: row.entity_name,
          formatted_for: 'crm_import',
          source_row_ref: row.source_row_ref,
          addressee: null,
          attribution_mode: null,
          organization_credit: null,
        }))
        : previewRows,
      generatedAt: new Date().toISOString(),
    };
  }

  buildReviewAnalytics(
    rows: any[] = [],
    persons: any[] = [],
    households: any[] = [],
    previewRecords: any[] = [],
    taxonomyState: any = null,
    finalAttributionDrafts: Record<string, any> = {},
    fileClass = 'donor',
    schema: any = null,
  ) {
    const donorRecords = fileClass === 'donor' ? previewRecords : [];
    const hasAssignedStaffField = this.hasAssignedStaffField(schema);
    const donorGroups = new Map<string, any>();

    donorRecords.forEach((record: any) => {
      const key = this.normalizeIdentity(record);
      const current = donorGroups.get(key) ?? {
        label: String(record?.donorName || record?.organizationName || [record?.firstName, record?.lastName].filter(Boolean).join(' ') || record?.sourceRowRef || 'Unknown donor'),
        totalAmount: 0,
        latestAmount: 0,
        latestDate: null as Date | null,
        campaigns: new Set<string>(),
        tags: new Set<string>(),
        assignedStaff: new Set<string>(),
        memoText: [] as string[],
        records: [] as any[],
        years: new Set<number>(),
      };
      const amount = this.parseAmount(record?.amount);
      const nextDate = record?.date ? new Date(String(record.date)) : null;
      current.totalAmount += amount;
      current.records.push(record);
      if (nextDate && !Number.isNaN(nextDate.getTime())) {
        current.latestDate = !current.latestDate || nextDate.getTime() > current.latestDate.getTime() ? nextDate : current.latestDate;
        current.years.add(nextDate.getFullYear());
      }
      if (amount > 0 && (!current.latestAmount || (nextDate && current.latestDate && nextDate.getTime() >= current.latestDate.getTime()))) {
        current.latestAmount = amount;
      }
      current.campaigns.add(String(record?.fund || record?.appeal || 'Unassigned'));
      (Array.isArray(record?.tags) ? record.tags : []).forEach((tag: string) => current.tags.add(String(tag || '').trim().toLowerCase()));
      if (record?.assignedStaff) current.assignedStaff.add(String(record.assignedStaff).trim());
      if (record?.memo) current.memoText.push(String(record.memo).toLowerCase());
      donorGroups.set(key, current);
    });

    const now = new Date();
    const donorEntries = Array.from(donorGroups.values()).map((entry: any) => {
      const sortedDates = entry.records
        .map((record: any) => (record?.date ? new Date(String(record.date)) : null))
        .filter((date: Date | null): date is Date => date instanceof Date && !Number.isNaN(date.getTime()))
        .sort((left: Date, right: Date) => left.getTime() - right.getTime());
      const intervals = sortedDates.slice(1).map((date: Date, index: number) => {
        const previousDate = sortedDates[index];
        return previousDate ? Math.round((date.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      });
      return {
        ...entry,
        recurringPattern: intervals.some((interval: number) => interval >= 25 && interval <= 40) || entry.records.length >= 3,
      };
    });

    const items: any[] = [];
    donorEntries.forEach((entry: any) => {
      const campaign = Array.from(entry.campaigns)[0] ?? 'Unassigned';
      const sourceRowRefs = entry.records.map((record: any) => record.sourceRowRef);
      const duplicateCount = Math.max(0, sourceRowRefs.length - 1);
      const includesSoftCredit = entry.records.some((record: any) => {
        const attribution = finalAttributionDrafts?.[record.sourceRowRef] ?? record?.attribution ?? null;
        return attribution?.mode === 'soft_credit';
      });

      if (entry.recurringPattern) {
        items.push({
          id: `recurring:${entry.label}`,
          outcomeId: 'revenue_at_risk',
          detailId: 'recurring_donors',
          label: entry.label,
          description: 'Multiple gifts suggest a recurring giving pattern.',
          amount: Math.max(entry.latestAmount, entry.totalAmount * 0.5),
          sortDate: entry.latestDate?.toISOString() ?? null,
          campaign,
          donorSegment: 'recurring donors',
          sourceRowRefs,
          duplicateCount,
          includesSoftCredit,
          evidenceRows: this.buildAnalyticsEvidenceRows(entry.records),
          action: 'final_table',
        });
      }

      if (entry.latestDate && (now.getTime() - entry.latestDate.getTime()) > (1000 * 60 * 60 * 24 * 365)) {
        items.push({
          id: `lapsed:${entry.label}`,
          outcomeId: 'revenue_at_risk',
          detailId: 'lapsed_donors',
          label: entry.label,
          description: 'No gift recorded in the last 12 months.',
          amount: entry.latestAmount || entry.totalAmount,
          sortDate: entry.latestDate.toISOString(),
          campaign,
          donorSegment: 'lapsed donors',
          sourceRowRefs,
          duplicateCount,
          includesSoftCredit,
          action: 'final_table',
        });
      }

      if (entry.memoText.some((memo: string) => memo.includes('match') || memo.includes('employer') || memo.includes('company'))) {
        items.push({
          id: `match:${entry.label}`,
          outcomeId: 'money_leakage',
          detailId: 'missing_matching_gifts',
          label: entry.label,
          description: 'Employer matching gift hint found in notes or source data.',
          amount: entry.totalAmount,
          sortDate: entry.latestDate?.toISOString() ?? null,
          campaign,
          donorSegment: 'matching gift opportunities',
          sourceRowRefs,
          duplicateCount,
          includesSoftCredit,
          action: 'household',
        });
      }

      if (hasAssignedStaffField && entry.totalAmount >= 1000 && entry.assignedStaff.size === 0) {
        items.push({
          id: `unassigned:${entry.label}`,
          outcomeId: 'money_leakage',
          detailId: 'unassigned_major_donors',
          label: entry.label,
          description: 'Major donor has no development owner assigned.',
          amount: entry.totalAmount,
          sortDate: entry.latestDate?.toISOString() ?? null,
          campaign,
          donorSegment: 'unassigned prospects',
          sourceRowRefs,
          duplicateCount,
          includesSoftCredit,
          action: 'final_table',
        });
      }
    });

    donorEntries
      .slice()
      .sort((left: any, right: any) => right.totalAmount - left.totalAmount)
      .slice(0, Math.max(1, Math.ceil(donorEntries.length * 0.2)))
      .forEach((entry: any) => {
        items.push({
          id: `upgrade:${entry.label}`,
          outcomeId: 'money_leakage',
          detailId: 'upgrade_opportunities',
          label: entry.label,
          description: 'Top-value donor with room to upgrade based on giving concentration.',
          amount: entry.totalAmount * 0.2,
          sortDate: entry.latestDate?.toISOString() ?? null,
          campaign: Array.from(entry.campaigns)[0] ?? 'Unassigned',
          donorSegment: entry.totalAmount >= 1000 ? 'major donors' : 'upgrade opportunities',
          sourceRowRefs: entry.records.map((record: any) => record.sourceRowRef),
          duplicateCount: Math.max(0, entry.records.length - 1),
          includesSoftCredit: entry.records.some((record: any) => (finalAttributionDrafts?.[record.sourceRowRef] ?? record?.attribution ?? null)?.mode === 'soft_credit'),
          action: 'final_table',
        });
      });

    const pendingTaxonomyGroups = (taxonomyState?.candidateGroups ?? []).filter((group: any) => group?.status === 'pending' && !(taxonomyState?.dismissedCandidateIds ?? []).includes(group.id));
    pendingTaxonomyGroups.forEach((group: any) => {
      const sourceRowRefs = Array.from(new Set((group?.members ?? []).flatMap((member: any) => member?.sourceRowRefs ?? [])));
      const groupAmount = sourceRowRefs.reduce((sum: number, ref: string) => {
        const record = previewRecords.find((candidate: any) => candidate?.sourceRowRef === ref);
        return sum + this.parseAmount(record?.amount);
      }, 0);
      items.push({
        id: `taxonomy:${group.id}`,
        outcomeId: 'campaign_truth',
        detailId: 'broken_taxonomy',
        label: group?.suggestedCanonicalLabel || group?.id,
        description: `${group?.objectType || 'Taxonomy'} aliases are still split across raw labels.`,
        amount: groupAmount || sourceRowRefs.length,
        sortDate: null,
        campaign: group?.suggestedCanonicalLabel || 'Unassigned',
        donorSegment: 'campaign ops',
        sourceRowRefs,
        duplicateCount: Math.max(0, sourceRowRefs.length - 1),
        includesSoftCredit: false,
        action: 'taxonomy',
      });
    });

    const summarize = (outcomeId: string, detailId: string) => {
      const scoped = items.filter((item) => item.outcomeId === outcomeId && item.detailId === detailId);
      return {
        count: scoped.length,
        amount: this.roundAmount(scoped.reduce((sum, item) => sum + Number(item.amount || 0), 0)),
      };
    };

    const recurring = summarize('revenue_at_risk', 'recurring_donors');
    const lapsed = summarize('revenue_at_risk', 'lapsed_donors');
    const matches = summarize('money_leakage', 'missing_matching_gifts');
    const upgrades = summarize('money_leakage', 'upgrade_opportunities');
    const unassigned = summarize('money_leakage', 'unassigned_major_donors');
    const campaignBroken = summarize('campaign_truth', 'broken_taxonomy');
    const taxonomyImpactPercent = previewRecords.length > 0 ? Math.round((campaignBroken.count / previewRecords.length) * 100) : 0;

    const cards = [
      {
        id: 'revenue_at_risk',
        eyebrow: 'Critical · revenue at risk',
        title: `${this.roundAmount(recurring.amount + lapsed.amount)}`.replace(/^/, '$').replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' at risk of churn',
        tone: 'risk',
        amount: this.roundAmount(recurring.amount + lapsed.amount),
        metricKind: 'currency',
        summary: 'Recurring donors and lapsed donors surface churn risk after duplicate, household, and taxonomy review.',
        supporting: 'Calculated from the cleaned donor layer using reviewed recency, repeat-gift cadence, and attribution updates.',
        details: [
          { id: 'recurring_donors', label: 'Recurring donors', count: recurring.count, amount: recurring.amount, description: 'Multiple gifts suggest a recurring giving pattern.', ctaLabel: 'Review attribution table', action: 'final_table' },
          { id: 'lapsed_donors', label: 'Lapsed donors', count: lapsed.count, amount: lapsed.amount, description: 'Last gift is over 12 months old.', ctaLabel: 'Open final review', action: 'final_table' },
        ],
      },
      {
        id: 'money_leakage',
        eyebrow: 'Opportunity · hidden revenue',
        title: `${this.roundAmount(matches.amount + upgrades.amount + unassigned.amount)}`.replace(/^/, '$').replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' potential upside',
        tone: 'opportunity',
        amount: this.roundAmount(matches.amount + upgrades.amount + unassigned.amount),
        metricKind: 'currency',
        summary: hasAssignedStaffField
          ? 'Matching gifts, upgrade candidates, and unassigned major donors are sitting in the file uncaptured.'
          : 'Matching gifts and upgrade candidates are sitting in the file uncaptured.',
        supporting: hasAssignedStaffField
          ? 'Calculated from employer-match hints, donor concentration, and missing ownership.'
          : 'Calculated from employer-match hints and donor concentration.',
        details: [
          { id: 'missing_matching_gifts', label: 'Missing matching gifts', count: matches.count, amount: matches.amount, description: 'Employer-match signals appear in the source data but are not yet worked.', ctaLabel: 'Open household review', action: 'household' },
          { id: 'upgrade_opportunities', label: 'Upgrade opportunities', count: upgrades.count, amount: upgrades.amount, description: 'High-value donors are giving below what their file pattern suggests.', ctaLabel: 'Open final review', action: 'final_table' },
          ...(hasAssignedStaffField
            ? [{ id: 'unassigned_major_donors', label: 'Unassigned major donors', count: unassigned.count, amount: unassigned.amount, description: 'Large donors have no staff owner assigned.', ctaLabel: 'Open final review', action: 'final_table' }]
            : []),
        ],
      },
      {
        id: 'campaign_truth',
        eyebrow: 'Warning · campaign truth',
        title: `${taxonomyImpactPercent}% of gifts misclassified`,
        tone: 'warning',
        amount: taxonomyImpactPercent,
        metricKind: 'percent',
        summary: 'Normalized campaign performance is unreliable while taxonomy remains broken or unresolved.',
        supporting: 'Percentage is based on records participating in still-pending taxonomy candidate groups.',
        details: [
          { id: 'normalized_campaign_performance', label: 'Normalized campaign performance', count: Math.max(0, (taxonomyState?.resolvedGroups ?? []).length), amount: taxonomyImpactPercent, description: 'Campaign comparisons improve as duplicate labels are merged into one canonical view.', ctaLabel: 'Open taxonomy review', action: 'taxonomy' },
          { id: 'broken_taxonomy', label: 'Broken taxonomy', count: campaignBroken.count, amount: taxonomyImpactPercent, description: 'Pending campaign, appeal, or fund aliases are still splitting the same performance story.', ctaLabel: 'Fix taxonomy', action: 'taxonomy' },
        ],
      },
    ];

    return {
      generatedAt: new Date().toISOString(),
      cards,
      items,
      suggestedViews: [
        { id: 'template-recurring-risk', name: 'Recurring donors', outcomeId: 'revenue_at_risk', detailId: 'recurring_donors' },
      ],
    };
  }
}
