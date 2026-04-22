import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDonorDuplicateSignalFromRow, scoreDonorDuplicateSignalPair } from '../transformhub-duplicate-rules';

function donorRow(overrides: Record<string, unknown> = {}) {
  return {
    source_row_ref: 'row-1',
    source_platform: 'GiveButter',
    entity_name: 'John Smith',
    date: '2024-03-01',
    amount: '100',
    raw_fund: 'Annual Fund',
    raw_appeal: 'Spring',
    rawValues: {},
    ...overrides,
  };
}

test('scores duplicate transactions highest when transaction_id matches', () => {
  const left = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-1',
    rawValues: { transaction_id: 'tx-001' },
  }));
  const right = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-2',
    amount: '105',
    date: '2024-03-03',
    rawValues: { transaction_id: 'tx-001' },
  }));

  const result = scoreDonorDuplicateSignalPair(left, right, 'John Smith', 'John Smith');
  assert.equal(result.matchedInputRef, 'row-2');
  assert.ok(result.matchedFields.includes('transaction_id'));
  assert.ok(result.matchedFields.includes('amount_conflict'));
  assert.ok(result.matchedFields.includes('date_conflict'));
  assert.ok(result.score >= 75);
});

test('treats same donor + same amount + same tx date as a review candidate without transaction_id', () => {
  const left = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-1',
    rawValues: { import_batch: 'gb_march' },
  }));
  const right = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-2',
    source_platform: 'Bloomerang',
    rawValues: { import_batch: 'bb_march' },
  }));

  const result = scoreDonorDuplicateSignalPair(left, right, 'John Smith', 'John Smith');
  assert.ok(result.score >= 75);
  assert.deepEqual(
    result.matchedFields.filter((field) => ['amount', 'tx_date', 'full_name', 'fund', 'appeal'].includes(field)).sort(),
    ['amount', 'appeal', 'full_name', 'fund', 'tx_date'].sort(),
  );
});

test('keeps same donor separate when only name and tx date match without stronger support', () => {
  const left = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-1',
    amount: '100',
    date: '2024-03-01',
    raw_fund: '',
    raw_appeal: '',
  }));
  const right = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-2',
    amount: '250',
    date: '2024-03-01',
    source_platform: 'Bloomerang',
    raw_fund: '',
    raw_appeal: '',
  }));

  const result = scoreDonorDuplicateSignalPair(left, right, 'John Smith', 'John Smith');
  assert.equal(result.score, 0);
  assert.deepEqual(result.matchedFields, []);
});

test('treats same donor with same amount and missing date as a review candidate without transaction_id', () => {
  const left = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-1',
    date: '',
    raw_fund: '',
    raw_appeal: '',
  }));
  const right = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-2',
    date: '',
    raw_fund: '',
    raw_appeal: '',
  }));

  const result = scoreDonorDuplicateSignalPair(left, right, 'John Smith', 'John Smith');
  assert.ok(result.score >= 60);
  assert.ok(result.matchedFields.includes('amount'));
  assert.ok(result.matchedFields.includes('full_name'));
});

test('does not flag same name when transaction amount and date both conflict without supporting context', () => {
  const left = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-1',
    amount: '100',
    date: '2024-03-01',
    raw_fund: '',
  }));
  const right = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-2',
    amount: '150',
    date: '2024-03-08',
    source_platform: 'Bloomerang',
    raw_fund: '',
  }));

  const result = scoreDonorDuplicateSignalPair(left, right, 'John Smith', 'John Smith');
  assert.equal(result.score, 0);
  assert.deepEqual(result.matchedFields, []);
});

test('does not flag same donor when amount and date both conflict even with strong context', () => {
  const left = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-1',
    amount: '100',
    date: '2024-03-01',
    raw_fund: 'Annual Fund',
    raw_appeal: 'Spring',
    source_platform: 'GiveButter',
  }));
  const right = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-2',
    amount: '150',
    date: '2024-03-05',
    raw_fund: 'Annual Fund',
    raw_appeal: 'Spring',
    source_platform: 'GiveButter',
  }));

  const result = scoreDonorDuplicateSignalPair(left, right, 'John Smith', 'John Smith');
  assert.equal(result.score, 0);
  assert.deepEqual(result.matchedFields, []);
});

test('treats same email + same amount + same tx date as a review candidate without transaction_id', () => {
  const left = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-1',
    raw_fund: '',
    raw_appeal: '',
  }));
  const right = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-2',
    entity_name: 'Jane Smith',
    source_platform: 'Bloomerang',
    raw_fund: '',
    raw_appeal: '',
  }));

  const result = scoreDonorDuplicateSignalPair(left, right, 'John Smith', 'Jane Smith', 'john@example.com', 'john+import@example.com');
  assert.equal(result.score, 100);
  assert.ok(result.matchedFields.includes('amount'));
  assert.ok(result.matchedFields.includes('tx_date'));
  assert.ok(result.matchedFields.includes('email'));
});

