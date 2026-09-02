// Decimal conversion tests (BUILD_PLAN.md §10 — "decimal conversion, both
// directions. This is where silent 100x errors live.").
//
// Pure and offline: none of the conversions under test touch the chain.
// decimals.js imports the shared SDK client, which builds a provider from
// THETANUTS_RPC_URL, so a dummy value is set before importing — the provider is
// lazy and never connects, and the utils called here are pure arithmetic.
//
//   npm test        (from backend/)

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.THETANUTS_RPC_URL ??= 'http://localhost:0';

const { DECIMALS, toPayoutContracts, payoutToUsdc, toHumanOrder } =
  await import('../src/thetanuts/decimals.js');

test('DECIMALS pins the scales the three traps depend on', () => {
  assert.equal(DECIMALS.PRICE, 8);             // premium is 8dp, not USDC's 6 (trap 1)
  assert.equal(DECIMALS.USDC, 6);
  assert.equal(DECIMALS.ORDER_CONTRACTS, 6);   // Order.numContracts (trap 2)
  assert.equal(DECIMALS.PAYOUT_CONTRACTS, 18); // the payout helpers' argument (trap 2)
});

test('toPayoutContracts rescales 6dp -> 18dp (the 10^12 boundary)', () => {
  // One contract is 1e6 at the order's scale; at the payout helper's scale it
  // must be 1e18. Passing the 6dp value straight in is the 10^12 error.
  assert.equal(toPayoutContracts(1_000_000n), 10n ** 18n);
  assert.equal(toPayoutContracts(0n), 0n);
});

test('toPayoutContracts refuses a non-bigint', () => {
  assert.throws(() => toPayoutContracts(1_000_000), TypeError);
});

test('payoutToUsdc reads a payout-helper result at 6dp', () => {
  assert.equal(payoutToUsdc(1_000_000n), 1);              // 1.000000 USDC
  assert.equal(payoutToUsdc(1_159_415_079_500n), 1_159_415.0795);
});

test('toHumanOrder converts at the right scales — premium is 8dp (trap 1)', () => {
  const orderWithSig = {
    order: {
      strikePrice: 232_000_000_000n,  // $2,320 at 8dp
      price: 214_908_926n,            // $2.14908926 at 8dp — NOT 6dp
      expiry: 1_788_076_800n,
      numContracts: 4_303_987_819n,
    },
    availableAmount: 10_000_000_000n, // 10,000 USDC at 6dp
    rawApiData: { isCall: false, priceFeed: '0xabc' },
  };

  const h = toHumanOrder(orderWithSig);
  assert.equal(h.strike, 2320);
  // /1e6 would give 214.9 — the 100x error the trap exists to prevent.
  assert.equal(h.premiumPerContract, 2.14908926);
  assert.equal(h.availableCollateralUsdc, 10000);
  assert.equal(h.isPut, true);
  assert.equal(h.raw, orderWithSig);          // original kept for lossless storage
});

test('toHumanOrder rejects string on-chain fields (rawApiData trap 3)', () => {
  // rawApiData carries string copies; a string skips scaling silently in some
  // SDK helpers, so the wrong type is refused at the boundary instead.
  const bad = {
    order: { strikePrice: '232000000000', price: 1n, expiry: 1n, numContracts: 1n },
    availableAmount: 1n,
    rawApiData: { isCall: false },
  };
  assert.throws(() => toHumanOrder(bad), TypeError);
});
