// Loan shapes.
//
// The arithmetic lives in credit.js and repay.js and is tested there. What is
// tested here is the set of distinctions the API has to keep straight, each of
// which has been conflated somewhere in this project before:
//
//   the strike is not the protected value    ("floor" means both)
//   a hash is not a confirmation             (positions, twice)
//   an expected repayment is not what is owed now
//   absent is not zero                       (three times)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditLimitView, loanView, checksView } from '../src/api/loanView.js';
import { creditLimitFor } from '../src/lending/credit.js';

/**
 * A REAL creditLimitFor() result, not a hand-written fixture.
 *
 * The first attempt at this file hardcoded creditLimitUsdc, floorUsdc and
 * interestReservedUsdc, and set them to numbers that could not all be true at
 * once - the consistency test caught it immediately. Deriving them removes the
 * chance of testing the view against arithmetic that never happened.
 *
 * Numbers are the 31 Aug loan's: a $2,300 put over 0.001999 contracts.
 */
const limit = () => creditLimitFor(
  {
    id: 'p1',
    strike_raw: String(2300n * 100_000_000n),   // 8dp
    num_contracts_raw: '1999',                  // 6dp -> 0.001999
    expiry: '2026-09-03T08:00:00.000Z',
  },
  { annualRatePct: 5, now: new Date('2026-09-01T08:00:00.000Z') },
);

const loan = (over = {}) => ({
  id: 'l1',
  position_id: 'p1',
  status: 'active',
  principal: 4.5977,
  credit_limit: 4.5977,
  interest_rate: 5,
  collateral_amount: 0.001999,
  recipient_address: '0xc169c7c000caa28807ab2585d707c7a6457d718e',
  created_at: '2026-08-31T10:00:00.000Z',
  due_at: '2026-09-03T08:00:00.000Z',
  disbursement_tx: null,
  repayment_expected: null,
  repayment_requested_at: null,
  repayment_tx: null,
  ...over,
});

// --- the equation ----------------------------------------------------------

test('the credit limit ships its components, not just a total', () => {
  // The equation is the product's whole claim. A total alone is a number the
  // user has to trust; the components are one they can check.
  const v = creditLimitView(limit());

  assert.equal(v.protectionFloorUsdc, 2300, 'the strike');
  assert.equal(v.numContracts, 0.001999);
  assert.equal(v.protectedValueUsdc, 4.5977, 'strike x contracts');
  assert.ok(v.interestReservedUsdc > 0, 'interest is reserved, not ignored');
  assert.ok(v.creditLimitUsdc < v.protectedValueUsdc,
    'the limit is strictly below what the protection guarantees (BR-39)');
});

test('"floor" is never a field name, because it means two different numbers', () => {
  // credit.js calls strike x contracts the "floor" ($4.5977). The product
  // sentence calls the strike the "floor" ($2,300). They differ by three orders
  // of magnitude, so a field called floorUsdc would be wrong for one reader
  // whichever number it carried.
  const v = creditLimitView(limit());

  assert.equal(v.floorUsdc, undefined, 'no ambiguous field may be shipped');
  assert.notEqual(v.protectionFloorUsdc, v.protectedValueUsdc);
});

test('the components multiply and subtract back to the total', () => {
  // Not a tautology: it proves the four fields were taken from the same result
  // rather than assembled from two, which is how a display equation stops
  // agreeing with itself.
  const v = creditLimitView(limit());

  assert.ok(Math.abs(v.protectionFloorUsdc * v.numContracts - v.protectedValueUsdc) < 1e-6,
    'strike x contracts must equal the protected value');
  assert.ok(Math.abs(v.protectedValueUsdc - v.interestReservedUsdc - v.creditLimitUsdc) < 1e-6,
    'protected value minus reserved interest must equal the limit');
});

// --- the loan --------------------------------------------------------------

test('a null disbursement hash gives a null explorer link', () => {
  // Same rule as the BaseScan link on a position: no hash, no link. A link to
  // a transaction that does not exist is worse than no link.
  const v = loanView(loan());
  assert.equal(v.disbursementTx, null);
  assert.equal(v.disbursementUrl, null);
});

test('a disbursement hash produces a link to that hash', () => {
  const v = loanView(loan({ disbursement_tx: '0xabc' }));
  assert.equal(v.disbursementUrl, 'https://basescan.org/tx/0xabc');
});

test('an unrequested repayment has no expected figure — null, not zero', () => {
  const v = loanView(loan());
  assert.equal(v.repaymentExpectedUsdc, null);
  assert.equal(v.repaymentRequestedAt, null);
});

test('the expected repayment is the FIXED figure, not what is owed now', () => {
  // Interest accrues with the clock. Once quoted, the figure does not move -
  // a borrower told one number and judged against another has been treated
  // unfairly, and both numbers carried separately is the only way to see it.
  const v = loanView(
    loan({ repayment_expected: 4.5990 }),
    { principalUsdc: 4.5977, interestUsdc: 0.0019, totalUsdc: 4.5996, termDays: 3, annualRatePct: 5 },
  );

  assert.equal(v.repaymentExpectedUsdc, 4.599, 'what was quoted');
  assert.equal(v.owed.totalUsdc, 4.5996, 'what the terms say now');
  assert.notEqual(v.repaymentExpectedUsdc, v.owed.totalUsdc);
});

test('owed is null rather than zero when it cannot be computed', () => {
  const v = loanView(loan(), null);
  assert.equal(v.owed, null, 'zero would say the loan is settled');
});

test('a loan with no credit limit recorded reports null, not zero', () => {
  const v = loanView(loan({ credit_limit: null, interest_rate: null, collateral_amount: null }));
  assert.equal(v.creditLimitUsdc, null);
  assert.equal(v.annualRatePct, null);
  assert.equal(v.collateralContracts, null);
});

// --- checklists ------------------------------------------------------------

test('a checklist carries label, pass and detail and nothing else', () => {
  // The underlying results carry raw values and addresses the interface has no
  // use for, and shipping them by accident is how internal state leaks.
  const v = checksView([
    { label: 'transaction exists on chain', pass: true, detail: 'block 123', receipt: { secret: 1 } },
  ]);

  assert.deepEqual(Object.keys(v[0]).sort(), ['detail', 'label', 'pass']);
  assert.equal(v[0].receipt, undefined);
});

test('a missing detail is null rather than undefined', () => {
  const v = checksView([{ label: 'x', pass: false }]);
  assert.equal(v[0].detail, null);
});

test('pass is coerced to a real boolean', () => {
  // A truthy string rendering as a tick when the check did not pass is the
  // exact failure this project keeps finding.
  const v = checksView([{ label: 'x', pass: 1 }, { label: 'y', pass: '' }]);
  assert.equal(v[0].pass, true);
  assert.equal(v[1].pass, false);
});

test('an absent checklist is an empty array, not a crash', () => {
  assert.deepEqual(checksView(undefined), []);
  assert.deepEqual(checksView(null), []);
});