test('does not flag same amount and date when names and emails both differ', () => {
  const left = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-1',
    raw_fund: 'Annual Fund',
    raw_appeal: 'Spring',
  }));
  const right = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-2',
    entity_name: 'Taylor Gonzales',
    raw_fund: 'Annual Fund',
    raw_appeal: 'Spring',
  }));

  const result = scoreDonorDuplicateSignalPair(
    left,
    right,
    'Monique Bryant',
    'Taylor Gonzales',
    'monique@example.com',
    'taylor@example.com',
  );
  assert.equal(result.score, 0);
  assert.deepEqual(result.matchedFields, []);
});

test('extracts donor amount and date from common raw aliases when canonical fields are empty', () => {
  const result = extractDonorDuplicateSignalFromRow(donorRow({
    amount: '',
    date: '',
    rawValues: {
      'Gross Amount': '$125.50',
      'Created At': '2025-03-14T10:22:00Z',
      'Campaign Name': 'Spring Appeal',
    },
  }));

  assert.equal(result.amount, 125.5);
  assert.equal(result.date, '2025-03-14');
  assert.equal(result.fund, 'annual fund');
});

test('extracts donor transaction reference from broader payment aliases', () => {
  const result = extractDonorDuplicateSignalFromRow(donorRow({
    rawValues: {
      'Charge ID': 'ch_12345',
    },
  }));

  assert.equal(result.transactionRef, 'ch12345');
});

test('falls back to heuristic title detection for unfamiliar amount and date headers', () => {
  const result = extractDonorDuplicateSignalFromRow(donorRow({
    amount: '',
    date: '',
    rawValues: {
      'Net Proceeds USD': '$88.10',
      'Processed At PST': '2025-01-09 13:45:00',
    },
  }));

  assert.equal(result.amount, 88.1);
  assert.equal(result.date, '2025-01-09');
});

test('falls back to heuristic title detection for unfamiliar transaction reference headers', () => {
  const result = extractDonorDuplicateSignalFromRow(donorRow({
    rawValues: {
      'Gateway Reference': 'gw_ref_9988',
    },
  }));

  assert.equal(result.transactionRef, 'gwref9988');
});

test('does not treat missing amount and date as a transaction duplicate without tx reference', () => {
  const left = extractDonorDuplicateSignalFromRow(donorRow({
    amount: '',
    date: '',
    raw_fund: 'Annual Fund',
    raw_appeal: 'Spring',
    source_platform: 'GiveButter',
  }));
  const right = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-2',
    amount: '',
    date: '',
    raw_fund: 'Annual Fund',
    raw_appeal: 'Spring',
    source_platform: 'GiveButter',
  }));

  const result = scoreDonorDuplicateSignalPair(left, right, 'John Smith', 'John Smith');
  assert.equal(result.score, 0);
  assert.deepEqual(result.matchedFields, []);
});

test('does not review missing amount and date with only one weak supporting signal', () => {
  const left = extractDonorDuplicateSignalFromRow(donorRow({
    amount: '',
    date: '',
    raw_fund: 'Annual Fund',
    raw_appeal: '',
    source_platform: 'GiveButter',
  }));
  const right = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-2',
    amount: '',
    date: '',
    raw_fund: 'Annual Fund',
    raw_appeal: '',
    source_platform: 'Bloomerang',
  }));

  const result = scoreDonorDuplicateSignalPair(left, right, 'John Smith', 'John Smith');
  assert.equal(result.score, 0);
  assert.deepEqual(result.matchedFields, []);
});

test('does not flag same donor/date/email when one side is missing amount and there is no tx reference', () => {
  const left = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-1',
    amount: '250',
    date: '2021-12-15',
    source_file: 'Source_A_Givebutter.csv',
    raw_fund: '',
    raw_appeal: '',
  }));
  const right = extractDonorDuplicateSignalFromRow(donorRow({
    source_row_ref: 'row-2',
    amount: '',
    date: '2021-12-15',
    source_file: 'Source_B_CRM.csv',
    raw_fund: '',
    raw_appeal: '',
  }));

  const result = scoreDonorDuplicateSignalPair(
    left,
    right,
    'John Smith',
    'John Smith',
    'john.smith@gmail.com',
    'john.smith@gmail.com',
  );

  assert.equal(result.score, 0);
  assert.deepEqual(result.matchedFields, []);
});
