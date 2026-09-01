// The no-liquidation comparison (7.5).
//
// The demonstration only works if the protected side survives a price the
// unprotected side does not. That holds when the debt is covered by the floor -
// which is what the revised BR-39 guarantees and what the original rule did not.
// Both cases are tested, because the first real loan was written under the old
// one and shows the failure on screen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stressLoan, crossoverPrice } from '../src/lending/stress.js';
import { creditLimitFor } from '../src/lending/credit.js';

// The real backing put: strike 2300, 1999 contracts -> floor 4.5977.
const position = {
  id: 'efa8d071-444c-46f5-a0e6-8b7915f6c778',
  asset: 'ETH',
  strike_raw: '230000000000',
  num_contracts_raw: '1999',
  expiry: '2026-09-03T08:00:00Z',
};

const disbursed = '2026-08-31T14:49:45Z';

/** A loan written under the revised rule: limit reserves its own interest. */
function newRuleLoan() {
  const limit = creditLimitFor(position, { annualRatePct: 5, now: new Date(disbursed) });
  return {
    id: 'new-rule',
    principal: limit.creditLimitUsdc,
    interest_rate: 5,
    created_at: disbursed,
    due_at: position.expiry,
    position_id: position.id,
  };
}

/** The loan that actually exists: lent the whole floor, charged interest on top. */
const oldRuleLoan = {
  id: 'old-rule',
  principal: 4.5977,
  interest_rate: 5,
  created_at: disbursed,
  due_at: position.expiry,
  position_id: position.id,
};

test('the unprotected side falls with the price, the protected side does not', () => {
  const loan = newRuleLoan();
  const low = stressLoan({ loan, position, price: 1000 });

  assert.ok(low.unprotected.collateralValueUsdc < low.protected.collateralValueUsdc);
  assert.equal(low.protected.collateralValueUsdc, low.protected.floorUsdc);
  assert.equal(low.unprotected.wouldLiquidate, true);
  assert.equal(low.protected.wouldLiquidate, false, 'the whole demonstration');
});

test('above the strike both sides are identical — the put is simply unused', () => {
  const loan = newRuleLoan();
  const high = stressLoan({ loan, position, price: 3000 });

  assert.equal(high.unprotected.collateralValueUsdc, high.protected.collateralValueUsdc);
  assert.equal(high.unprotected.wouldLiquidate, false);
  assert.equal(high.protected.wouldLiquidate, false);
});

test('both sides are judged by the same rule, not by different thresholds', () => {
  const loan = newRuleLoan();
  // At a price where the collateral values are equal, the verdicts must agree.
  const atStrike = stressLoan({ loan, position, price: 2300 });
  assert.equal(atStrike.unprotected.collateralValueUsdc, atStrike.protected.collateralValueUsdc);
  assert.equal(atStrike.unprotected.wouldLiquidate, atStrike.protected.wouldLiquidate);
});

test('the floor carries its provenance and never a hardcoded number', () => {
  const r = stressLoan({ loan: newRuleLoan(), position, price: 1800 });

  assert.equal(r.protected.floorUsdc, 4.5977);
  assert.deepEqual(r.protected.floorSource, {
    strike: 2300,
    numContractsRaw: '1999',
    positionId: position.id,
  });
  // Raw on-chain integers do not survive a JS number.
  assert.equal(typeof r.protected.floorSource.numContractsRaw, 'string');
});

test('the disclosure travels in the payload, not in the interface', () => {
  const r = stressLoan({ loan: newRuleLoan(), position, price: 1800 });
  assert.equal(r.rule.isRealProtocol, false);
  assert.match(r.rule.statement, /No lending protocol is integrated/);
});

test('a loan written under the OLD rule fails its own demonstration', () => {
  // Documented, not aspirational. The first real loan was lent the whole floor
  // and charged interest on top, so its debt exceeds the guarantee and the
  // protected side is liquidated too. The revised BR-39 prevents the next one;
  // it does not fix this one, and the screen would show our product failing.
  const r = stressLoan({ loan: oldRuleLoan, position, price: 1000 });

  assert.ok(r.debt.total > r.protected.floorUsdc,
    'the old rule leaves the debt above the floor');
  assert.equal(r.protected.wouldLiquidate, true,
    'which makes the comparison show both sides failing');
});

test('crossover is the price below which the unprotected side fails', () => {
  const loan = newRuleLoan();
  const x = crossoverPrice({ loan, position });

  const just_below = stressLoan({ loan, position, price: x - 1 });
  const just_above = stressLoan({ loan, position, price: x + 1 });

  assert.equal(just_below.unprotected.wouldLiquidate, true);
  assert.equal(just_above.unprotected.wouldLiquidate, false);
  assert.equal(just_below.protected.wouldLiquidate, false, 'protection holds below crossover');
});

test('a non-positive price is refused rather than producing a nonsense answer', () => {
  const loan = newRuleLoan();
  assert.throws(() => stressLoan({ loan, position, price: 0 }), RangeError);
  assert.throws(() => stressLoan({ loan, position, price: -100 }), RangeError);
  assert.throws(() => stressLoan({ loan, position, price: NaN }), RangeError);
});

test('the current-rule view is labelled in the payload, not left to the interface', () => {
  const r = stressLoan({ loan: oldRuleLoan, position, price: 1000, rule: 'current' });

  assert.equal(r.ruleApplied, 'current');
  assert.match(r.note, /disbursed under the previous credit rule/);
  assert.equal(r.asDisbursed.writtenUnderCurrentRule, false);
  assert.equal(r.asDisbursed.principal, 4.5977);
  assert.ok(r.asDisbursed.underCurrentRule < r.asDisbursed.principal);

  // And under that rule the demonstration works.
  assert.equal(r.protected.wouldLiquidate, false);
  assert.equal(r.unprotected.wouldLiquidate, true);
});

test('as-disbursed is the default, so a hypothetical is never shown by accident', () => {
  const a = stressLoan({ loan: oldRuleLoan, position, price: 1000 });
  const b = stressLoan({ loan: oldRuleLoan, position, price: 1000, rule: 'as-disbursed' });

  assert.equal(a.ruleApplied, 'as-disbursed');
  assert.deepEqual(a, b);
  assert.equal(a.note, null, 'no note when nothing is being re-derived');
  assert.equal(a.debt.principal, 4.5977, 'the real principal, unmodified');
});

test('a loan already written under the current rule carries no note', () => {
  const r = stressLoan({ loan: newRuleLoan(), position, price: 1000, rule: 'current' });
  assert.equal(r.note, null);
  assert.equal(r.asDisbursed.writtenUnderCurrentRule, true);
});

test('an unknown rule is refused rather than silently defaulted', () => {
  assert.throws(
    () => stressLoan({ loan: oldRuleLoan, position, price: 1000, rule: 'whatever' }),
    RangeError,
  );
});
