import { Injectable } from '@nestjs/common';
import { TransformHubAuditRuleEngineService } from './transformhub-audit-rule-engine.service';

@Injectable()
export class TransformHubOutputService {
  constructor(private readonly auditEngine: TransformHubAuditRuleEngineService) {}

  private parseAmount(value: unknown) {
    const normalized = String(value ?? '').replace(/[^0-9.-]+/g, '');
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
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
}
