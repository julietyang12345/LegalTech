import { Injectable } from '@nestjs/common';
import { LEGACY_MAPPINGS, TAXONOMY_REGISTRY } from './transformhub-pipeline.service';
import { TransformHubTaxonomyService } from './transformhub-taxonomy.service';

const AUDIT_ENGINE_VERSION = '2026.03.25';

// ─── Root Cause Lookup ────────────────────────────────────────────────────────
// Deterministic explanations for every audit rule. Surfaces to users as
// "Why did this happen?" + "How to fix it" without requiring AI.

type RootCause = {
  causalPattern: string;
  explanation: string;
  suggestedFix: string;
  suggestedFixType: 'resolve_taxonomy' | 'add_field_mapping' | 'run_person_resolve' | 'crm_config' | 'contact_donor' | 'manual_review' | 'reporting_only';
};

const ROOT_CAUSE_MAP: Record<string, RootCause> = {
  UNKNOWN_APPEAL_CODE: {
    causalPattern: 'fund_taxonomy_gap',
    explanation: 'This appeal code was created in your CRM but has no matching entry in the taxonomy registry. This usually happens when a new campaign is launched and the code is not added to the canonical list.',
    suggestedFix: 'Open Taxonomy Review and map the unknown appeal code to a canonical entry.',
    suggestedFixType: 'resolve_taxonomy',
  },
  WRONG_GL_ACCOUNT: {
    causalPattern: 'crm_data_entry_error',
    explanation: 'The GL account assigned to this donation does not fall within the expected range for its fund type. This typically comes from a manual override or copy-paste error in the source CRM.',
    suggestedFix: 'Correct the GL account mapping in the field mapping layer, or fix the source record in your CRM and re-import.',
    suggestedFixType: 'add_field_mapping',
  },
  MAJOR_GIFT_NO_DD: {
    causalPattern: 'missing_person_link',
    explanation: 'A large gift has no canonical donor attached. This happens when the donor check step was skipped or the person record could not be matched during import.',
    suggestedFix: 'Run the duplicate check on this session to link these gifts to canonical donor records.',
    suggestedFixType: 'run_person_resolve',
  },
  MONTHLY_DONOR_TAG_GAP: {
    causalPattern: 'missing_person_link',
    explanation: 'Recurring transactions are present but no donor tag is linked. The recurring donor likely exists in your CRM but was not matched during import.',
    suggestedFix: 'Run the duplicate check and confirm matches for recurring donors.',
    suggestedFixType: 'run_person_resolve',
  },
  LYBUNT_SYBUNT: {
    causalPattern: 'reporting_signal',
    explanation: 'Prior-year transactions were detected. These rows identify donors who gave in a previous year and should feed your LYBUNT/SYBUNT retention reports.',
    suggestedFix: 'No action needed — use these rows in your retention dashboard to identify re-engagement opportunities.',
    suggestedFixType: 'reporting_only',
  },
  CAMPAIGN_VS_GOAL: {
    causalPattern: 'reporting_signal',
    explanation: 'Campaign totals were computed. This is an informational signal to compare actual raised amounts against campaign goals.',
    suggestedFix: 'Review the campaign performance report and compare against your goal targets.',
    suggestedFixType: 'reporting_only',
  },
  LAPSED_MONTHLY_DONOR: {
    causalPattern: 'donor_churn_risk',
    explanation: 'A recurring donor has had no transaction in over 90 days. This may indicate a failed payment, a cancelled pledge, or churn.',
    suggestedFix: 'Contact these donors to confirm their giving status and update their record in the CRM.',
    suggestedFixType: 'contact_donor',
  },
  DOWNGRADE_RISK: {
    causalPattern: 'donor_churn_risk',
    explanation: 'This donor\'s gift amounts have declined across three or more consecutive transactions. This is an early indicator of disengagement.',
    suggestedFix: 'Flag these donors for stewardship outreach before their next gift cycle.',
    suggestedFixType: 'contact_donor',
  },
  SPLIT_DD_ACROSS_HOUSEHOLD: {
    causalPattern: 'data_quality_signal',
    explanation: 'Donors from the same household are giving to different fund designations. This may be intentional or may indicate a missing joint gift setup.',
    suggestedFix: 'Review household attribution and confirm whether these gifts should be treated as joint or individual.',
    suggestedFixType: 'manual_review',
  },
  WORKPLACE_GIFT_NO_EMPLOYER: {
    causalPattern: 'missing_org_entity',
    explanation: 'A row contains workplace or matching-gift language in the memo, but no employer entity is linked. The employer record may not have been imported or matched.',
    suggestedFix: 'Import your employer/organization records and re-run the duplicate check to link matching gift rows.',
    suggestedFixType: 'crm_config',
  },
  UNMATCHED_MATCHING_GIFT: {
    causalPattern: 'missing_org_entity',
    explanation: 'A donor memo references a matching gift but no corresponding employer contribution was found in the same dataset. The employer row may be missing from the export.',
    suggestedFix: 'Export and import the employer matching gift row from your CRM and add it to this session.',
    suggestedFixType: 'crm_config',
  },
};

