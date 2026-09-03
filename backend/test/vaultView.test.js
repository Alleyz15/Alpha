// Vault shapes, and when the maturity button may be offered.
//
// The product makes two claims and only one is a guarantee:
//
//   principal protection    GUARANTEED - the deposit comes back whole
//   upside participation    NOT guaranteed - the call may expire unused
//
// On 3 Sep the call expired unused and the depositor got every cent back. An
// interface that had promised upside would have rendered that as a failure, so
// the tests below are mostly about keeping a zero payout legible as a result
// rather than as an absence.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vaultView, maturability } from '../src/api/vaultView.js';

const HOUR = 3_600_000;

const vault = (over = {}) => ({
  id: 'v1',
  position_id: 'p1',
  status: 'active',
  principal: 3,
  yield_portion: 2.9878,
  option_portion: 0.0122,
  yield_rate_annual: 5,
  participation_rate: 0.0231,
  exposure_usdc: 0.0693,
  yield_is_simulated: true,
  maturity: new Date(Date.now() - HOUR).toISOString(),
  payout: null,
  returned_usdc: null,
  recipient_address: null,
  maturity_tx: null,
  created_at: '2026-09-01T10:00:00.000Z',
  ...over,
});

const call = (over = {}) => ({
  id: 'p1', asset: 'ETH', strike: 2680, expiry: '2026-09-03T08:00:00.000Z',
  status: 'expired_worthless', settlement_price: 2403.45858228, ...over,
});

// --- a zero payout is a result, not an absence -----------------------------

test('an unsettled payout is null, never zero', () => {
  // Zero means "the call expired unused". Null means "we do not know yet".
  // Rendering the second as the first tells the depositor their upside is gone
  // before it has been decided.
  const v = vaultView(vault());
  assert.equal(v.payoutUsdc, null);
  assert.equal(v.returnedUsdc, null);
});

test('a settled zero payout is zero, and stays zero', () => {
  const v = vaultView(vault({ payout: 0, returned_usdc: 3, status: 'matured' }));
  assert.equal(v.payoutUsdc, 0, 'a recorded zero is a fact');
  assert.equal(v.returnedUsdc, 3);
});

test('the principal is returned whole even when the payout is zero', () => {
  // The whole product claim in one assertion: 3 in, 3 back, no upside.
  const v = vaultView(vault({ payout: 0, returned_usdc: 3, status: 'matured' }));
  assert.equal(v.returnedUsdc, v.principalUsdc);
});

// --- the split and the simulated yield -------------------------------------

test('the split accounts for the whole deposit', () => {
  const v = vaultView(vault());
  assert.ok(Math.abs(v.yieldPortionUsdc + v.optionPortionUsdc - v.principalUsdc) < 1e-6);
});

test('the yield is always reported as simulated (BR-37)', () => {
  assert.equal(vaultView(vault()).yieldIsSimulated, true);
  // Defensive: even if a row somehow arrived without the column, the interface
  // must not be told the yield is real.
  assert.equal(vaultView(vault({ yield_is_simulated: undefined })).yieldIsSimulated, true);
});

// --- the call is a threshold, never a floor --------------------------------

test("the call's strike is an upside THRESHOLD, not a protection floor", () => {
  // The dashboard rendered a vault call as "Protection floor $2,680" once - a
  // floor above spot. The field name is the fix.
  const v = vaultView(vault(), call());
  assert.equal(v.call.upsideThresholdUsdc, 2680);
  assert.equal(v.call.protectionFloorUsdc, undefined);
});

test('the call block is null rather than empty when it was not read', () => {
  assert.equal(vaultView(vault()).call, null);
});

// --- links -----------------------------------------------------------------

test('no maturity hash means no explorer link', () => {
  const v = vaultView(vault());
  assert.equal(v.maturityUrl, null);
});

test('a maturity hash produces a link to that hash', () => {
  const v = vaultView(vault({ maturity_tx: '0x72cb94ba' }));
  assert.equal(v.maturityUrl, 'https://basescan.org/tx/0x72cb94ba');
});

// --- when the button may be offered ----------------------------------------

test('a matured deposit cannot be matured again', () => {
  // Offering the button twice is how a demo pays twice.
  const m = maturability(vault({ status: 'matured' }));
  assert.equal(m.maturable, false);
  assert.match(m.reason, /already been returned/);
});

test('a deposit whose term has not finished cannot be matured', () => {
  const m = maturability(vault({ maturity: new Date(Date.now() + HOUR).toISOString() }));
  assert.equal(m.maturable, false);
  assert.match(m.reason, /not finished/);
});

test('a superseded deposit says so plainly rather than looking broken', () => {
  // The 100 USDC deposit was replaced and its principal was never returnable.
  // It keeps its row because its call is real and is held.
  const m = maturability(vault({ status: 'superseded' }));
  assert.equal(m.maturable, false);
  assert.match(m.reason, /replaced/);
});

test('an active deposit past its term is maturable', () => {
  const m = maturability(vault());
  assert.equal(m.maturable, true);
  assert.equal(m.reason, null);
});

test('every refusal carries a reason the interface can show', () => {
  // "maturable: false" with nothing to display is how a dead button appears.
  for (const status of ['matured', 'superseded', 'failed']) {
    const m = maturability(vault({ status }));
    assert.equal(m.maturable, false);
    assert.ok(m.reason && m.reason.length > 0, `${status} has no reason`);
  }
});
