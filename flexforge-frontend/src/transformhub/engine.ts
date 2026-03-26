import type { CanonicalLedgerRow } from './types';

export function updateCanonicalRow(
  rows: CanonicalLedgerRow[],
  rowId: string,
  patch: Partial<CanonicalLedgerRow>,
): CanonicalLedgerRow[] {
  return rows.map((row) => {
    if (row.id !== rowId) return row;

    const next = { ...row, ...patch };
    const hasAmount = Number(next.debit || '0') > 0 || Number(next.credit || '0') > 0;
    const needsReview = !next.account_code || !next.account_name || !next.date || !hasAmount;
    const reviewStatus = next.review_status === 'rejected' ? 'rejected' : needsReview ? 'pending' : 'approved';

    return {
      ...next,
      review_status: reviewStatus,
      needs_review: reviewStatus !== 'rejected' && needsReview,
      suggested_fix:
        reviewStatus === 'rejected'
          ? null
          : needsReview
            ? next.suggested_fix ?? 'Complete the missing accounting fields before posting.'
            : null,
    };
  });
}

export function addBalancingRow(rows: CanonicalLedgerRow[], rowId: string): CanonicalLedgerRow[] {
  const source = rows.find((row) => row.id === rowId);
  if (!source) return rows;

  const amount = source.debit || source.credit || '0.00';
  const balancingRow: CanonicalLedgerRow = {
    ...source,
    id: `${rowId}-balance`,
    account_code: '9999',
    account_name: 'Suspense Clearing',
    debit: source.credit ? amount : '',
    credit: source.debit ? amount : '',
    source_row_ref: `${source.source_row_ref}:balancing`,
    review_status: 'approved',
    needs_review: false,
    suggested_fix: null,
    qbo_account_id: '91',
    qbo_txn_id: null,
  };

  return [...rows, balancingRow];
}
