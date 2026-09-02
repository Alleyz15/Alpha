// Probing for a size the chain will accept.
//
// The behaviour worth protecting is not the arithmetic - it is the refusals.
// This module exists because some orders reject sizes for reasons we could not
// establish, so the rules it must never break are:
//
//   never quote a size that failed its probe
//   never round up
//   never silently reduce
//
// The probe is injected, so all of this is testable without a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateSizes, findFillableSize } from '../src/thetanuts/fillableSize.js';

const ONE = 1_000_000n;

/** A minimal order the real sizePosition() will accept. */
function order({ price = 1_000_000n, strike = 100_00000000n, available = 10_000_000_000n } = {}) {
  return {
    order: {
      price,
      strikePrice: strike,
      strikes: [strike],
      numContracts: 0n,
      optionType: 0,
      isBuyer: true,
    },
    availableAmount: available,
    rawApiData: { isCall: false, strikes: [String(strike)] },
  };
}

/** A probe that accepts only the listed contract counts. */
const accepting = (...allowed) => {
  const set = new Set(allowed.map(String));
  return async (o, premiumRaw) => {
    const contracts = (premiumRaw * 100_000_000n) / BigInt(o.order.price);
    return set.has(String(contracts));
  };
};

// --- candidates ------------------------------------------------------------

test('candidates step down in whole contracts, largest first', () => {
  const c = candidateSizes(5n * ONE);
  assert.equal(c[0], 5n * ONE);
  assert.equal(c[1], 4n * ONE);
  assert.ok(c.every((v, i) => i === 0 || v < c[i - 1]), 'strictly decreasing');
});

test('candidates never exceed the requested size', () => {
  const requested = 3n * ONE;
  for (const c of candidateSizes(requested)) {
    assert.ok(c <= requested, `${c} exceeds the requested ${requested}`);
  }
});

test('candidates stop at zero rather than going negative', () => {
  const c = candidateSizes(2n * ONE);
  assert.equal(c.length, 2);
  assert.ok(c.every((v) => v > 0n));
});

test('the candidate list is bounded', () => {
  assert.ok(candidateSizes(10_000n * ONE).length <= 25);
});

// --- finding a size --------------------------------------------------------

test('the requested size is used when the chain accepts it', async () => {
  const o = order();
  const r = await findFillableSize(o, { units: 5 }, { probe: accepting(5n * ONE) });

  assert.equal(r.contractsRaw, 5n * ONE);
  assert.equal(r.adjusted, false, 'nothing was reduced');
});

test('the LARGEST acceptable size is chosen, not the first found', async () => {
  const o = order();
  // 3 and 1 both fill; 3 must win.
  const r = await findFillableSize(o, { units: 5 }, { probe: accepting(3n * ONE, 1n * ONE) });

  assert.equal(r.contractsRaw, 3n * ONE);
  assert.equal(r.adjusted, true);
  assert.equal(r.requestedUnits, 5);
  assert.equal(r.actualUnits, 3);
});

test('null when nothing fills — never a fallback to the computed size', async () => {
  // The single most important property. Returning the computed size here would
  // move the revert to after the user confirmed.
  const o = order();
  const r = await findFillableSize(o, { units: 5 }, { probe: async () => false });

  assert.equal(r, null);
});

test('a probe that throws counts as a refusal, not a crash', async () => {
  const o = order();
  const r = await findFillableSize(o, { units: 5 }, {
    probe: async (_o, premiumRaw) => {
      const contracts = (premiumRaw * 100_000_000n) / 1_000_000n;
      if (contracts > 2n * ONE) throw new Error('rpc blew up');
      return contracts === 2n * ONE;
    },
  });

  assert.equal(r.contractsRaw, 2n * ONE);
});

test('the whole size is re-derived when reduced, not patched', async () => {
  // maxPayout and protectedUnits follow from the contract count. Carrying them
  // over from the requested size would show figures for a position the user is
  // not getting.
  const o = order();
  const full = await findFillableSize(o, { units: 5 }, { probe: accepting(5n * ONE) });
  const cut = await findFillableSize(o, { units: 5 }, { probe: accepting(2n * ONE) });

  assert.equal(cut.size.contractsRaw, cut.contractsRaw, 'size matches the chosen count');
  assert.equal(cut.size.premiumRaw, cut.premiumRaw);
  assert.ok(cut.size.maxPayoutUsdc < full.size.maxPayoutUsdc, 'payout scaled down with it');
  assert.equal(cut.size.protectedUnits, 2);
});

test('a reduction is always reported, so it cannot be applied silently', async () => {
  const o = order();
  const r = await findFillableSize(o, { units: 5 }, { probe: accepting(4n * ONE) });

  assert.equal(r.adjusted, true);
  assert.notEqual(r.requestedUnits, r.actualUnits);
});

test('a zero-unit request is refused rather than probed', async () => {
  const o = order();
  let probed = false;
  await assert.rejects(
    () => findFillableSize(o, { units: 0 }, { probe: async () => { probed = true; return true; } }),
    RangeError,
  );
  assert.equal(probed, false);
});
