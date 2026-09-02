import { describe, expect, it } from 'vitest';
import { formatUsdc, getPremiumPresentation } from './usdc.js';

describe('USDC presentation', () => {
  it.each([null, undefined, '', Number.NaN, Number.POSITIVE_INFINITY])(
    'keeps missing or invalid value %s out of the formatter output',
    (value) => expect(formatUsdc(value)).toBeNull(),
  );

  it('preserves a real zero value', () => {
    expect(formatUsdc(0)).toBe('$0.00 USDC');
  });

  it.each([
    ['paid', 1.25, '$1.25 USDC'],
    ['paid', null, '—'],
    ['held', 1.25, 'Funds held'],
    ['refunded', 1.25, 'Refunded'],
    ['none', 1.25, '—'],
    [null, 1.25, '—'],
  ])('presents %s from the single payment-status contract', (status, amount, expected) => {
    expect(getPremiumPresentation(status, amount)).toBe(expected);
  });
});
