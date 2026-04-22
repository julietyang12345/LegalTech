import { matchesNormalizedKey, normalizeKey } from './transformhub-key-normalization';

export type DonorDuplicateSignal = {
  rowRef: string;
  amount: number | null;
  date: string;
  transactionRef: string;
  fund: string;
  appeal: string;
  source: string;
};

function defaultNormStr(value: string): string {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').replace(/ +/g, ' ');
}

function normalizeEmail(value: string): string {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw || !raw.includes('@')) return '';
  const [localPart, domain] = raw.split('@');
  return `${localPart.split('+')[0]}@${domain}`;
}

function firstPresent(...values: unknown[]): unknown {
  return values.find((value) => String(value ?? '').trim());
}

const DONOR_TRANSACTION_REF_ALIASES = [
  'transaction id',
  'transaction_id',
  'transactionId',
  'gift id',
  'gift_id',
  'giftId',
  'donation id',
  'donation_id',
  'donationId',
  'payment id',
  'payment_id',
  'paymentId',
  'receipt id',
  'receipt_id',
  'receiptId',
  'order id',
  'order_id',
  'orderId',
  'charge id',
  'charge_id',
  'chargeId',
  'invoice id',
  'invoice_id',
  'invoiceId',
  'reference id',
  'reference_id',
  'referenceId',
  'transaction reference',
  'payment reference',
  'external id',
  'processor id',
  'gateway id',
];

const DONOR_AMOUNT_ALIASES = [
  'amount',
  'gift amount',
  'donation amount',
  'transaction amount',
  'payment amount',
  'credit amount',
  'gross amount',
  'gross',
  'net amount',
  'net',
  'total amount paid',
  'total amount',
  'total',
  'paid amount',
  'gift total',
  'donation total',
  'payment gross',
  'payment net',
  'charge amount',
  'settlement amount',
  'net proceeds',
  'gross proceeds',
  'paid',
  'payment',
];

const DONOR_DATE_ALIASES = [
  'date',
  'gift date',
  'donation date',
  'payment date',
  'transaction date',
  'posted date',
  'posting date',
  'close date',
  'closedate',
  'created at',
  'created date',
  'created',
  'processed at',
  'settled at',
  'submitted at',
  'gift created',
  'donation created',
  'payment created',
];

const DONOR_FUND_ALIASES = ['fund', 'fund name', 'designation', 'campaign', 'campaign name'];
const DONOR_APPEAL_ALIASES = ['appeal', 'appeal name', 'campaign', 'campaign name', 'source'];

function heuristicRawValue(
  rawValues: Record<string, string> | undefined,
  kind: 'amount' | 'date' | 'transactionRef',
  normStr: (value: string) => string,
): string {
  if (!rawValues) return '';
  for (const [key, value] of Object.entries(rawValues)) {
    const rawValue = String(value || '').trim();
    if (!rawValue) continue;
    const normalizedKey = normalizeKey(key);
    const stripped = normalizedKey.strippedKey;
    if (kind === 'amount') {
      if (parseDuplicateAmount(rawValue) === null) continue;
      if (/(amount|total|gross|net|paid|payment|charge|settlement|proceeds)/.test(stripped)) return rawValue;
    }
    if (kind === 'date') {
      if (!normalizeDuplicateDate(rawValue, normStr)) continue;
      if (/(date|createdat|processedat|settledat|submittedat|posted)/.test(stripped)) return rawValue;
    }
    if (kind === 'transactionRef') {
      if (rawValue.length < 4) continue;
      if (/(transaction|payment|gift|donation|receipt|order|charge|invoice|reference|gateway|processor).*(id|ref|reference)?/.test(stripped)) {
        return rawValue;
      }
    }
  }
  return '';
}

export function normalizeDuplicateDate(value: unknown, normStr: (value: string) => string = defaultNormStr): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return normStr(raw);
  return parsed.toISOString().slice(0, 10);
}

