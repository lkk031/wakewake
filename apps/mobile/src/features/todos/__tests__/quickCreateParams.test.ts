import { describe, expect, it } from 'vitest';

import { normalizeQuickCreateDateParam } from '../quickCreateParams';

describe('quick create date parameter', () => {
  it('accepts a canonical calendar date', () => {
    expect(normalizeQuickCreateDateParam('2026-07-28')).toBe('2026-07-28');
    expect(normalizeQuickCreateDateParam('2028-02-29')).toBe('2028-02-29');
  });

  it.each([
    undefined,
    null,
    '',
    '2026-7-28',
    '2026-02-30',
    'not-a-date',
    ['2026-07-28'],
    ['2026-07-28', '2026-07-29'],
    20260728,
  ])('rejects an invalid date parameter: %j', (value) => {
    expect(normalizeQuickCreateDateParam(value)).toBeUndefined();
  });
});
