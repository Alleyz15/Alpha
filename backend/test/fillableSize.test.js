// Probing for a size the chain will accept.
//
// The behaviour worth protecting is not the arithmetic - it is the refusals.
// This module exists because some orders reject sizes for reasons we could not
// establish, so the rules it must never break are:
//
//   never quote a size that failed its probe
//   never round up
//   never silently reduce
//   never blame the market for our own allowance
//
// The probe AND the spend capacity are injected, so all of this is testable
// without a network. Capacity is passed explicitly in every test below - a test
// that omitted it would exercise the unreadable-capacity path by accident and
// pass for the wrong reason.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateSizes, findFillableSize } from '../src/thetanuts/fillableSize.js';

const ONE = 1_000_000n;

/**
 * Spend capacity that binds nothing, so the probe alone decides.
 *
 * A million USDC: far above any premium these orders produce, which is the
 * point - it takes the wallet out of the question.
 */
const UNLIMITED = { capacityRaw: 1_000_000_000_000n, allowanceRaw: 1_000_000_000_000n, balanceRaw: 1_000_000_000_000n, owner: '0xtest' };

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
  const r = await findFillableSize(o, { units: 5 }, { capacity: UNLIMITED, probe: accepting(5n * ONE) });

  assert.equal(r.contractsRaw, 5n * ONE);
  assert.equal(r.adjusted, false, 'nothing was reduced');
});

test('the LARGEST acceptable size is chosen, not the first found', async () => {
  const o = order();
  // 3 and 1 both fill; 3 must win.
  const r = await findFillableSize(o, { units: 5 }, { capacity: UNLIMITED, probe: accepting(3n * ONE, 1n * ONE) });

  assert.equal(r.contractsRaw, 3n * ONE);
  assert.equal(r.adjusted, true);
  assert.equal(r.requestedUnits, 5);
  assert.equal(r.actualUnits, 3);
});

test('null when nothing fills — never a fallback to the computed size', async () => {
  // The single most important property. Returning the computed size here would
  // move the revert to after the user confirmed.
  const o = order();
  const r = await findFillableSize(o, { units: 5 }, { capacity: UNLIMITED, probe: async () => false });

  assert.equal(r, null);
});

test('a probe that throws counts as a refusal, not a crash', async () => {
  const o = order();
  const r = await findFillableSize(o, { units: 5 }, {
    capacity: UNLIMITED,
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
  const full = await findFillableSize(o, { units: 5 }, { capacity: UNLIMITED, probe: accepting(5n * ONE) });
  const cut = await findFillableSize(o, { units: 5 }, { capacity: UNLIMITED, probe: accepting(2n * ONE) });

  assert.equal(cut.size.contractsRaw, cut.contractsRaw, 'size matches the chosen count');
  assert.equal(cut.size.premiumRaw, cut.premiumRaw);
  assert.ok(cut.size.maxPayoutUsdc < full.size.maxPayoutUsdc, 'payout scaled down with it');
  assert.equal(cut.size.protectedUnits, 2);
});

test('a reduction is always reported, so it cannot be applied silently', async () => {
  const o = order();
  const r = await findFillableSize(o, { units: 5 }, { capacity: UNLIMITED, probe: accepting(4n * ONE) });

  assert.equal(r.adjusted, true);
  assert.notEqual(r.requestedUnits, r.actualUnits);
});

test('a zero-unit request is refused rather than probed', async () => {
  const o = order();
  let probed = false;
  await assert.rejects(
    () => findFillableSize(o, { units: 0 }, { capacity: UNLIMITED, probe: async () => { probed = true; return true; } }),
    RangeError,
  );
  assert.equal(probed, false);
});

// --- the simulator's own limits, kept out of the market's mouth -------------

test('a premium above the wallet allowance is a shortfall, NOT a reduction', async () => {
  // The confound this gate exists for, in the shape it was measured in:
  // 3 contracts at a premium of 3 USDC against an allowance of 2.
  // price 1e8 at 8dp is exactly 1 USDC per contract, so 3 contracts cost 3.
  const o = order({ price: 100_000_000n });
  let probed = false;
  const r = await findFillableSize(o, { units: 3 }, {
    capacity: { capacityRaw: 2_000_000n, allowanceRaw: 2_000_000n, balanceRaw: 9_000_000n, owner: '0xtest' },
    probe: async () => { probed = true; return false; },
  });

  assert.equal(probed, false, 'nothing is probed that the wallet could not pay for');
  assert.equal(r.actualUnits, 3, 'the requested size STANDS - it was never tested');
  assert.equal(r.adjusted, false, 'and is not reported as a market reduction');
  assert.equal(r.verified, false);
  assert.equal(r.unverified.reason, 'operator_spend_capacity');
  assert.equal(r.unverified.shortfallUsdc, 1);
  assert.equal(r.unverified.boundBy, 'allowance', 'the remedy is scripts/approve.js');
});

test('a short BALANCE is named as a balance, not an allowance', async () => {
  // Different limit, different fix. Sending someone to top up an approval when
  // the wallet is simply empty wastes the only person who can act.
  const o = order({ price: 100_000_000n });
  const r = await findFillableSize(o, { units: 3 }, {
    capacity: { capacityRaw: 1_000_000n, allowanceRaw: 9_000_000n, balanceRaw: 1_000_000n, owner: '0xtest' },
    probe: async () => true,
  });

  assert.equal(r.unverified.boundBy, 'balance');
});

test('an unreadable capacity does not probe and does not reduce', async () => {
  // Unknown is not zero and it is not unlimited. Probing on an unknown capacity
  // is exactly the mistake this gate was added to stop.
  const o = order();
  let probed = false;
  const r = await findFillableSize(o, { units: 5 }, {
    capacity: { capacityRaw: null, allowanceRaw: null, balanceRaw: null, owner: null },
    probe: async () => { probed = true; return false; },
  });

  assert.equal(probed, false);
  assert.equal(r.actualUnits, 5);
  assert.equal(r.verified, false);
  assert.equal(r.unverified.reason, 'capacity_unreadable');
  assert.equal(r.unverified.availableUsdc, null, 'no number is invented for what was not read');
});

test('a size the chain accepted is marked verified', async () => {
  const o = order();
  const r = await findFillableSize(o, { units: 5 }, { capacity: UNLIMITED, probe: accepting(5n * ONE) });

  assert.equal(r.verified, true);
  assert.equal(r.unverified, null);
});

test('a market refusal is still a refusal when the wallet could afford it', async () => {
  // The gate must not turn "nothing fills" into a soft pass. With capacity to
  // spare, a probe that refuses everything still returns null.
  const o = order();
  const r = await findFillableSize(o, { units: 5 }, { capacity: UNLIMITED, probe: async () => false });

  assert.equal(r, null);
});
