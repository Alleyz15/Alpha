// Sizing is pinned. Do not "improve" it without reading this.
//
// ===========================================================================
// THESE NUMBERS ARE A CONTRACT, NOT A SNAPSHOT.
// ===========================================================================
//
// Four assets - ETH, BTC, SOL, BNB - have real on-chain fills behind them.
// This file pins what sizePosition() produces for each, against real orders
// captured from the live book on 2 Sep 2026. If any figure moves by a single
// raw unit, the four assets that demonstrably work have changed behaviour.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS, for whoever finds it next.
// ---------------------------------------------------------------------------
//
// AVAX and XRP fail to fill at most sizes. On 2 Sep we investigated adding
// them and found:
//
//   - the orders ARE on the book, buy-side, single-leg, below spot
//   - the multi-leg filter is not excluding them
//   - the failure is a custom revert, 0xad4c3ef7, carrying two arguments that
//     differ by exactly one
//   - it is SIZE-dependent AND ORDER-dependent: two AVAX orders with identical
//     contract counts, one fills and one reverts
//
// Three mechanisms were proposed and all three were disproved by measurement:
//
//   1. "the premium rounds the wrong way"    ceil and floor give IDENTICAL
//                                            fill rates
//   2. "contracts x price must divide 1e8"   fits 16/16 samples of one XRP
//                                            order, fails on ETH
//   3. "recomputed contracts must equal      ETH is off by 1 and FILLS; AVAX
//       what we asked"                       is off by 28 and REVERTS
//
// So the condition is not understood. A fix would be a guess, and a guess here
// changes the sizing of four assets that currently work in exchange for two
// that nobody has asked for.
//
// IF YOU ARE HERE TO FINISH THAT WORK: find out what 0xad4c3ef7 is first, from
// the OptionBook source. Then change sizing, then run this file. If any
// assertion below fails, the change is not safe regardless of how well it
// works for AVAX and XRP.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sizePosition, unitsToContractsRaw } from '../src/thetanuts/sizing.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(path.join(here, 'fixtures', 'sizingBaseline.json'), 'utf8'));

/**
 * Rehydrate a captured order: JSON has no bigints.
 *
 * Numeric strings become bigints, everything else is passed through -
 * addresses and booleans must stay as they are, and rawApiData is needed
 * because calculateMaxContracts reads it.
 */
const NUMERIC = /^\d+$/;
const toBig = (v) => (typeof v === 'string' && NUMERIC.test(v) ? BigInt(v) : v);

function rehydrate(f) {
  const order = {};
  for (const [k, v] of Object.entries(f.order)) {
    order[k] = Array.isArray(v) ? v.map(toBig) : toBig(v);
  }
  return {
    order,
    availableAmount: BigInt(f.availableAmount),
    rawApiData: f.rawApiData,
  };
}

test('the fixtures cover all four shipped assets', () => {
  assert.deepEqual(fixtures.map((f) => f.asset).sort(), ['BNB', 'BTC', 'ETH', 'SOL']);
});

for (const f of fixtures) {
  test(`${f.asset}: contract count is unchanged`, () => {
    const result = sizePosition(rehydrate(f), { units: f.units, maxPremiumUsdc: 5 });

    assert.equal(
      String(result.contractsRaw), f.expect.contractsRaw,
      `${f.asset} contract count moved. Four assets have real fills behind them; ` +
      'a change here is a regression regardless of what it fixes elsewhere.',
    );
  });

  test(`${f.asset}: premium is unchanged`, () => {
    const result = sizePosition(rehydrate(f), { units: f.units, maxPremiumUsdc: 5 });

    assert.equal(
      String(result.premiumRaw), f.expect.premiumRaw,
      `${f.asset} premium moved. This is what a user is quoted and charged.`,
    );
  });

  test(`${f.asset}: the binding constraint is unchanged`, () => {
    // Which limit bound the size is part of the behaviour: a change from
    // 'requested' to 'premiumCap' means the user silently got less than they
    // asked for, even if the number happens to look reasonable.
    const result = sizePosition(rehydrate(f), { units: f.units, maxPremiumUsdc: 5 });
    assert.equal(result.boundBy, f.expect.boundBy);
  });
}

test('the premium is still floor(contracts x price / 1e8)', () => {
  // The formula itself, stated independently of the captured values, so a
  // change to premiumRawFor fails here even if someone regenerates the
  // fixtures. Rounding UP was tested against the live book and changes nothing
  // about which orders fill - so a switch to ceil would be churn on the money
  // path with no benefit.
  for (const f of fixtures) {
    const order = rehydrate(f);
    const result = sizePosition(order, { units: f.units, maxPremiumUsdc: 5 });
    const expected = (result.contractsRaw * order.order.price) / 100000000n;

    assert.equal(result.premiumRaw, expected, `${f.asset}: premium formula changed`);
  }
});

test('units convert to contracts at 6dp, unchanged', () => {
  // The other half of the sizing arithmetic, and the one a scale bug would hit.
  assert.equal(unitsToContractsRaw(0.15), 150000n);
  assert.equal(unitsToContractsRaw(0.002), 2000n);
  assert.equal(unitsToContractsRaw(1), 1000000n);
  assert.equal(unitsToContractsRaw(15), 15000000n);
});
