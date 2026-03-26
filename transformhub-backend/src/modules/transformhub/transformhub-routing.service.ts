import { Injectable } from '@nestjs/common';

const DEFAULT_AXES = {
  constituentIdentity: { owner: 'CRM', destination: 'crm-sync-export', format: 'crm_person_household' },
  fundraisingEvents: { owner: 'DonationPlatform', destination: 'donor-report', format: 'donation_events' },
  financePosting: { owner: 'QuickBooks/Xero', destination: 'post-simulate', format: 'journal_entries' },
  reporting: { owner: 'TransformHub', destination: 'audit-dashboard', format: 'cross_system_metrics' },
};

@Injectable()
export class TransformHubRoutingService {
  resolveAxes(axes?: any, rows: any[] = []) {
    const mergedAxes = {
      ...DEFAULT_AXES,
      ...(axes || {}),
    };

    return {
      axes: mergedAxes,
      ownershipSummary: [
        `Axis 1 identity owned by ${mergedAxes.constituentIdentity.owner}`,
        `Axis 2 fundraising owned by ${mergedAxes.fundraisingEvents.owner}`,
        `Axis 3 finance owned by ${mergedAxes.financePosting.owner}`,
        `Axis 4 reporting owned by ${mergedAxes.reporting.owner}`,
      ],
      routeCounts: {
        crmEligibleRows: rows.filter((row) => row.canonical_person_id || row.canonical_household_id).length,
        fundraisingRows: rows.filter((row) => row.raw_fund || row.raw_appeal).length,
        financeEligibleRows: rows.filter((row) => row.account_code && row.account_name).length,
        reportingRows: rows.length,
      },
    };
  }
}
