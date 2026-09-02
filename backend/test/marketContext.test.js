// What the interface is told about each asset.
//
// The reasoning tested here nearly shipped wrong. On the first measurement SOL
// and BNB produced zero tiers against a two-day target and looked unavailable -
// but they carry MORE strikes below spot than ETH and refuse only because they
// have no expiry that far out. A per-asset boolean would have removed two
// working assets while reading as verified.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessAsset, OFFERED_ASSETS } from '../src/api/marketContext.js';
import { resolveMarket } from '../src/marketdata/assets.js';

const DAY = 86_400_000;
const now = 1_788_000_000_000;
const inDays = (d) => Math.floor((now + d * DAY) / 1000);

const withExpiries = (...days) =>
  days.map((d) => ({ expiryUnix: inDays(d), strikes: [{ strike: 100 }, { strike: 95 }] }));

test('an asset with a short book is still available, just for less time', () => {
  // This is the SOL and BNB case: plenty of strikes, nothing beyond ~1.7 days.
  const r = assessAsset({ spot: 102, expiries: withExpiries(0.7, 1.7), now });

  assert.equal(r.protectionAvailable, true, 'a short tenor is not unavailability');
  assert.equal(r.longestProtectionDays, 1);
  assert.equal(r.unavailableReason, null);
});

test('a longer book reports the longer tenor', () => {
  const r = assessAsset({ spot: 2444, expiries: withExpiries(0.7, 1.7, 2.7), now });
  assert.equal(r.protectionAvailable, true);
  assert.equal(r.longestProtectionDays, 2);
});

test('the tenor rounds DOWN, never up', () => {
  // 2.9 days must report 2. Reporting 3 would let a picker offer a date the
  // book cannot reach - the stale-cap failure, arrived at by rounding.
  const r = assessAsset({ spot: 100, expiries: withExpiries(2.9), now });
  assert.equal(r.longestProtectionDays, 2);
});

test('no expiries at all is unavailable, with a reason a person can read', () => {
  const r = assessAsset({ spot: 100, expiries: [], now });

  assert.equal(r.protectionAvailable, false);
  assert.equal(r.longestProtectionDays, null);
  assert.match(r.unavailableReason, /no protection is being offered/);
});

test('an expiry with no strikes does not count as protection', () => {
  const r = assessAsset({ spot: 100, expiries: [{ expiryUnix: inDays(2), strikes: [] }], now });
  assert.equal(r.protectionAvailable, false);
});

test('a missing price is unavailable rather than a crash or a zero', () => {
  for (const spot of [null, 0, undefined, NaN]) {
    const r = assessAsset({ spot, expiries: withExpiries(2), now });
    assert.equal(r.protectionAvailable, false, `spot ${spot}`);
    assert.match(r.unavailableReason, /no price available/);
  }
});

test('distinct strikes are counted once across expiries', () => {
  const r = assessAsset({
    spot: 100,
    expiries: [
      { expiryUnix: inDays(1), strikes: [{ strike: 95 }, { strike: 90 }] },
      { expiryUnix: inDays(2), strikes: [{ strike: 95 }, { strike: 85 }] },
    ],
    now,
  });
  assert.equal(r.strikesBelowSpot, 3);
});

test('an expiry already past reports zero days, not a negative', () => {
  const r = assessAsset({ spot: 100, expiries: withExpiries(-1), now });
  assert.equal(r.longestProtectionDays, 0);
});

test('the offered set is the six assets quote sizing can confirm', () => {
  // AVAX and XRP were excluded while sizes were computed and sent unverified.
  // findFillableSize now confirms every size against the chain before quoting,
  // so the reason for excluding them is gone. See OFFERED_ASSETS.
  assert.deepEqual(OFFERED_ASSETS.map((a) => a.symbol), ['ETH', 'BTC', 'SOL', 'BNB', 'AVAX', 'XRP']);
});

test('every offered asset has market data, so no holding gets a dead Coin Detail', () => {
  // The two lists are separate constants in separate directories and drifted
  // apart once: six assets were quotable while only four had charts, so AVAX
  // and XRP got a portfolio row, a Buy Protection button that could not
  // complete, and a 404 for candles. A half-wired asset is worse than an
  // absent one - a smaller scope is coherent, a broken one is not.
  for (const { symbol } of OFFERED_ASSETS) {
    assert.ok(resolveMarket(symbol), `${symbol} is offered but has no market-data mapping`);
  }
});
