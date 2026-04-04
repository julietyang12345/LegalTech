import test from 'node:test';
import assert from 'node:assert/strict';
import { TransformHubIdentityService } from '../transformhub-identity.service';

function createService(aiEnabled = false) {
  return new TransformHubIdentityService(
    {} as any,
    {} as any,
    {} as any,
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