export function parseDuplicateAmount(value: unknown): number | null {
  const normalized = String(value ?? '').replace(/[^0-9.-]+/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractDonorDuplicateSignalFromRow(
  row: any,
  options: {
    normStr?: (value: string) => string;
    fallbackRawValue?: (rawValues: Record<string, string> | undefined, aliases: string[], validator?: (value: string) => boolean) => string;
  } = {},
): DonorDuplicateSignal {
  const normStr = options.normStr ?? defaultNormStr;
  const fallbackRawValue = options.fallbackRawValue ?? ((rawValues, aliases) => {
    if (!rawValues) return '';
    for (const [key, value] of Object.entries(rawValues)) {
      if (!matchesNormalizedKey(key, aliases)) continue;
      const normalizedValue = String(value || '').trim();
      if (normalizedValue) return normalizedValue;
    }
    return '';
  });

  const rawValues = row.rawValues as Record<string, string> | undefined;
  const fallbackAmount = fallbackRawValue(rawValues, DONOR_AMOUNT_ALIASES, (value) => parseDuplicateAmount(value) !== null)
    || heuristicRawValue(rawValues, 'amount', normStr);
  const fallbackDate = fallbackRawValue(rawValues, DONOR_DATE_ALIASES, (value) => normalizeDuplicateDate(value, normStr).length > 0)
    || heuristicRawValue(rawValues, 'date', normStr);
  const directRef = [
    row.transaction_id,
    row.transactionId,
    row.gift_id,
    row.giftId,
    row.payment_id,
    row.paymentId,
    row.receipt_id,
    row.receiptId,
    row.order_id,
    row.orderId,
    row.charge_id,
    row.chargeId,
    row.invoice_id,
    row.invoiceId,
    row.reference_id,
    row.referenceId,
    row.qbo_txn_id,
  ].find((value) => String(value || '').trim());

  return {
    rowRef: String(row.source_row_ref || row.sourceRowRef || ''),
    amount: parseDuplicateAmount(
      firstPresent(
        row.amount,
        row.gross_amount,
        row.grossAmount,
        row.net_amount,
        row.netAmount,
        row.total_amount,
        row.totalAmount,
        row.credit,
        row.debit,
        fallbackAmount,
        '',
      ),
    ),
    date: normalizeDuplicateDate(
      firstPresent(
        row.date,
        row.transaction_date,
        row.transactionDate,
        row.payment_date,
        row.paymentDate,
        row.gift_date,
        row.giftDate,
        row.created_at,
        row.createdAt,
        fallbackDate,
      ),
      normStr,
    ),
    transactionRef: directRef
      ? normStr(String(directRef))
      : normStr(fallbackRawValue(rawValues, DONOR_TRANSACTION_REF_ALIASES) || heuristicRawValue(rawValues, 'transactionRef', normStr)),
    fund: normStr(String(firstPresent(row.raw_fund, row.fund, fallbackRawValue(rawValues, DONOR_FUND_ALIASES), '') || '')),
    appeal: normStr(String(firstPresent(row.raw_appeal, row.appeal, fallbackRawValue(rawValues, DONOR_APPEAL_ALIASES), '') || '')),
    source: normStr(String(row.source_file || row.sourceFile || row.source_platform || '')),
  };
}

export function scoreDonorDuplicateSignalPair(
  inputSignal: DonorDuplicateSignal,
  candidateSignal: DonorDuplicateSignal,
  inputName: string,
  candidateName: string,
  inputEmail: string = '',
  candidateEmail: string = '',
  normStr: (value: string) => string = defaultNormStr,
): { score: number; matchedFields: string[]; matchedInputRef: string | null } {
  let score = 0;
  const matchedFields: string[] = [];
  const normalizedInputName = normStr(inputName);
  const normalizedCandidateName = normStr(candidateName);
  const normalizedInputEmail = normalizeEmail(inputEmail);
  const normalizedCandidateEmail = normalizeEmail(candidateEmail);
  const sameTransactionRef = Boolean(
    inputSignal.transactionRef &&
    candidateSignal.transactionRef &&
    inputSignal.transactionRef === candidateSignal.transactionRef,
  );
  const sameAmount = inputSignal.amount !== null && candidateSignal.amount !== null && inputSignal.amount === candidateSignal.amount;
  const sameDate = Boolean(inputSignal.date && candidateSignal.date && inputSignal.date === candidateSignal.date);
  const sameName = Boolean(normalizedInputName && normalizedCandidateName && normalizedInputName === normalizedCandidateName);
  const sameEmail = Boolean(normalizedInputEmail && normalizedCandidateEmail && normalizedInputEmail === normalizedCandidateEmail);
  const differentNames = Boolean(normalizedInputName && normalizedCandidateName && normalizedInputName !== normalizedCandidateName);
  const differentEmails = Boolean(normalizedInputEmail && normalizedCandidateEmail && normalizedInputEmail !== normalizedCandidateEmail);
  const sameFund = Boolean(inputSignal.fund && candidateSignal.fund && inputSignal.fund === candidateSignal.fund);
  const sameAppeal = Boolean(inputSignal.appeal && candidateSignal.appeal && inputSignal.appeal === candidateSignal.appeal);
  const sameSource = Boolean(inputSignal.source && candidateSignal.source && inputSignal.source === candidateSignal.source);
  const hasAmountValues = inputSignal.amount !== null && candidateSignal.amount !== null;
  const hasDateValues = Boolean(inputSignal.date && candidateSignal.date);

  if (sameTransactionRef) {
    score += 75;
    matchedFields.push('transaction_id');
  }

  if (!sameTransactionRef) {
    if (differentNames && differentEmails) {
      return { score: 0, matchedFields: [], matchedInputRef: null };
    }

    if (!sameName && !sameEmail) {
      return { score: 0, matchedFields: [], matchedInputRef: null };
    }

    // Transaction duplicate review needs a transaction-level anchor. When there
    // is no stable transaction reference, require the amount to match before
    // considering the pair a possible duplicate transaction.
    if (!sameAmount) {
      return { score: 0, matchedFields: [], matchedInputRef: null };
    }
  }

  if (hasAmountValues) {
    if (sameAmount) {
      score += 50;
      matchedFields.push('amount');
    } else {
      if (!sameTransactionRef) return { score: 0, matchedFields: [], matchedInputRef: null };
      matchedFields.push('amount_conflict');
    }
  }

  if (hasDateValues) {
    if (sameDate) {
      score += 30;
      matchedFields.push('tx_date');
    } else {
      if (!sameTransactionRef) return { score: 0, matchedFields: [], matchedInputRef: null };
      matchedFields.push('date_conflict');
    }
  }

  if (sameName) {
    score += 20;
    matchedFields.push('full_name');
  }

  if (sameEmail) {
    score += 20;
    matchedFields.push('email');
  }

  if (sameFund) {
    score += 12;
    matchedFields.push('fund');
  }

  if (sameAppeal) {
    score += 12;
    matchedFields.push('appeal');
  }

  if (sameSource) {
    score += 6;
    matchedFields.push('source');
  }

  return {
    score,
    matchedFields,
    matchedInputRef: candidateSignal.rowRef || null,
  };
}
