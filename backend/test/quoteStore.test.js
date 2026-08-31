// Quote-store tests (BR-8: a quote is valid only within its window).
//
// quoteStore.js is self-contained (no SDK, no DB), so this is pure and offline.
// getQuoteSet and sweepExpired both accept an explicit `now`, so the window
// checks are deterministic without touching the clock.
//
//   npm test        (from backend/)

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { rememberQuoteSet, getQuoteSet, forgetQuoteSet, sweepExpired, size } =
  await import('../src/api/quoteStore.js');

// Sets are keyed by quoteId; each test uses its own id and cleans up, since the
// store is a module-level map shared across tests.
const mkSet = (quoteId, expiresAtMs) => ({ quoteId, expiresAt: new Date(expiresAtMs).toISOString() });

test('getQuoteSet returns a set while it is inside its window (BR-8)', () => {
  const set = mkSet('q-fresh', 10_000);
  rememberQuoteSet(set);
  assert.equal(getQuoteSet('q-fresh', 5_000), set);   // now (5s) < expiry (10s)
  forgetQuoteSet('q-fresh');
});

test('getQuoteSet returns null once expired, and drops it (BR-8)', () => {
  rememberQuoteSet(mkSet('q-exp', 10_000));
  // At/after the expiry instant it must not be usable.
  assert.equal(getQuoteSet('q-exp', 10_000), null);
  // And it is removed, so it cannot reappear even at an earlier `now`.
  assert.equal(getQuoteSet('q-exp', 5_000), null);
});

test('getQuoteSet returns null for an unknown id', () => {
  assert.equal(getQuoteSet('does-not-exist', 0), null);
});

test('sweepExpired removes only expired sets', () => {
  rememberQuoteSet(mkSet('s-old', 1_000));
  rememberQuoteSet(mkSet('s-new', 9_999_999));
  sweepExpired(5_000);
  assert.equal(getQuoteSet('s-old', 5_000), null);     // expired -> swept
  assert.ok(getQuoteSet('s-new', 5_000));              // still inside its window
  forgetQuoteSet('s-new');
});

test('forgetQuoteSet drops a set immediately (one purchase per quote)', () => {
  rememberQuoteSet(mkSet('f-1', 9_999_999));
  forgetQuoteSet('f-1');
  assert.equal(getQuoteSet('f-1', 0), null);
});

test('size reflects only the sets currently held', () => {
  const before = size();
  rememberQuoteSet(mkSet('z-1', 9_999_999));
  assert.equal(size(), before + 1);
  forgetQuoteSet('z-1');
  assert.equal(size(), before);
});
