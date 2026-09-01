// BR-39 (revised 1 Sep 2026): the credit limit reserves its own interest.
//
// The property that matters is not the formula, it is the guarantee: whatever
// the term and the rate, principal + interest must land on the floor and never
// above it. The old rule failed exactly this - it lent the whole floor and then
// charged interest on top.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditLimitFor } from '../src/lending/credit.js';

// The real backing put: strike 2300 (8dp), 1999 contracts (6dp) -> floor 4.5977.
const position = {
  id: 'test-position',
  strike_raw: '230000000000',
  num_contracts_raw: '1999',
  expiry: '2026-09-03T08:00:00Z',
};

const owed = (r) => r.creditLimitUsdc * (1 + (r.annualRatePct / 100) * (r.termDays / 365));

test('the floor still comes from strike x contracts alone', () => {
  const r = creditLimitFor(position, { annualRatePct: 5, now: new Date('2026-08-31T14:49:45Z') });
  assert.equal(r.floorUsdc, 4.5977);
  assert.equal(r.strike, 2300);
  assert.equal(r.contracts, 0.001999);
});

test('principal plus interest lands on the floor, not above it', () => {
  for (const rate of [0.5, 5, 12.5, 40]) {
    for (const days of [0.5, 2.7155, 27, 62]) {
      const now = new Date(Date.parse(position.expiry) - days * 86_400_000);
      const r = creditLimitFor(position, { annualRatePct: rate, now });
      assert.ok(
        owed(r) <= r.floorUsdc + 1e-9,
        `rate ${rate}% over ${days}d: owed ${owed(r)} exceeds floor ${r.floorUsdc}`,
      );
      assert.ok(Math.abs(owed(r) - r.floorUsdc) < 1e-6,
        `rate ${rate}% over ${days}d: owed ${owed(r)} should land ON the floor`);
    }
  }
});

test('the old rule is what this replaced — the full floor now over-borrows', () => {
  const now = new Date('2026-08-31T14:49:45Z');
  const r = creditLimitFor(position, { annualRatePct: 5, now });
  // What the first real loan actually did: lend the whole floor, charge on top.
  const oldOwed = r.floorUsdc * (1 + 0.05 * (r.termDays / 365));
  assert.ok(oldOwed > r.floorUsdc, 'the old rule should exceed the floor');
  assert.ok(r.creditLimitUsdc < r.floorUsdc, 'the new limit must sit below the floor');
});

test('a longer term reserves more interest, so it lends less', () => {
  const short = creditLimitFor(position, { annualRatePct: 5, now: new Date('2026-09-02T08:00:00Z') });
  const long = creditLimitFor(position, { annualRatePct: 5, now: new Date('2026-08-01T08:00:00Z') });
  assert.ok(long.creditLimitUsdc < short.creditLimitUsdc);
  assert.ok(long.interestReservedUsdc > short.interestReservedUsdc);
});

test('a zero-length term reserves nothing, so the limit is the floor', () => {
  const r = creditLimitFor(position, { annualRatePct: 5, now: new Date(position.expiry) });
  assert.equal(r.creditLimitUsdc, r.floorUsdc);
  assert.equal(r.interestReservedUsdc, 0);
});

test('the limit is not a ratio — it moves with the rate, not with a constant', () => {
  const a = creditLimitFor(position, { annualRatePct: 5, now: new Date('2026-08-31T14:49:45Z') });
  const b = creditLimitFor(position, { annualRatePct: 10, now: new Date('2026-08-31T14:49:45Z') });
  assert.ok(b.creditLimitUsdc < a.creditLimitUsdc);
  // Doubling the rate roughly doubles what is held back.
  assert.ok(Math.abs(b.interestReservedUsdc / a.interestReservedUsdc - 2) < 0.01);
});
