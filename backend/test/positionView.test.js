// What the dashboard renders for a position.
//
// Both of these were wrong on screen before they were written down: a vault
// call showed "Protection floor $2,680" - a floor above spot - and two refunded
// positions showed "Payment status unavailable".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strikeView, paymentView, sumPayments } from '../src/api/positionView.js';

test('a put strike is a floor and a call strike is not', () => {
  const put = strikeView('put', 2300);
  assert.equal(put.role, 'protection');
  assert.equal(put.protectionFloorUsdc, 2300);
  assert.equal(put.upsideThresholdUsdc, null);

  const call = strikeView('call', 2680);
  assert.equal(call.role, 'upside');
  assert.equal(call.upsideThresholdUsdc, 2680);
  assert.equal(call.protectionFloorUsdc, null,
    'a call must not be renderable as a protection floor');
});

test('exactly one of the two strike fields is ever populated', () => {
  for (const type of ['put', 'call']) {
    const v = strikeView(type, 2500);
    const populated = [v.protectionFloorUsdc, v.upsideThresholdUsdc].filter((x) => x !== null);
    assert.equal(populated.length, 1, `${type} populated ${populated.length} fields`);
  }
});

test('a refunded position says so instead of saying nothing', () => {
  const totals = sumPayments([
    { event_type: 'debit', amount: -0.06182 },
    { event_type: 'refund', amount: 0.06182 },
  ]);
  const v = paymentView(totals, { tx_hash: null });

  assert.equal(v.paymentStatus, 'refunded');
  assert.equal(v.chargedUsdc, 0.06182);
  assert.equal(v.refundedUsdc, 0.06182);
});

test('a debit and its refund do not net to zero', () => {
  // Summing signed amounts would lose the fact the user was ever charged.
  const totals = sumPayments([
    { event_type: 'debit', amount: -0.5 },
    { event_type: 'refund', amount: 0.5 },
  ]);
  assert.equal(totals.chargedUsdc, 0.5);
  assert.equal(totals.refundedUsdc, 0.5);
});

test('charged but not broadcast is held, not paid', () => {
  const totals = sumPayments([{ event_type: 'debit', amount: -0.0766 }]);

  assert.equal(paymentView(totals, { tx_hash: null }).paymentStatus, 'held');
  assert.equal(paymentView(totals, { tx_hash: '0xabc' }).paymentStatus, 'paid');
});

test('never charged reads as none, not as unpaid', () => {
  const v = paymentView(sumPayments([]), { tx_hash: '0xabc' });
  assert.equal(v.paymentStatus, 'none');
  assert.equal(v.chargedUsdc, 0);
});

test('missing totals do not throw', () => {
  assert.equal(paymentView(undefined, { tx_hash: null }).paymentStatus, 'none');
  assert.equal(paymentView(undefined, null).paymentStatus, 'none');
});
