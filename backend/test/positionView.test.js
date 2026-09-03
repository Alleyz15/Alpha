// What the dashboard renders for a position.
//
// Both of these were wrong on screen before they were written down: a vault
// call showed "Protection floor $2,680" - a floor above spot - and two refunded
// positions showed "Payment status unavailable".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strikeView, paymentView, sumPayments, usdcOrNull } from '../src/api/positionView.js';

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

// --- execution state -------------------------------------------------------
//
// The distinction these protect: a transaction hash proves something was SENT.
// Only a confirmed event proves it landed. The frontend gates the BaseScan link
// on verifiedOnChain, so conflating the two would link to an unproven fill.

import { executionView, timelineView } from '../src/api/positionView.js';

const ev = (type, at) => ({ event_type: type, created_at: at });

test('a row with nothing sent is requested, not broadcast', () => {
  const r = executionView({ status: 'pending', tx_hash: null, created_at: 'T0', quote_id: 'q' },
    [ev('created', 'T0')]);

  assert.equal(r.executionState, 'requested');
  assert.equal(r.verifiedOnChain, false);
  assert.equal(r.purchasedAt, null);
});

test('broadcast is DISTINCT from confirmed', () => {
  // pending_verification: a hash exists and the outcome is unknown. This is the
  // state that must never be shown as a settled fact.
  const r = executionView(
    { status: 'pending_verification', tx_hash: '0xabc', created_at: 'T0', quote_id: 'q' },
    [ev('created', 'T0'), ev('broadcast', 'T1')],
  );

  assert.equal(r.executionState, 'broadcast');
  assert.equal(r.verifiedOnChain, false, 'a hash is not a confirmation');
  assert.equal(r.purchasedAt, null);
});

test('confirmed sets verifiedOnChain and purchasedAt', () => {
  const r = executionView(
    { status: 'active', tx_hash: '0xabc', created_at: 'T0', quote_id: 'q' },
    [ev('created', 'T0'), ev('broadcast', 'T1'), ev('confirmed', 'T2')],
  );

  assert.equal(r.executionState, 'confirmed');
  assert.equal(r.verifiedOnChain, true);
  assert.equal(r.purchasedAt, 'T2');
});

test('purchasedAt is the FIRST confirmed event, not a later correction', () => {
  // Two real positions carry a second `confirmed` from a post-fill correction.
  // Taking the last would report the correction as the moment of purchase.
  const r = executionView(
    { status: 'active', tx_hash: '0xabc', created_at: 'T0', quote_id: 'q' },
    [ev('created', 'T0'), ev('confirmed', '2026-08-30T22:38:24Z'), ev('confirmed', '2026-08-30T22:39:48Z')],
  );

  assert.equal(r.purchasedAt, '2026-08-30T22:38:24Z');
});

test('a settled position still reports its execution as confirmed', () => {
  // Execution and settlement are separate axes. Expiring worthless does not
  // mean the fill failed.
  const r = executionView(
    { status: 'expired_worthless', tx_hash: '0xabc', created_at: 'T0', quote_id: 'q' },
    [ev('created', 'T0'), ev('confirmed', 'T2'), ev('settled', 'T9')],
  );

  assert.equal(r.executionState, 'confirmed');
  assert.equal(r.verifiedOnChain, true);
});

test('failed wins over everything', () => {
  const r = executionView({ status: 'failed', tx_hash: null, created_at: 'T0', quote_id: 'q' },
    [ev('created', 'T0'), ev('failed', 'T1')]);

  assert.equal(r.executionState, 'failed');
  assert.equal(r.verifiedOnChain, false);
});

test('orderId is null rather than the position id when there is no quote', () => {
  // The two vault calls were bought by script, not through the API. Returning
  // the position id here would produce an order id that resolves to nothing.
  const r = executionView({ status: 'active', tx_hash: '0xabc', created_at: 'T0', quote_id: null }, []);

  assert.equal(r.orderId, null);
});

test('createdAt and purchasedAt are different questions', () => {
  const r = executionView(
    { status: 'active', tx_hash: '0xabc', created_at: 'T0', quote_id: 'q' },
    [ev('created', 'T0'), ev('confirmed', 'T5')],
  );

  assert.equal(r.createdAt, 'T0', 'when it was asked for');
  assert.equal(r.purchasedAt, 'T5', 'when it happened');
  assert.notEqual(r.createdAt, r.purchasedAt);
});

// --- timeline --------------------------------------------------------------

test('the timeline is oldest first and carries no raw payload', () => {
  const events = [
    { event_type: 'confirmed', created_at: 'T2', payload: { gasUsed: '646060', blockNumber: 1 } },
    { event_type: 'created', created_at: 'T0', payload: { quote_id: 'secret' } },
    { event_type: 'broadcast', created_at: 'T1', payload: { strikeRaw: '232000000000' } },
  ];
  const t = timelineView(events);

  assert.deepEqual(t.map((x) => x.at), ['T0', 'T1', 'T2'], 'oldest first');
  for (const entry of t) {
    assert.deepEqual(Object.keys(entry).sort(), ['at', 'event'], 'only event and at');
  }
  assert.ok(!JSON.stringify(t).includes('646060'));
  assert.ok(!JSON.stringify(t).includes('232000000000'));
});

test('internal event names are mapped to interface names', () => {
  const t = timelineView([
    { event_type: 'created', created_at: 'T0' },
    { event_type: 'broadcast', created_at: 'T1' },
    { event_type: 'confirmed', created_at: 'T2' },
    { event_type: 'flagged', created_at: 'T3' },
    { event_type: 'settled', created_at: 'T4' },
    { event_type: 'failed', created_at: 'T5' },
  ]);

  assert.deepEqual(t.map((x) => x.event), [
    'requested', 'operator_execution', 'confirmed_onchain', 'needs_review', 'settled', 'failed',
  ]);
});

test('an unmapped event type passes through rather than vanishing', () => {
  const t = timelineView([{ event_type: 'something_new', created_at: 'T0' }]);
  assert.equal(t[0].event, 'something_new');
});

// --- absent is not zero ----------------------------------------------------

test('a missing premium is null, never 0', () => {
  // $0.00 says the protection was free. The third time this shape appeared:
  // a call's protection floor, the CoinGecko overview, now premiumPaidUsdc.
  assert.equal(usdcOrNull(null), null);
  assert.equal(usdcOrNull(undefined), null);
});

test('a real zero is preserved as zero', () => {
  // A recorded 0 is a fact - the payout on an expired_worthless position. Only
  // ABSENCE becomes null.
  assert.equal(usdcOrNull(0), 0);
  assert.equal(usdcOrNull('0'), 0);
});

test('numeric strings from the database are converted', () => {
  assert.equal(usdcOrNull('1.523456'), 1.523456);
});

test('an unparseable value is null rather than NaN', () => {
  // NaN renders as "NaN" on screen and compares false to everything.
  assert.equal(usdcOrNull('not a number'), null);
});