const AUDIT_RULE_CATALOG = [
  { code: 'UNKNOWN_APPEAL_CODE', label: 'Unknown appeal code', severity: 'error', version: 1, description: 'Appeal value is not present in the taxonomy registry or legacy mappings.' },
  { code: 'WRONG_GL_ACCOUNT', label: 'Wrong GL account', severity: 'error', version: 1, description: 'GL account range conflicts with the normalized fund type.' },
  { code: 'MAJOR_GIFT_NO_DD', label: 'Major gift - no donor ID', severity: 'warning', version: 1, description: 'Large gifts should resolve to a canonical person.' },
  { code: 'MONTHLY_DONOR_TAG_GAP', label: 'Monthly donor tag gap', severity: 'warning', version: 1, description: 'Recurring gifts should be linked to a donor record.' },
  { code: 'LYBUNT_SYBUNT', label: 'Prior-year giving detected', severity: 'info', version: 1, description: 'Rows indicate prior-year giving and should feed retention reporting.' },
  { code: 'CAMPAIGN_VS_GOAL', label: 'Campaign goal check', severity: 'info', version: 1, description: 'Campaign totals exist and should be checked against goals.' },
  { code: 'LAPSED_MONTHLY_DONOR', label: 'Lapsed monthly donor', severity: 'warning', version: 1, description: 'Recurring donors with no recent activity may require follow-up.' },
  { code: 'DOWNGRADE_RISK', label: 'Downgrade risk', severity: 'warning', version: 1, description: 'Gift amounts show a declining pattern across consecutive transactions.' },
  { code: 'SPLIT_DD_ACROSS_HOUSEHOLD', label: 'Split designation across household', severity: 'info', version: 1, description: 'Same-household giving appears split across multiple fund designations.' },
  { code: 'WORKPLACE_GIFT_NO_EMPLOYER', label: 'Workplace gift - no employer entity', severity: 'warning', version: 1, description: 'Workplace or employer-match rows do not have a linked employer entity.' },
  { code: 'UNMATCHED_MATCHING_GIFT', label: 'Unmatched matching gift', severity: 'warning', version: 1, description: 'Matching-gift language appears without a paired employer contribution.' },
  { code: 'AUTO_RERUN', label: 'Auto re-run', severity: 'info', version: 1, description: 'Synthetic informational finding that records audit execution.' },
] as const;

@Injectable()
export class TransformHubAuditRuleEngineService {
  constructor(private readonly taxonomy: TransformHubTaxonomyService) {}

  getCatalog() {
    return AUDIT_RULE_CATALOG.map((rule) => ({ ...rule }));
  }

  getVersion() {
    return AUDIT_ENGINE_VERSION;
  }

