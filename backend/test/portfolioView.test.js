// The portfolio summary.
//
// Three claims this endpoint could make that would be false in the direction
// that flatters us, and each has a test here:
//
//   a partial total presented as a complete one
//   a pending position counted as active protection
//   a call's expiry reported as when protection ends
//
// The arithmetic is not what needs protecting. These are.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHoldings, summariseValue, countProtection, nextExpiry, isDownsideProtection,
} from '../src/api/portfolioView.js';

const put = (over = {}) => ({
  id: 'p1', option_type: 'put', strike: 2300, status: 'active',
  expiry: '2026-09-10T08:00:00.000Z', ...over,
});
const call = (over = {}) => ({
  id: 'c1', option_type: 'call', strike: 2680, status: 'active',
  expiry: '2026-09-04T08:00:00.000Z', ...over,
});

const allVerified = () => true;
const noneVerified = () => false;

// --- holdings --------------------------------------------------------------

test('USDC is priced at exactly 1 and never needs the feed', () => {
  const h = buildHoldings([{ asset: 'USDC', amount: 9.25 }], {});
  assert.equal(h[0].priceUsdc, 1);
  assert.equal(h[0].valueUsdc, 9.25);
});

test('a missing price is null, never zero', () => {
  // Zero is a value and would sum. Null is the absence of one.
  const h = buildHoldings([{ asset: 'AVAX', amount: 40 }], { AVAX: null });
  assert.equal(h[0].priceUsdc, null);
  assert.equal(h[0].valueUsdc, null);
});

test('a price that is absent, zero or not a number is treated as missing', () => {
  const h = buildHoldings(
    [{ asset: 'A', amount: 1 }, { asset: 'B', amount: 1 }, { asset: 'C', amount: 1 }],
    { A: 0, B: NaN },   // C absent entirely
  );
  assert.deepEqual(h.map((x) => x.valueUsdc), [null, null, null]);
});

test('zero balances are not holdings', () => {
  const h = buildHoldings([{ asset: 'ETH', amount: 0 }, { asset: 'BTC', amount: 0.01 }], { BTC: 60000 });
  assert.equal(h.length, 1);
  assert.equal(h[0].asset, 'BTC');
});

// --- the total -------------------------------------------------------------

test('a complete total says so', () => {
  const h = buildHoldings([{ asset: 'ETH', amount: 0.4 }, { asset: 'USDC', amount: 10 }], { ETH: 2500 });
  const s = summariseValue(h);

  assert.equal(s.totalValueUsdc, 1010);
  assert.equal(s.totalValueComplete, true);
  assert.deepEqual(s.unpricedAssets, []);
});

test('ONE unpriced asset makes the whole total incomplete', () => {
  // The single most important assertion in this file. A total that quietly
  // omits a holding is not smaller - it is wrong, and wrong in our favour.
  const h = buildHoldings(
    [{ asset: 'ETH', amount: 0.4 }, { asset: 'AVAX', amount: 40 }],
    { ETH: 2500, AVAX: null },
  );
  const s = summariseValue(h);

  assert.equal(s.totalValueComplete, false);
  assert.deepEqual(s.unpricedAssets, ['AVAX']);
  // The partial figure is still returned - labelled, not withheld.
  assert.equal(s.totalValueUsdc, 1000);
});

test('unpriced assets are named, not counted', () => {
  const h = buildHoldings(
    [{ asset: 'AVAX', amount: 40 }, { asset: 'XRP', amount: 300 }],
    {},
  );
  assert.deepEqual(summariseValue(h).unpricedAssets, ['AVAX', 'XRP']);
});

test('an empty portfolio is complete, not incomplete', () => {
  const s = summariseValue(buildHoldings([], {}));
  assert.equal(s.totalValueUsdc, 0);
  assert.equal(s.totalValueComplete, true, 'nothing missing is not the same as something missing');
});

// --- what counts as protection ---------------------------------------------

test('a call is not protection', () => {
  assert.equal(isDownsideProtection(put()), true);
  assert.equal(isDownsideProtection(call()), false);
});

test('a pending position is NEVER folded into the active count', () => {
  // A debited balance is a promise. Only a confirmed event is a position.
  const positions = [put({ id: 'a' }), put({ id: 'b' })];
  const c = countProtection(positions, (p) => p.id === 'a');

  assert.equal(c.activeProtectionCount, 1);
  assert.equal(c.pendingProtectionCount, 1);
});

test('unverified protection counts as pending, not as nothing', () => {
  const c = countProtection([put(), put({ id: 'p2' })], noneVerified);
  assert.equal(c.activeProtectionCount, 0);
  assert.equal(c.pendingProtectionCount, 2, 'it exists - it is just not filled yet');
});

test('calls are in neither count', () => {
  const c = countProtection([call(), call({ id: 'c2' })], allVerified);
  assert.equal(c.activeProtectionCount, 0);
  assert.equal(c.pendingProtectionCount, 0);
});

test('settled and failed positions are in neither count', () => {
  const c = countProtection([
    put({ id: 'a', status: 'settled' }),
    put({ id: 'b', status: 'expired_worthless' }),
    put({ id: 'c', status: 'failed' }),
  ], allVerified);

  assert.equal(c.activeProtectionCount, 0);
  assert.equal(c.pendingProtectionCount, 0);
});

// --- next expiry -----------------------------------------------------------

test('nextExpiry is the EARLIEST active protection', () => {
  const e = nextExpiry([
    put({ id: 'a', expiry: '2026-09-20T08:00:00.000Z' }),
    put({ id: 'b', expiry: '2026-09-05T08:00:00.000Z' }),
    put({ id: 'c', expiry: '2026-09-12T08:00:00.000Z' }),
  ], allVerified);

  assert.equal(e, '2026-09-05T08:00:00.000Z');
});

test("a call's earlier expiry is NOT reported as when protection ends", () => {
  // The vault call expires on the 4th; the protection runs to the 10th.
  // Reporting the 4th would tell the user they are uncovered six days early.
  const e = nextExpiry([call(), put()], allVerified);
  assert.equal(e, '2026-09-10T08:00:00.000Z');
});

test('a pending position does not set nextExpiry', () => {
  // It may never be filled. A date the user plans around must correspond to
  // protection that exists.
  const e = nextExpiry([put({ id: 'pending', expiry: '2026-09-01T08:00:00.000Z' }), put()],
    (p) => p.id !== 'pending');

  assert.equal(e, '2026-09-10T08:00:00.000Z');
});

test('nextExpiry is null when nothing is active', () => {
  assert.equal(nextExpiry([put({ status: 'settled' })], allVerified), null);
  assert.equal(nextExpiry([], allVerified), null);
});
