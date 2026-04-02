import { describe, expect, it } from 'vitest';
import { buildAppendColumnDecisions } from '../merge-table';

describe('buildAppendColumnDecisions', () => {
  it('merges exact header matches automatically', () => {
    const decisions = buildAppendColumnDecisions(['Email', 'First Name'], ['Email'], 'upload.csv');
    expect(decisions[0]).toMatchObject({
      matchType: 'exact',
      action: 'merge',
      targetHeader: 'Email',
    });
  });

  it('merges alias header matches automatically', () => {
    const decisions = buildAppendColumnDecisions(['Email'], ['emailaddress'], 'upload.csv');
    expect(decisions[0]).toMatchObject({
      matchType: 'alias',
      action: 'merge',
      targetHeader: 'Email',
    });
  });

  it('keeps high-confidence fuzzy matches separate for review', () => {
    const decisions = buildAppendColumnDecisions(['Gift Amount'], ['Amount Gift'], 'upload.csv');
    expect(decisions[0]).toMatchObject({
      matchType: 'fuzzy',
      action: 'keep_separate',
      targetHeader: 'Gift Amount',
    });
  });
});