  runAuditRules(rows: any[]): any {
    const normalizedRows = this.taxonomy.applyNormalizedTaxonomy(rows);
    const findings: any[] = [];
    const knownAppeals = new Set(TAXONOMY_REGISTRY.filter((t) => t.type === 'appeal').map((t) => t.code.toLowerCase()));
    const legacyAppeals = new Set(LEGACY_MAPPINGS.filter((m) => m.type === 'appeal').map((m) => m.legacyValue.toLowerCase()));

    const pushFinding = (finding: any) => {
      const meta = AUDIT_RULE_CATALOG.find((rule) => rule.code === finding.ruleCode);
      const rootCause = ROOT_CAUSE_MAP[finding.ruleCode] ?? null;
      findings.push({
        ...finding,
        ruleVersion: meta?.version ?? 1,
        label: finding.label ?? meta?.label,
        severity: finding.severity ?? meta?.severity,
        rootCause,
      });
    };

    const unknownAppealRows = normalizedRows.filter((r) => {
      const rawAppeal = r.normalized_appeal || r.raw_appeal;
      return rawAppeal && !knownAppeals.has(String(rawAppeal).toLowerCase().trim()) && !legacyAppeals.has(String(rawAppeal).toLowerCase().trim());
    });
    if (unknownAppealRows.length > 0) pushFinding({ ruleCode: 'UNKNOWN_APPEAL_CODE', rowIds: unknownAppealRows.map((r) => r.id), count: unknownAppealRows.length, message: String(unknownAppealRows.length) + ' row(s) reference an appeal not in the taxonomy registry.', detail: 'Donation.appeal NOT in registry -> held in exception queue.' });

    const wrongGlRows = normalizedRows.filter((r) => {
      const fundValue = r.normalized_fund || r.raw_fund;
      if (!fundValue || !r.account_code) return false;
      const fundNorm = String(fundValue).toLowerCase();
      const code = Number(r.account_code);
      if (fundNorm.includes('rental') && (code < 6000 || code > 6999)) return true;
      if (fundNorm.includes('operating') && (code < 1000 || code > 2999)) return true;
      return false;
    });
    if (wrongGlRows.length > 0) pushFinding({ ruleCode: 'WRONG_GL_ACCOUNT', rowIds: wrongGlRows.map((r) => r.id), count: wrongGlRows.length, message: String(wrongGlRows.length) + ' row(s) have a GL account that does not match the fund type.', detail: 'gl_account != expected_fund_type range.' });

    const majorThreshold = 5000;
    const majorGiftNoDD = normalizedRows.filter((r) => Math.max(Number(r.debit || 0), Number(r.credit || 0)) >= majorThreshold && !r.canonical_person_id);
    if (majorGiftNoDD.length > 0) pushFinding({ ruleCode: 'MAJOR_GIFT_NO_DD', rowIds: majorGiftNoDD.map((r) => r.id), count: majorGiftNoDD.length, message: String(majorGiftNoDD.length) + ' gift(s) >=$' + majorThreshold.toLocaleString() + ' have no canonical_person_id.', detail: 'rating=major AND canonical_person_id=null.' });

    const recurringNoTag = normalizedRows.filter((r) => /monthly|recurring|sustain|pledge/i.test(r.memo) && !r.canonical_person_id);
    if (recurringNoTag.length > 0) pushFinding({ ruleCode: 'MONTHLY_DONOR_TAG_GAP', rowIds: recurringNoTag.map((r) => r.id), count: recurringNoTag.length, message: String(recurringNoTag.length) + ' recurring transaction(s) have no donor tag linked.', detail: 'Recurring tx but no monthly_donor_tag.' });

    const priorYearRows = normalizedRows.filter((r) => {
      const y = Number((r.date || '').slice(0, 4));
      return y > 0 && y < new Date().getFullYear();
    });
    if (priorYearRows.length > 0) pushFinding({ ruleCode: 'LYBUNT_SYBUNT', rowIds: priorYearRows.map((r) => r.id), count: priorYearRows.length, message: String(priorYearRows.length) + ' row(s) contain prior-year transactions.', detail: 'LYBUNT/SYBUNT: gave last year, not yet this year.' });

    const campaignTotals = new Map<string, number>();
    for (const r of normalizedRows) {
      const key = r.normalized_fund || r.normalized_appeal || r.raw_fund || r.raw_appeal;
      if (!key) continue;
      campaignTotals.set(key, (campaignTotals.get(key) ?? 0) + Number(r.debit || 0));
    }
    const singleSidedCampaigns = [...campaignTotals.entries()].filter(([, total]) => total > 0);
    if (singleSidedCampaigns.length > 0) pushFinding({ ruleCode: 'CAMPAIGN_VS_GOAL', rowIds: [], count: singleSidedCampaigns.length, message: String(singleSidedCampaigns.length) + ' campaign(s) have debit totals - verify against goal targets.', detail: 'total_raised vs goal by canonical code.' });

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const lapsedMonthly = normalizedRows.filter((r) => {
      if (!/monthly|recurring|sustain|pledge/i.test(r.memo)) return false;
      const d = r.date ? new Date(r.date) : null;
      return d && !isNaN(d.getTime()) && d < ninetyDaysAgo;
    });
    if (lapsedMonthly.length > 0) pushFinding({ ruleCode: 'LAPSED_MONTHLY_DONOR', rowIds: lapsedMonthly.map((r) => r.id), count: lapsedMonthly.length, message: String(lapsedMonthly.length) + ' recurring gift(s) last seen >90 days ago.', detail: 'Monthly donor - no recent transaction.' });

    const amtByEntity = new Map<string, Array<{ amount: number; date: string; id: string }>>();
    for (const r of normalizedRows) {
      if (!r.entity_name) continue;
      const key = r.canonical_person_id || r.entity_name.toLowerCase().trim();
      const arr = amtByEntity.get(key) ?? [];
      arr.push({ amount: Math.max(Number(r.debit || 0), Number(r.credit || 0)), date: r.date, id: r.id });
      amtByEntity.set(key, arr);
    }
    const downgradeIds: string[] = [];
    for (const [, entries] of amtByEntity) {
      if (entries.length < 3) continue;
      const sorted = [...entries].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      let declining = true;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].amount >= sorted[i - 1].amount) {
          declining = false;
          break;
        }
      }
      if (declining) downgradeIds.push(...sorted.map((e) => e.id));
    }
    if (downgradeIds.length > 0) pushFinding({ ruleCode: 'DOWNGRADE_RISK', rowIds: downgradeIds, count: downgradeIds.length, message: String(downgradeIds.length) + ' row(s) from entities with consistently declining gift amounts.', detail: 'Donor giving declining across >=3 consecutive transactions.' });

    const rowsByLastName = new Map<string, any[]>();
    for (const r of normalizedRows) {
      if (!r.entity_name) continue;
      const parts = r.entity_name.trim().split(/\s+/);
      const lastName = parts[parts.length - 1].toLowerCase();
      const arr = rowsByLastName.get(lastName) ?? [];
      arr.push(r);
      rowsByLastName.set(lastName, arr);
    }
    const splitDdIds: string[] = [];
    for (const [, group] of rowsByLastName) {
      if (group.length < 2) continue;
      const funds = new Set(group.map((r) => String(r.normalized_fund || r.raw_fund || '').toLowerCase().trim()).filter(Boolean));
      if (funds.size > 1) splitDdIds.push(...group.map((r) => r.id));
    }
    if (splitDdIds.length > 0) pushFinding({ ruleCode: 'SPLIT_DD_ACROSS_HOUSEHOLD', rowIds: splitDdIds, count: splitDdIds.length, message: String(splitDdIds.length) + ' row(s) from same-surname households giving to different funds.', detail: 'Same last name split across multiple fund designations.' });

    const workplaceKeywords = /matching gift|employer match|workplace|corporate gift/i;
    const workplaceNoEmployer = normalizedRows.filter((r) => workplaceKeywords.test(r.memo) && !r.entity_name?.toLowerCase().includes('corp') && !r.entity_name?.toLowerCase().includes('inc') && !r.entity_name?.toLowerCase().includes('llc') && !r.entity_name?.toLowerCase().includes('foundation'));
    if (workplaceNoEmployer.length > 0) pushFinding({ ruleCode: 'WORKPLACE_GIFT_NO_EMPLOYER', rowIds: workplaceNoEmployer.map((r) => r.id), count: workplaceNoEmployer.length, message: String(workplaceNoEmployer.length) + ' row(s) indicate workplace matching but no employer entity linked.', detail: 'Matching/workplace memo but entity looks like a person.' });

    const matchingMemoRows = normalizedRows.filter((r) => /matching gift|employer match/i.test(r.memo));
    const hasPairedEmployer = normalizedRows.some((r) => /corp|inc|llc|foundation|employer/i.test(r.entity_name || ''));
    if (matchingMemoRows.length > 0 && !hasPairedEmployer) pushFinding({ ruleCode: 'UNMATCHED_MATCHING_GIFT', rowIds: matchingMemoRows.map((r) => r.id), count: matchingMemoRows.length, message: String(matchingMemoRows.length) + ' matching gift row(s) have no paired employer contribution.', detail: 'Donor memo indicates employer match but no corresponding employer row found.' });

    pushFinding({ ruleCode: 'AUTO_RERUN', rowIds: [], count: normalizedRows.length, message: 'Audit ran against ' + String(normalizedRows.length) + ' row(s).', detail: 'Auto re-run on every import.' });

    return {
      engineVersion: AUDIT_ENGINE_VERSION,
      ruleCatalog: this.getCatalog(),
      findings,
      errorCount: findings.filter((f) => f.severity === 'error').length,
      warningCount: findings.filter((f) => f.severity === 'warning').length,
      infoCount: findings.filter((f) => f.severity === 'info').length,
      totalIssues: findings.length,
    };
  }
}
