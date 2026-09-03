// Live market context for the interface (GET /api/market-context).
//
// ---------------------------------------------------------------------------
// EVERY FIGURE HERE IS COMPUTED PER REQUEST. DO NOT CACHE IT.
// ---------------------------------------------------------------------------
//
// "This barely changes, cache it for a minute" is a reasonable-sounding
// optimisation that would break this endpoint.
//
// THE MECHANISM, rather than a number that was true once:
//
//   Every expiry on the book is at 08:00 UTC, and the set rolls forward daily.
//   So the longest single-leg tenor is just under THREE days immediately after
//   a roll and about TWO just before the next one - it sweeps a full day's
//   range every twenty-four hours, and any figure written down is a snapshot of
//   the hour it was taken.
//
// An earlier version of this comment said "ETH and BTC carry expiries out to
// 2.7 days", which read as a property of the market and was a reading of one
// afternoon. longestProtectionDays computes it live, per request, which is the
// only way the number can be right.
//
// `longestProtectionDays` is what the date picker caps against. Serve a stale
// one and a user picks a date that was valid an hour ago, then gets a refusal
// at the quote step - which is precisely the failure BR-6 exists to prevent,
// arriving by a different route. The book is the only authority for what the
// book currently offers.
//
// WHY protectionAvailable IS NOT A STORED FLAG.
//
// It was nearly one. On the first measurement SOL and BNB returned zero tiers
// against a two-day target and looked unavailable - but they have MORE strikes
// below spot than ETH, and refuse only because they carry no expiry that far
// out. A per-asset boolean would have removed two working assets, and would
// have read as verified while doing it.
//
// So availability means "can produce tiers at SOME available expiry", and the
// tenor that makes it true is reported alongside it.

// The price feed and the book are imported INSIDE buildMarketContext. Both
// reach client.js, which throws without credentials - and assessAsset() is the
// part worth testing. A module that cannot be imported cannot be tested.

/**
 * The assets the demo offers.
 *
 * ---------------------------------------------------------------------------
 * AVAX AND XRP WERE EXCLUDED FOR A REASON THAT NO LONGER HOLDS.
 * ---------------------------------------------------------------------------
 *
 * They scored 2/6 and 0/6 when sizes were COMPUTED and sent unverified, because
 * some orders reject sizes arithmetic says are fine (InvalidNumContracts, rule
 * unknown - see fillableSize.js). Quote sizing now confirms every size against
 * the chain before quoting it and refuses the tier if none passes, so a size
 * that would have failed is no longer offered.
 *
 * Measured 2 Sep 2026 through the real quote path, at the demo holdings:
 *
 *   AVAX  40 units   2 tiers (one reduced 40 -> 36, the book's own refusal)
 *   XRP   300 units  3 tiers, all confirmed
 *
 * This list must stay in step with marketdata/assets.js. A holding that is
 * offered here but missing there gets a Buy Protection button and a Coin Detail
 * page with no data - which is worse than not offering it, because a smaller
 * scope is coherent and a half-wired one is broken. portfolioView derives
 * `protectable` from this list rather than repeating it, for the same reason.
 */
export const OFFERED_ASSETS = Object.freeze([
  { symbol: 'ETH',  name: 'Ethereum' },
  { symbol: 'BTC',  name: 'Bitcoin' },
  { symbol: 'SOL',  name: 'Solana' },
  { symbol: 'BNB',  name: 'BNB' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'XRP',  name: 'XRP' },
]);

/**
 * Turn one asset's live book into the shape the interface renders.
 *
 * Pure, so the reasoning is testable without a network: given expiries and a
 * spot, decide whether protection can be offered and for how long.
 *
 * @param {object} args
 * @param {number|null} args.spot
 * @param {Array<{expiryUnix:number, strikes?:Array}>} args.expiries - below spot
 * @param {number} [args.now] - epoch ms, injectable for tests
 * @returns {{protectionAvailable:boolean, longestProtectionDays:number|null, strikesBelowSpot:number, unavailableReason:string|null}}
 */
export function assessAsset({ spot, expiries, now = Date.now() }) {
  if (!(spot > 0)) {
    return {
      protectionAvailable: false,
      longestProtectionDays: null,
      strikesBelowSpot: 0,
      unavailableReason: 'no price available for this asset right now',
    };
  }

  const usable = (expiries ?? []).filter((e) => (e.strikes?.length ?? 0) > 0);

  if (usable.length === 0) {
    return {
      protectionAvailable: false,
      longestProtectionDays: null,
      strikesBelowSpot: 0,
      // A reason the interface can show. "Unavailable" with no explanation
      // reads as broken; this reads as a market that is thin today.
      unavailableReason: 'no protection is being offered on this asset right now',
    };
  }

  const longestUnix = Math.max(...usable.map((e) => e.expiryUnix));
  const strikes = new Set();
  for (const e of usable) for (const s of e.strikes ?? []) strikes.add(s.strike ?? s);

  return {
    protectionAvailable: true,
    // Rounded DOWN to whole days. A picker capped at the rounded-up value would
    // offer a date the book cannot reach, which is the stale-cap failure in
    // miniature.
    longestProtectionDays: Math.max(0, Math.floor((longestUnix * 1000 - now) / 86_400_000)),
    strikesBelowSpot: strikes.size,
    unavailableReason: null,
  };
}

/**
 * Build the whole payload, reading the live book for every asset.
 *
 * One asset failing must not take the endpoint down - a thin market for SOL is
 * not a reason the interface cannot show BTC. Each is caught individually and
 * reported as unavailable with its reason.
 *
 * @param {object} [args]
 * @param {Map<string, number>|object} [args.holdings] - symbol -> units held
 * @returns {Promise<object>}
 */
export async function buildMarketContext({ holdings = {} } = {}) {
  const { getSpotPrice } = await import('../thetanuts/market.js');
  const { listExpiries } = await import('../thetanuts/selection.js');

  const held = holdings instanceof Map ? Object.fromEntries(holdings) : holdings;

  const assets = await Promise.all(OFFERED_ASSETS.map(async ({ symbol, name }) => {
    try {
      const [spot, expiryList] = await Promise.all([
        getSpotPrice(symbol),
        listExpiries(symbol),
      ]);

      const expiries = expiryList?.expiries ?? expiryList ?? [];
      const assessment = assessAsset({ spot, expiries });

      return {
        symbol,
        name,
        spotUsdc: Math.round(spot * 100) / 100,
        holdingUnits: Number(held[symbol] ?? 0),
        ...assessment,
      };
    } catch (error) {
      // Loudly in the log, gracefully in the payload.
      console.error(`[market-context] ${symbol} failed:`, error.message);
      return {
        symbol,
        name,
        spotUsdc: null,
        holdingUnits: Number(held[symbol] ?? 0),
        protectionAvailable: false,
        longestProtectionDays: null,
        strikesBelowSpot: 0,
        unavailableReason: 'market data is unavailable for this asset right now',
      };
    }
  }));

  return {
    assets,
    // When these figures were true. The interface should show it, because the
    // numbers move and a page left open goes stale without looking stale.
    updatedAt: new Date().toISOString(),
    reality: {
      // Prices and the book are read live, every request.
      price: 'live',
      // Holdings are seeded, never deposited (BR-50).
      balance: 'simulated',
    },
  };
}
