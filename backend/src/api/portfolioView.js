// Portfolio summary, as pure functions.
//
// No database, no network, no credentials. Everything here takes rows and
// prices and returns a shape - which is what makes the rules below testable,
// and the rules are the whole point of the module.
//
// ---------------------------------------------------------------------------
// A PARTIAL TOTAL IS NEVER PRESENTED AS A COMPLETE ONE.
// ---------------------------------------------------------------------------
//
// The portfolio total is a sum over assets we hold, and any one of them can
// fail to price: the market call times out, the asset is not one the oracle
// covers, the book has nothing for it today. A sum that silently omits an
// unpriced holding is not a smaller number - it is a WRONG number, and it is
// wrong in the direction that flatters us.
//
// So every total is accompanied by whether it is complete, and by the list of
// assets missing from it. The interface may show the figure; it may not show it
// unqualified. This is the same rule as gating the BaseScan link on a confirmed
// event rather than on a transaction hash: the presence of a value is not
// evidence of its meaning.

import { strikeView } from './positionView.js';

/** USDC has 6 decimals; rounding there keeps float noise out of the payload. */
const usdc = (n) => Math.round(n * 1e6) / 1e6;

/**
 * The user's holdings, priced where a price is available.
 *
 * USDC is included and priced at exactly 1. It is a holding - it is part of
 * what the portfolio is worth - and leaving it out would make the total
 * disagree with the balance shown everywhere else in the product. It needs no
 * oracle, so it can never be the reason a total is incomplete.
 *
 * A missing price yields `priceUsdc: null` and `valueUsdc: null`, never zero.
 * Zero is a value; null is the absence of one, and summing them differs.
 *
 * @param {Array<{asset:string, amount:number|string}>} balances
 * @param {Record<string, number|null>} prices - asset -> spot, or null/absent
 * @returns {Array<{asset:string, amount:number, priceUsdc:number|null, valueUsdc:number|null}>}
 */
export function buildHoldings(balances, prices = {}) {
  return (balances ?? [])
    .map((b) => {
      const amount = Number(b.amount);
      const asset = b.asset;

      // Priced by definition, not by lookup. One USDC is one USDC.
      if (asset === 'USDC') {
        return { asset, amount, priceUsdc: 1, valueUsdc: usdc(amount) };
      }

      const raw = prices[asset];
      const priceUsdc = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;

      return {
        asset,
        amount,
        priceUsdc: priceUsdc === null ? null : Math.round(priceUsdc * 100) / 100,
        valueUsdc: priceUsdc === null ? null : usdc(amount * priceUsdc),
      };
    })
    // A zero balance is not a holding. It clutters the list and it can never
    // affect the total, so it cannot make one incomplete either.
    .filter((h) => h.amount > 0);
}

/**
 * The total, and whether it is the whole story.
 *
 * `totalValueComplete` is false when ANY held asset could not be priced. The
 * total is still returned - a partial figure is useful and the interface may
 * want to show it - but it is returned labelled, alongside the assets missing
 * from it, so nothing downstream has to guess.
 *
 * @param {ReturnType<typeof buildHoldings>} holdings
 * @returns {{totalValueUsdc:number, totalValueComplete:boolean, unpricedAssets:string[]}}
 */
export function summariseValue(holdings) {
  const unpricedAssets = holdings.filter((h) => h.valueUsdc === null).map((h) => h.asset);

  return {
    totalValueUsdc: usdc(
      holdings.reduce((sum, h) => sum + (h.valueUsdc ?? 0), 0),
    ),
    totalValueComplete: unpricedAssets.length === 0,
    // Named, not counted. "2 assets could not be priced" sends someone hunting;
    // "AVAX, XRP" tells them what to look at.
    unpricedAssets,
  };
}

/**
 * Whether a position is downside protection at all.
 *
 * SHAPE ONLY - it says nothing about status. A put that failed is still a put.
 * Callers add their own status test, which is why this is separate: conflating
 * "is protection" with "is live protection" is how a settled position ends up
 * counted as cover.
 *
 * A call is upside participation and is protection in neither sense. The
 * dashboard conflated the two once already (see strikeView).
 *
 * @param {object} position
 * @returns {boolean}
 */
export function isDownsideProtection(position) {
  return strikeView(position.option_type, position.strike).role === 'protection';
}

/**
 * Every status a position row may hold, from the CHECK constraint.
 *
 * Listed here so the counts below are written against the SCHEMA rather than
 * against whatever the demo database happens to contain. `pending` and
 * `pending_verification` do not occur in the demo data at all, which is exactly
 * how they came to be counted nowhere.
 */
export const POSITION_STATUSES = Object.freeze([
  'pending',                // row written, transaction not yet broadcast (BR-14)
  'pending_verification',   // broadcast, outcome unknown - never blind-retry
  'active',                 // confirmed on-chain, not yet expired
  'failed',                 // reverted; nothing was bought
  'settled',                // expired in the money, payout recorded
  'expired_worthless',      // expired out of the money, payout zero
  'needs_review',           // past expiry but still unsettled on-chain (BR-27)
]);

/**
 * Statuses that mean "on its way, not yet real".
 *
 * Both are states where the user has been charged and no confirmed position
 * exists. They are the two the operator model produces between the confirm
 * button and the fill.
 */
export const PENDING_STATUSES = Object.freeze(['pending', 'pending_verification']);

