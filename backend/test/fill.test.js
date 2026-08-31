// pickRecordedContracts tests — the scale guard on the post-fill contract count.
//
// fill.js transitively imports the SDK client and the Supabase client, so dummy
// env values are set before importing; the modules construct without connecting
// (nothing here touches the network or the database). The function under test is
// pure.
//
//   npm test        (from backend/)

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.THETANUTS_RPC_URL ??= 'http://localhost:0';
process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SECRET_KEY ??= 'sb_secret_test';

const { pickRecordedContracts } = await import('../src/thetanuts/fill.js');

test('records an on-chain count that matches the quote scale (a real fill)', () => {
  const r = pickRecordedContracts('140000', 139999n);   // one 6dp unit off
  assert.equal(r.recordedRaw, '139999');
  assert.equal(r.accepted, true);
  assert.equal(r.seen, '139999');
});

test('REJECTS a 10^12 scale mismatch and keeps the quote', () => {
  const r = pickRecordedContracts('140000', 139999n * 10n ** 12n);   // 18dp not 6dp
  assert.equal(r.recordedRaw, null);   // null -> transitionPosition keeps the row's value
  assert.equal(r.accepted, false);
  assert.ok(r.seen.length > 12);       // the bad value is still surfaced for the audit trail
});

test('rejects a value scaled far too small', () => {
  const r = pickRecordedContracts('140000000000', 140n);   // ~10^9 too small
  assert.equal(r.recordedRaw, null);
  assert.equal(r.accepted, false);
});

test('rejects a zero count', () => {
  const r = pickRecordedContracts('140000', 0n);
  assert.equal(r.recordedRaw, null);
  assert.equal(r.accepted, false);
});

test('returns null when there is no on-chain value (read failed)', () => {
  const r = pickRecordedContracts('140000', null);
  assert.equal(r.recordedRaw, null);
  assert.equal(r.accepted, false);
  assert.equal(r.seen, null);
});

test('accepts a string on-chain value within scale', () => {
  const r = pickRecordedContracts('140000', '139998');
  assert.equal(r.recordedRaw, '139998');
  assert.equal(r.accepted, true);
});

test('accepts the exact boundaries of the [quoted/2, quoted*2] band', () => {
  assert.equal(pickRecordedContracts('100000', 50000n).accepted, true);   // quoted/2
  assert.equal(pickRecordedContracts('100000', 200000n).accepted, true);  // quoted*2
  assert.equal(pickRecordedContracts('100000', 49999n).accepted, false);  // just below
  assert.equal(pickRecordedContracts('100000', 200001n).accepted, false); // just above
});
