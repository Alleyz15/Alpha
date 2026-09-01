// Vault maturity arithmetic (8.6).
//
// The promise is that the principal comes back WHOLE. Everything here tests
// that, because it is the only claim the product makes about this product.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMaturity } from '../src/vault/maturity.js';

const vault = { id: 'v1', principal: 3 };

test('a zero payout still returns the whole principal', () => {
  // The expected case: the call was bought above spot and finished below it.
  const m = computeMaturity(vault, 0);
  assert.equal(m.principalUsdc, 3);
  assert.equal(m.payoutUsdc, 0);
  assert.equal(m.totalUsdc, 3);
});

test('a payout is added to the principal, never substituted for it', () => {
  const m = computeMaturity(vault, 0.7062);
  assert.equal(m.totalUsdc, 3.7062);
  assert.ok(m.totalUsdc > m.principalUsdc);
});

test('the return is never less than the principal, at any payout', () => {
  for (const payout of [0, 0.000001, 0.5, 1, 12.3456789]) {
    const m = computeMaturity(vault, payout);
    assert.ok(m.totalUsdc >= 3, `payout ${payout} returned ${m.totalUsdc}`);
  }
});

test('rounding goes up, so a depositor is never short a micro-unit', () => {
  // 3 + 0.0000005 would round DOWN to 3.000000 under nearest-rounding.
  const m = computeMaturity(vault, 0.0000005);
  assert.equal(m.totalRaw, 3000001n);
  assert.ok(m.totalUsdc > 3);
});

test('the raw amount is a bigint at USDC scale', () => {
  const m = computeMaturity(vault, 0.5);
  assert.equal(typeof m.totalRaw, 'bigint');
  assert.equal(m.totalRaw, 3500000n);
});

test('a negative payout is refused rather than reducing the principal', () => {
  assert.throws(() => computeMaturity(vault, -1), RangeError);
  assert.throws(() => computeMaturity(vault, NaN), RangeError);
});

test('a missing payout is treated as zero, not as an error', () => {
  // A call that expired unused may report null rather than 0.
  assert.equal(computeMaturity(vault, null).totalUsdc, 3);
  assert.equal(computeMaturity(vault, undefined).totalUsdc, 3);
});

test('a vault with no principal is refused', () => {
  assert.throws(() => computeMaturity({ id: 'x', principal: 0 }, 0), /non-positive principal/);
});
