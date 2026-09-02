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
 * Whether a position is downside protection the user actually holds.
 *
 * Two conditions, deliberately separate:
 *
 *   role === 'protection'   a put. A call is upside participation and belongs
 *                           in neither count - the dashboard already conflated
 *                           these once (see strikeView).
 *   status === 'active'     not settled, not expired, not failed.
 *
 * @param {object} position
 * @returns {boolean}
 */
export function isDownsideProtection(position) {
  return strikeView(position.option_type, position.strike).role === 'protection';
}

/**
 * How much protection is real, and how much is merely requested.
 *
 * ---------------------------------------------------------------------------
 * PENDING IS COUNTED SEPARATELY AND NEVER FOLDED INTO ACTIVE.
 * ---------------------------------------------------------------------------
 *
 * `active` requires `verifiedOnChain` - a confirmed event, not a transaction
 * hash. A position whose row exists and whose money has been debited is a
 * promise; a position with a confirmed fill is a position. The operator model
 * means the gap between them can be hours (see "the operator model has no
 * timeout" in SETUP.md), so this is not a rare edge.
 *
 * Adding the two together would let the interface say "3 protected" when one of
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
    if (p.status !== 'active') continue;

    if (verified(p)) activeProtectionCount += 1;
    else pendingProtectionCount += 1;
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
