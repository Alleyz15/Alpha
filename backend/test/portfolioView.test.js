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
  annotateHoldings, POSITION_STATUSES, PENDING_STATUSES,
} from '../src/api/portfolioView.js';

const put = (over = {}) => ({
  id: 'p1', asset: 'ETH', option_type: 'put', strike: 2300, status: 'active',
  expiry: '2026-09-10T08:00:00.000Z', ...over,
});
const call = (over = {}) => ({
  id: 'c1', asset: 'ETH', option_type: 'call', strike: 2680, status: 'active',
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

// --- pending, against the schema rather than against today's data ----------
//
// `pending` and `pending_verification` do not occur in the demo database at
// all - the live distribution is failed/active/expired_worthless - which is how
// they came to be counted in neither total. These tests enumerate the CHECK
// constraint, so a status can never again be missed for being absent today.

test('every status in the constraint lands in exactly one bucket', () => {
  for (const status of POSITION_STATUSES) {
    const c = countProtection([put({ status })], allVerified);

    const expected = status === 'active' ? 'active'
      : PENDING_STATUSES.includes(status) ? 'pending' : 'neither';

    assert.equal(c.activeProtectionCount, expected === 'active' ? 1 : 0, `${status} active count`);
    assert.equal(c.pendingProtectionCount, expected === 'pending' ? 1 : 0, `${status} pending count`);
  }
});

test('pending is counted as pending, not dropped', () => {
  const c = countProtection([put({ status: 'pending' })], allVerified);
  assert.equal(c.pendingProtectionCount, 1);
  assert.equal(c.activeProtectionCount, 0);
});

test('pending_verification is counted as pending, not dropped', () => {
  // Broadcast, outcome unknown. The user has been charged and there is no
  // confirmed position - the definition of pending.
  const c = countProtection([put({ status: 'pending_verification' })], allVerified);
  assert.equal(c.pendingProtectionCount, 1);
  assert.equal(c.activeProtectionCount, 0);
});

test('needs_review is in neither count', () => {
  // Past expiry and merely unreconciled. Counting it as pending would suggest
  // something is still coming.
  const c = countProtection([put({ status: 'needs_review' })], allVerified);
  assert.equal(c.activeProtectionCount, 0);
  assert.equal(c.pendingProtectionCount, 0);
});

test('a pending CALL is in neither count', () => {
  for (const status of PENDING_STATUSES) {
    const c = countProtection([call({ status })], allVerified);
    assert.equal(c.pendingProtectionCount, 0, `${status}: a call is not protection`);
  }
});

test('a pending position does not set nextExpiry either', () => {
  for (const status of PENDING_STATUSES) {
    assert.equal(
      nextExpiry([put({ status, expiry: '2026-09-01T08:00:00.000Z' })], allVerified),
      null,
      `${status} must not report an expiry for protection that does not exist yet`,
    );
  }
});

// --- one action per holding row --------------------------------------------

const OFFERED = ['ETH', 'BTC', 'SOL', 'BNB', 'AVAX', 'XRP'];
const annotate = (holdings, positions, verified = allVerified) =>
  annotateHoldings(holdings, positions, verified, OFFERED);

test('USDC is never protectable', () => {
  // The spending balance, not an exposure. A Buy Protection button on a
  // stablecoin is nonsense.
  const [h] = annotate(buildHoldings([{ asset: 'USDC', amount: 250 }], {}), []);
  assert.equal(h.protectable, false);
  assert.equal(h.hasActiveProtection, false);
  assert.equal(h.protectionPositionId, null);
});

test('an asset we cannot quote is not protectable', () => {
  // Otherwise the row gets a button leading to a page that 404s.
  const [h] = annotate(buildHoldings([{ asset: 'DOGE', amount: 100 }], { DOGE: 0.1 }), []);
  assert.equal(h.protectable, false);
});

test('every offered asset we hold is protectable', () => {
  const holdings = buildHoldings(
    OFFERED.map((asset) => ({ asset, amount: 1 })),
    Object.fromEntries(OFFERED.map((a) => [a, 100])),
  );
  for (const h of annotate(holdings, [])) {
    assert.equal(h.protectable, true, `${h.asset} should be protectable`);
  }
});

test('the View target is the SOONEST-expiring active protection', () => {
  // A user can hold several positions on one asset and the row has one button.
  // Opening the newest would show a position expiring in a month while another
  // expires tomorrow.
  const positions = [
    put({ id: 'far', expiry: '2026-10-01T08:00:00.000Z' }),
    put({ id: 'soon', expiry: '2026-09-04T08:00:00.000Z' }),
    put({ id: 'mid', expiry: '2026-09-20T08:00:00.000Z' }),
  ];
  const [h] = annotate(buildHoldings([{ asset: 'ETH', amount: 1 }], { ETH: 2500 }), positions);

  assert.equal(h.hasActiveProtection, true);
  assert.equal(h.protectionPositionId, 'soon');
});

test('protection on another asset does not light up this row', () => {
  const positions = [put({ id: 'eth1', asset: 'ETH' })];
  const [h] = annotate(buildHoldings([{ asset: 'BTC', amount: 0.01 }], { BTC: 70000 }), positions);

  assert.equal(h.hasActiveProtection, false);
  assert.equal(h.protectionPositionId, null);
});

test('a CALL does not count as protection on the row', () => {
  const positions = [call({ id: 'c1' })];
  const [h] = annotate(buildHoldings([{ asset: 'ETH', amount: 1 }], { ETH: 2500 }), positions);

  assert.equal(h.hasActiveProtection, false);
  assert.equal(h.protectionPositionId, null);
});

test('PENDING protection gives no View target', () => {
  // A View button opening an unfilled position invites the user to read it as
  // cover they have. Pending is surfaced as a count, which is not a promise.
  for (const status of [...PENDING_STATUSES, 'active']) {
    const verified = status === 'active' ? noneVerified : allVerified;
    const positions = [put({ id: 'p', status })];
    const [h] = annotate(
      buildHoldings([{ asset: 'ETH', amount: 1 }], { ETH: 2500 }), positions, verified,
    );

    assert.equal(h.hasActiveProtection, false, `${status} must not read as active`);
    assert.equal(h.protectionPositionId, null, `${status} must not be a View target`);
  }
});

test('a settled position is not a View target', () => {
  const positions = [put({ id: 'old', status: 'settled' })];
  const [h] = annotate(buildHoldings([{ asset: 'ETH', amount: 1 }], { ETH: 2500 }), positions);
  assert.equal(h.protectionPositionId, null);
});

test('annotating preserves the pricing fields untouched', () => {
  const base = buildHoldings([{ asset: 'AVAX', amount: 40 }], { AVAX: null });
  const [h] = annotate(base, []);
  assert.equal(h.priceUsdc, null);
  assert.equal(h.valueUsdc, null, 'an unpriced holding stays unpriced');
  assert.equal(h.amount, 40);
});

test('the View target is stable when two positions share an expiry', () => {
  // The demo holds two ETH puts expiring in the same hour. Without an explicit
  // tiebreak the answer would be whatever order the database returned.
  const same = '2026-09-03T08:00:00.000Z';
  const forward = [put({ id: 'bbb', expiry: same }), put({ id: 'aaa', expiry: same })];
  const reversed = [...forward].reverse();

  const pick = (ps) => annotate(buildHoldings([{ asset: 'ETH', amount: 1 }], { ETH: 2500 }), ps)[0]
    .protectionPositionId;

  assert.equal(pick(forward), 'aaa');
  assert.equal(pick(reversed), 'aaa', 'the answer must not depend on row order');
});
