import { Injectable } from '@nestjs/common';
import { TransformHubAuditRuleEngineService } from './transformhub-audit-rule-engine.service';

@Injectable()
export class TransformHubOutputService {
  constructor(private readonly auditEngine: TransformHubAuditRuleEngineService) {}

  buildDonorReport(rows: any[], persons: any[] = [], households: any[] = []) {
    return {
      persons,
      households,
      donationCount: rows.length,
      totalDebit: rows.reduce((sum, row) => sum + Number(row.debit || 0), 0),
      totalCredit: rows.reduce((sum, row) => sum + Number(row.credit || 0), 0),
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

  buildCrmSyncExport(rows: any[], persons: any[] = [], households: any[] = []) {
    return {
      persons,
      households,
      rows: rows
        .filter((row) => row.canonical_person_id || row.canonical_household_id)
        .map((row) => ({
          canonical_person_id: row.canonical_person_id,
          canonical_household_id: row.canonical_household_id,
          canonical_org_id: row.canonical_org_id ?? null,
          name: row.entity_name,
          formatted_for: 'crm_import',
          source_row_ref: row.source_row_ref,
        })),
      generatedAt: new Date().toISOString(),
    };
  }
}
