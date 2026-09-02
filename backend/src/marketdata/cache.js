// A small TTL cache for third-party market data.
//
// DISPLAY ONLY — see the header of assets.js. Nothing cached here may reach a
// price a user trades on.
//
// ---------------------------------------------------------------------------
// WHY CACHING IS CORRECT HERE AND WRONG FOR /api/market-context.
// ---------------------------------------------------------------------------
//
// It looks like the same optimisation and it is not.
//
//   /api/market-context   Serves longestProtectionDays, which a date picker
//                         caps against. A stale value lets a user choose a date
//                         the book cannot reach and be refused at the quote
//                         step. NEVER cached.
//
//   here                  Serves a market cap, a candle history and an order
//                         book snapshot. Nobody makes an irreversible decision
//                         on them, and the cost of NOT caching is a rate limit
//                         mid-pitch - CoinGecko's demo tier allows about 30
//                         calls a minute, and a judge clicking 1H/1D/1W/1M/1Y
//                         is five requests in five seconds.
//
// The rule that separates them: cache what is displayed, never what is
// committed to.
//
// A stale entry is served only while it is inside its TTL. On expiry it is
// refetched, and if the refetch FAILS the stale value is NOT served in its
// place - the request fails instead. Serving a plausible old number as though
// it were current is exactly the failure this project has spent two days
// removing.

/** key -> { value, expiresAt } */
const store = new Map();

/**
 * Read a live entry, or null if absent or expired.
 *
 * @param {string} key
 * @param {number} [now]
 */
export function cacheGet(key, now = Date.now()) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Store a value for `ttlMs`.
 *
 * @param {string} key
 * @param {*} value
 * @param {number} ttlMs
 * @param {number} [now]
 */
export function cacheSet(key, value, ttlMs, now = Date.now()) {
  if (!(ttlMs > 0)) throw new RangeError(`cacheSet: ttlMs must be positive, got ${ttlMs}`);
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/**
 * Fetch through the cache.
 *
 * If `load` throws, NOTHING is cached and the error propagates. The caller
 * turns that into a 503 the interface renders as "unavailable" - never into a
 * shaped response with plausible numbers in it.
 *
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<*>} load
 */
export async function cached(key, ttlMs, load) {
  const hit = cacheGet(key);
  if (hit !== null) return hit;

  const value = await load();
  return cacheSet(key, value, ttlMs);
}

/** Empty the cache. Tests only. */
export function cacheClear() {
  store.clear();
}

/** How many live entries there are. Diagnostics only. */
export function cacheSize(now = Date.now()) {
  let n = 0;
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
    else n += 1;
  }
  return n;
}

/**
 * How long each kind of thing is held.
 *
 * Overview is the tightest because it carries a live price. Candles barely move
 * at these intervals - a 4-hour candle does not change meaningfully in five
 * minutes - and depth is cached only long enough that a page refresh does not
 * hammer the venue.
 */
export const TTL = Object.freeze({
  OVERVIEW_MS: 45_000,
  CANDLES_MS: 5 * 60_000,
  DEPTH_MS: 3_000,
  // Which markets exist changes on the order of months, not minutes.
  EXCHANGE_INFO_MS: 6 * 60 * 60_000,
});
