// quoteVault's refusal when the book has nothing to buy.
//
// The two live-book reads (getSpotPrice, getBuyableCallOrders) are injected, so
// this exercises the real function offline. The property under test is narrow
// and specific: when there is no above-spot buyable call, the thrown error
// carries `code: 'NO_BUYABLE_CALLS'` rather than being a bare Error - which is
// what lets the API layer answer 409 with a usable reason instead of a generic
// 502 "unknown error".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteVault } from '../src/vault/vault.js';

/**
 * A call order in the shape toHumanOrder expects: bigint fields on `.order`,
 * bigint `availableAmount`, and `rawApiData.isCall`.
 */
function callOrder(strikeUsd) {
  const strike8dp = BigInt(Math.round(strikeUsd * 1e8));
  return {
    order: {
      strikePrice: strike8dp,
      price: 1_000_000n,
      expiry: BigInt(Math.floor(Date.now() / 1000) + 2 * 86_400),
      numContracts: 0n,
    },
    availableAmount: 1_000_000n,
    rawApiData: { isCall: true },
  };
}

test('an empty book throws NO_BUYABLE_CALLS, not a bare Error', async () => {
  await assert.rejects(
    () => quoteVault(
      { asset: 'ETH', principalUsdc: 3 },
      { getSpotPrice: async () => 2500, getBuyableCallOrders: async () => [] },
    ),
    (error) => {
      assert.equal(error.code, 'NO_BUYABLE_CALLS');
      assert.equal(error.asset, 'ETH');
      assert.match(error.message, /no buyable ETH calls above spot/);
      return true;
    },
  );
});

test('a non-empty book with every call at or below spot also throws NO_BUYABLE_CALLS', async () => {
  // rawCalls is not empty - toHumanOrder runs on each - but none is above spot,
  // so `above` is empty and the same coded refusal fires.
  await assert.rejects(
    () => quoteVault(
      { asset: 'BTC', principalUsdc: 3 },
      {
        getSpotPrice: async () => 80_000,
        getBuyableCallOrders: async () => [callOrder(75_000), callOrder(80_000)],
      },
    ),
    (error) => {
      assert.equal(error.code, 'NO_BUYABLE_CALLS');
      assert.equal(error.asset, 'BTC');
      return true;
    },
  );
});
