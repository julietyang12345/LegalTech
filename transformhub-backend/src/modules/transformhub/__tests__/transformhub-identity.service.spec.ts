import test from 'node:test';
import assert from 'node:assert/strict';
import { TransformHubIdentityService } from '../transformhub-identity.service';

function createService(aiEnabled = false) {
  const repo = {
    create: (value: any) => value,
    save: async (value: any) => value,
    find: async () => [],
    findOne: async () => null,
  };
  return new TransformHubIdentityService(
    repo as any,
    repo as any,
    repo as any,
    {
      isEnabled: aiEnabled,
      suggestHouseholdMatch: async () => ({ confidence: 'review' }),
    } as any,
  );
}

test('creates household review suggestions when AI is disabled for surname+zip matches', async () => {
  const service = createService(false);
  const persons = [
    {
      id: 'P-1',
      firstName: 'John',
      lastName: 'Smith',
      phone: '555-111-2222',
      email: 'john@example.com',
      addressLine1: '123 Main St',
      zip: '94107',
      city: 'San Francisco',
      state: 'CA',
    },
    {
      id: 'P-2',
      firstName: 'Jane',
      lastName: 'Smith',
      phone: '555-111-2222',
      email: 'jane@example.com',
      addressLine1: '456 Oak Ave',
      zip: '94107',
      city: 'San Francisco',
      state: 'CA',
    },
  ];

  const result = await service.resolveHouseholds(persons);
  assert.equal(result.households.length, 0);
  assert.equal(result.reviewSuggestions.length, 1);
  assert.deepEqual(result.reviewSuggestions[0].proposedMemberIds.sort(), ['P-1', 'P-2']);
  assert.equal(result.reviewSuggestions[0].aiSuggestion, null);
});

test('does not flag same-name donor rows during donor identity cleanup', async () => {
  const service = createService(false);
  const rows = [
    {
      source_row_ref: 'row-1',
      source_platform: 'GiveButter',
      entity_name: 'Jennifer Singh',
      firstName: 'Jennifer',
      lastName: 'Singh',
      date: '2025-07-02',
      amount: '35',
      email: 'jennifer@example.com',
      rawValues: { transaction_id: 'GTX-001' },
    },
    {
      source_row_ref: 'row-2',
      source_platform: 'Bloomerang',
      entity_name: 'Jennifer Singh',
      firstName: 'Jennifer',
      lastName: 'Singh',
      date: '2025-12-21',
      amount: '52.5',
      email: '',
      rawValues: { transaction_id: 'BTX-999' },
    },
  ];

  const result = await service.resolvePersons(rows, [], {
    baselinePlatform: 'mixed',
    baselineFileClass: 'donor',
    forceReviewOnAutoMatches: true,
    persistIdentityMemory: false,
    includeAiSuggestions: false,
  });

  assert.equal(result.matchMode, 'identity');
  assert.equal(result.needsReview, 0);
  assert.ok(result.txDuplicateResult);
  assert.equal(result.txDuplicateResult.matchMode, 'transaction');
  assert.equal(result.txDuplicateResult.separated, 2);
});

test('flags donor alias cleanup only for different names with strong identity signals', async () => {
  const service = createService(false);
  const rows = [
    {
      source_row_ref: 'row-1',
      source_platform: 'GiveButter',
      entity_name: 'Monique Bryant',
      firstName: 'Monique',
      lastName: 'Bryant',
      email: 'monique@example.com',
      phone: '555-111-2222',
      address: '123 Main St',
      postalCode: '94107',
      rawValues: { transaction_id: 'GTX-001' },
    },
    {
      source_row_ref: 'row-2',
      source_platform: 'Bloomerang',
      entity_name: 'Monica Bryant',
      firstName: 'Monica',
      lastName: 'Bryant',
      email: 'monique@example.com',
      phone: '555-111-2222',
      address: '123 Main St',
      postalCode: '94107',
      rawValues: { transaction_id: 'BTX-999' },
    },
  ];

  const result = await service.resolvePersons(rows, [], {
    baselinePlatform: 'mixed',
    baselineFileClass: 'donor',
    forceReviewOnAutoMatches: true,
    persistIdentityMemory: false,
    includeAiSuggestions: false,
  });

  assert.equal(result.matchMode, 'identity');
  assert.equal(result.needsReview, 1);
  assert.equal(result.duplicateClassCounts.likely_match, 1);
  assert.ok(result.matches.some((match: any) => match.matchedFields.includes('name_variant')));
});

test('does not flag household members with different first names as donor aliases', async () => {
  const service = createService(false);
  const rows = [
    {
      source_row_ref: 'row-1',
      source_platform: 'Bloomerang',
      entity_name: 'Teresa Williams',
      firstName: 'Teresa',
      lastName: 'Williams',
      email: 'wendy38@brown.biz',
      address: '60895 Kristie Estate',
      postalCode: '79612',
    },
    {
      source_row_ref: 'row-2',
      source_platform: 'Bloomerang',
      entity_name: 'Ronald Williams',
      firstName: 'Ronald',
      lastName: 'Williams',
      email: 'wendy38@brown.biz',
      address: '60895 Kristie Estate',
      postalCode: '79612',
    },
  ];

  const result = await service.resolvePersons(rows, [], {
    baselinePlatform: 'mixed',
    baselineFileClass: 'donor',
    forceReviewOnAutoMatches: true,
    persistIdentityMemory: false,
    includeAiSuggestions: false,
  });

  assert.equal(result.needsReview, 0);
  assert.equal(result.duplicateClassCounts.likely_match, 0);
});
