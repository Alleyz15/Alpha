// The repayment estimate, pinned against the backend's own formula.
//
// `estimateRepayment` is a SECOND implementation of money arithmetic whose
// authority is `amountOwed()` in backend/src/lending/repay.js:108-113. It
// exists because the cost has to be shown before a loan exists, which the
// backend cannot do. These tests restate the backend formula independently -
// including the ceil - so the two cannot drift apart silently.

import { describe, expect, it } from 'vitest';
import { estimateRepayment, buildLoanRows, formatUsdcPrecise } from './lendingViewModel.js';

/** The backend's arithmetic, written out again from repay.js. */
function backendAmountOwed(principalUsdc, annualRatePct, termDays) {
  const interestUsdc = principalUsdc * (annualRatePct / 100) * (termDays / 365);
  const totalUsdc = principalUsdc + interestUsdc;
  return Number(BigInt(Math.ceil(totalUsdc * 1e6))) / 1e6;
}

const offer = { annualRatePct: 5, termDays: 0.8 };

describe('estimateRepayment', () => {
  it('matches the backend formula across a range of amounts', () => {
    for (const principal of [1, 5, 50, 257.237755, 1000]) {
      const estimate = estimateRepayment(offer, principal);
      expect(estimate.totalUsdc).toBe(backendAmountOwed(principal, 5, 0.8));
    }
  });

  it('rounds the total UP to the micro-unit, never down', () => {
    // repay.js uses Math.ceil deliberately: a borrower who sends the
    // rounded-down figure is a fraction short, and the repayment check
    // compares against what is owed. Rounding down here would show a figure
    // that fails verification.
    const principal = 50;
    const exact = 50 + 50 * 0.05 * (0.8 / 365);   // 50.005479452...
    const estimate = estimateRepayment(offer, principal);

    expect(estimate.totalUsdc).toBe(50.00548);
    expect(estimate.totalUsdc).toBeGreaterThan(exact);
    expect(estimate.totalUsdc).not.toBe(Math.floor(exact * 1e6) / 1e6);
  });

  it('carries the rate and term it used, so the figure can be checked', () => {
    const estimate = estimateRepayment(offer, 50);
    expect(estimate.annualRatePct).toBe(5);
    expect(estimate.termDays).toBe(0.8);
    expect(estimate.interestUsdc).toBeCloseTo(0.005479, 6);
  });

  it('returns null rather than a number it cannot stand behind', () => {
    // Null is rendered as nothing at all. A zero would look like a real
    // estimate of a real amount.
    expect(estimateRepayment(offer, '')).toBeNull();
    expect(estimateRepayment(offer, 0)).toBeNull();
    expect(estimateRepayment(offer, -5)).toBeNull();
    expect(estimateRepayment(offer, 'abc')).toBeNull();
    expect(estimateRepayment(null, 50)).toBeNull();
    expect(estimateRepayment({ annualRatePct: 5 }, 50)).toBeNull();      // no term
    expect(estimateRepayment({ termDays: 0.8 }, 50)).toBeNull();         // no rate
  });

  it('accepts a zero rate and a zero term without inventing interest', () => {
    expect(estimateRepayment({ annualRatePct: 0, termDays: 0.8 }, 50).totalUsdc).toBe(50);
    expect(estimateRepayment({ annualRatePct: 5, termDays: 0 }, 50).totalUsdc).toBe(50);
  });
});

describe('buildLoanRows collateral', () => {
  const loan = { loanId: 'l1', positionId: 'p1', status: 'active', principalUsdc: 5, owed: null };
  const position = { positionId: 'p1', asset: 'ETH', protectionFloorUsdc: 2360 };

  it('names the protection by asset and floor', () => {
    const [row] = buildLoanRows([loan], [position]);
    expect(row.collateralLabel).toBe('ETH · $2,360.00 USDC floor');
  });

  it('is null when the position is not in hand, so the caller can offer a plain link', () => {
    expect(buildLoanRows([loan], [])[0].collateralLabel).toBeNull();
    expect(buildLoanRows([{ ...loan, positionId: null }], [position])[0].collateralLabel).toBeNull();
  });

  it('falls back to the symbol alone when the floor is missing', () => {
    const [row] = buildLoanRows([loan], [{ ...position, protectionFloorUsdc: null }]);
    expect(row.collateralLabel).toBe('ETH');
  });
});

describe('formatUsdcPrecise', () => {
  it('keeps a sub-cent amount visible instead of rounding it to nothing', () => {
    // The whole reason it exists: 2dp turns the interest on a two-day loan
    // into $0.00, which reads as "no interest" rather than "a small one".
    expect(formatUsdcPrecise(0.0019)).toBe('$0.0019 USDC');
    expect(formatUsdcPrecise(0.000547)).toBe('$0.000547 USDC');
  });

  it('still looks like money for ordinary amounts', () => {
    expect(formatUsdcPrecise(50)).toBe('$50.00 USDC');
    expect(formatUsdcPrecise(1234.5)).toBe('$1,234.50 USDC');
  });

  it('never shows more precision than USDC has', () => {
    // 6 decimals is the token's own precision; anything finer is invented.
    expect(formatUsdcPrecise(0.0000001)).toBe('$0.00 USDC');
    expect(formatUsdcPrecise(0.1234567)).toBe('$0.123457 USDC');
  });

  it('returns null for anything it cannot format', () => {
    expect(formatUsdcPrecise(null)).toBeNull();
    expect(formatUsdcPrecise(undefined)).toBeNull();
    expect(formatUsdcPrecise('')).toBeNull();
    expect(formatUsdcPrecise('abc')).toBeNull();
  });
});
