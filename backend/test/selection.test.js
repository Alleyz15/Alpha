// Strike and expiry selection tests (BUILD_PLAN.md §10 — "strike and expiry
// selection against a fixed order book fixture").
//
// Pure and offline. selection.js imports the SDK client transitively, so a dummy
// RPC URL is set before importing; the functions under test (chooseExpiry,
// pickTiers) never touch the network. Fixtures use absolute unix timestamps so
// the expiry checks do not depend on the current time.
//
//   npm test        (from backend/)

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.THETANUTS_RPC_URL ??= 'http://localhost:0';

const { chooseExpiry, pickTiers } = await import('../src/thetanuts/selection.js');

// Expiry fixtures, ascending by expiryUnix as listExpiries returns them.
const mkExpiry = (unix) => ({
  expiryUnix: unix,
  expiry: new Date(unix * 1000),
  daysToExpiry: 0,
  strikes: [],
});
const expiries = [mkExpiry(1000), mkExpiry(2000), mkExpiry(3000)];

// A target as an absolute Date so the test is deterministic.
const at = (unix) => new Date(unix * 1000);

test('chooseExpiry picks the earliest expiry on or after the target', () => {
  const r = chooseExpiry(2500, expiries, at(500));
  assert.equal(r.expiry.expiryUnix, 1000);   // earliest, since 500 < all
  assert.equal(r.reason, null);
});

test('chooseExpiry (BR-6) never picks an earlier expiry than the target', () => {
  // Target sits between 2000 and 3000: it must pick 3000, not the nearer 2000.
  const r = chooseExpiry(2500, expiries, at(2500));
  assert.equal(r.expiry.expiryUnix, 3000);
});

test('chooseExpiry returns no expiry when the target is beyond the book (BR-6)', () => {
  const r = chooseExpiry(2500, expiries, at(3500));
  assert.equal(r.expiry, null);
  assert.equal(r.longestAvailable.expiryUnix, 3000);        // what we could offer
  assert.equal(r.shortfallDays, (3500 - 3000) / 86_400);    // how far short
  assert.match(r.reason, /never earlier/);
});

test('chooseExpiry with no expiries at all reports no buyable puts', () => {
  const r = chooseExpiry(2500, [], at(1000));
  assert.equal(r.expiry, null);
  assert.equal(r.longestAvailable, null);
  assert.match(r.reason, /no buyable puts/);
});

// Strike fixtures, highest strike first as listExpiries sorts them.
const mkStrike = (strike) => ({
  strike,
  premiumPerContract: 1,
  expiry: new Date(2000 * 1000),
  expiryUnix: 2000,
  daysToExpiry: 0,
  raw: { synthetic: strike },
});

test('pickTiers (BR-41) returns highest/middle/lowest with middle recommended', () => {
  const tiers = pickTiers([2400, 2300, 2200].map(mkStrike), 2500);
  assert.equal(tiers.length, 3);
  assert.deepEqual(tiers.map((t) => t.label), ['highest', 'middle', 'lowest']);
  assert.equal(tiers.filter((t) => t.recommended).length, 1);
  assert.equal(tiers.find((t) => t.recommended).label, 'middle');
  // floorUsd is the strike; protectionPct is derived from spot.
  assert.equal(tiers[0].floorUsd, 2400);
  assert.equal(tiers[0].protectionPct, ((2500 - 2400) / 2500) * 100);
});

test('pickTiers picks three representative strikes from four, not all four', () => {
  const tiers = pickTiers([2400, 2300, 2200, 2100].map(mkStrike), 2500);
  assert.equal(tiers.length, 3);
  // middleIndex = floor((4-1)/2) = 1 -> the 2300 strike.
  assert.equal(tiers.find((t) => t.recommended).floorUsd, 2300);
});

test('pickTiers collapses to fewer tiers when fewer strikes exist (BR-41)', () => {
  assert.equal(pickTiers([2400].map(mkStrike), 2500).length, 1);
  assert.equal(pickTiers([2400, 2300].map(mkStrike), 2500).length, 2);
  assert.equal(pickTiers([], 2500).length, 0);
});