/**
 * How much protection is real, and how much is merely on its way.
 *
 * ---------------------------------------------------------------------------
 * PENDING IS COUNTED SEPARATELY AND NEVER FOLDED INTO ACTIVE.
 * ---------------------------------------------------------------------------
 *
 *   active    status 'active' AND verifiedOnChain - a confirmed event, not a
 *             transaction hash and not a row existing
 *   pending   status 'pending' or 'pending_verification', OR status 'active'
 *             with no confirmed event
 *
 * The last clause is defensive. 'active' is written on confirmation so it
 * should always carry a confirmed event; if it ever does not, the position is
 * unproven and belongs in pending rather than in a count the interface presents
 * as protection the user holds.
 *
 * Everything else - failed, settled, expired_worthless, needs_review - is in
 * NEITHER count. Those are over. needs_review in particular is past expiry and
 * merely unreconciled, so counting it as pending would suggest something is
 * still coming.
 *
 * Adding the two totals would let the interface say "3 protected" when one of
 * the three has not been bought. That is the single worst thing this endpoint
 * could do, because it is the claim the whole product rests on.
 *
 * @param {object[]} positions
 * @param {(p:object)=>boolean} verified - verifiedOnChain for a position
 * @returns {{activeProtectionCount:number, pendingProtectionCount:number}}
 */
export function countProtection(positions, verified) {
  let activeProtectionCount = 0;
  let pendingProtectionCount = 0;

  for (const p of positions ?? []) {
    if (!isDownsideProtection(p)) continue;

    if (p.status === 'active') {
      if (verified(p)) activeProtectionCount += 1;
      else pendingProtectionCount += 1;
    } else if (PENDING_STATUSES.includes(p.status)) {
      pendingProtectionCount += 1;
    }
  }

  return { activeProtectionCount, pendingProtectionCount };
}

/**
 * When the user's protection next runs out.
 *
 * ACTIVE DOWNSIDE PROTECTION ONLY. Three exclusions, each for its own reason:
 *
 *   calls          a vault call expiring on Thursday is not protection ending
 *                  on Thursday. Reporting it here would tell the user they are
 *                  uncovered from a date that has nothing to do with cover.
 *   pending        it may never be filled. An expiry for a position that does
 *                  not exist is a date the user would plan around.
 *   settled/failed already over. Nothing expires twice.
 *
 * Null when there is nothing active - which the interface must render as "no
 * protection", never as a missing date.
 *
 * @param {object[]} positions
 * @param {(p:object)=>boolean} verified
 * @returns {string|null} ISO timestamp
 */
export function nextExpiry(positions, verified) {
  const dates = (positions ?? [])
    .filter((p) => isDownsideProtection(p) && p.status === 'active' && verified(p))
    .map((p) => p.expiry)
    .filter(Boolean)
    .sort();

  return dates[0] ?? null;
}

/**
 * One authoritative action per holding row.
 *
 * ---------------------------------------------------------------------------
 * A ROW HAS ONE BUTTON AND A USER CAN HAVE MANY POSITIONS ON ONE ASSET.
 * ---------------------------------------------------------------------------
 *
 * So the choice of WHICH position that button opens is a decision, and making
 * it here means every surface makes the same one. Left to the interface it
 * would be "the first in the array", which is whatever the database returned.
 *
 *   protectable           can we quote this asset at all
 *   hasActiveProtection   is there confirmed, live downside protection on it
 *   protectionPositionId  the position to open, or null
 *
 * `protectionPositionId` is the SOONEST-EXPIRING active protection on that
 * asset - the one the user most needs to look at, and the one whose expiry
 * `nextExpiry` may already be reporting. Taking the newest instead would open
 * a position expiring in a month while one expires tomorrow.
 *
 * It is null whenever `hasActiveProtection` is false, INCLUDING when protection
 * is merely pending. A View button that opens an unfilled position invites the
 * user to read it as cover they have. Pending is surfaced by
 * pendingProtectionCount, which is a count and not a promise.
 *
 * `protectable` is false for USDC - it is the spending balance, not an exposure
 * to protect, and a "Buy Protection" button on a stablecoin is nonsense. It is
 * also false for any asset we cannot actually quote, so a holding never gets a
 * button leading to a page that 404s.
 *
 * @param {ReturnType<typeof buildHoldings>} holdings
 * @param {object[]} positions
 * @param {(p:object)=>boolean} verified
 * @param {string[]} offeredSymbols - the assets we can quote (OFFERED_ASSETS)
 * @returns {ReturnType<typeof buildHoldings>} the same rows, with the three fields added
 */
export function annotateHoldings(holdings, positions, verified, offeredSymbols) {
  const offered = new Set(offeredSymbols ?? []);

  return holdings.map((h) => {
    // Soonest first, so [0] is the one to open.
    const live = (positions ?? [])
      .filter((p) => p.asset === h.asset
        && isDownsideProtection(p)
        && p.status === 'active'
        && verified(p))
      // Soonest expiry first, then id as a tiebreak. The tiebreak is not
      // decoration: the demo holds two ETH puts expiring in the same hour, and
      // without it the View target would be decided by the order the database
      // happened to return rows in - stable today, and silently different the
      // first time a query gains an ORDER BY.
      .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry))
        || String(a.id).localeCompare(String(b.id)));

    return {
      ...h,
      // USDC is the spending balance, never an exposure.
      protectable: h.asset !== 'USDC' && offered.has(h.asset),
      hasActiveProtection: live.length > 0,
      protectionPositionId: live[0]?.id ?? null,
    };
  });
}
