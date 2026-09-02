// CoinGecko and Binance, read-only.
//
// DISPLAY ONLY — see the header of assets.js. Nothing here may price a trade.
//
// ---------------------------------------------------------------------------
// A FAILURE IS AN ERROR, NEVER A SHAPED RESPONSE.
// ---------------------------------------------------------------------------
//
// Rate-limited, unreachable or malformed all end the same way: a thrown
// MarketDataError the route turns into 503, which the interface renders as
// "unavailable". No zeros, no empty arrays dressed as an empty market, no
// last-known value served as though it were current.
//
// The distinction that matters: an empty order book and an unreachable exchange
// look identical in a payload of zeros, and only one of them means the market
// is quiet.
//
// No API key is used for Binance and none should be. These are public
// market-data endpoints; nothing here can trade, and no Binance credential
// belongs in this project.

import { cached, TTL } from './cache.js';
import { MARKET_ASSETS } from './assets.js';
import { normaliseOverview, normaliseCandles, normaliseDepth } from './normalise.js';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// Binance's market-data-only host, which is what they recommend for public
// reads and which carries no trading surface at all.
const BINANCE_BASE = 'https://data-api.binance.vision';

/** How long to wait before giving up on a provider. */
const TIMEOUT_MS = 8_000;

/** A provider failure the API layer maps to 503. */
export class MarketDataError extends Error {
  constructor(message, { provider, status = null, cause = null } = {}) {
    super(message);
    this.name = 'MarketDataError';
    this.code = 'MARKET_DATA_UNAVAILABLE';
    this.provider = provider;
    this.status = status;
    this.cause = cause;
  }
}

/**
 * A JSON GET with a timeout, which throws MarketDataError on anything unusual.
 *
 * @param {string} url
 * @param {object} [opts]
 */
async function getJson(url, { provider, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { headers, signal: controller.signal });
  } catch (error) {
    throw new MarketDataError(
      error.name === 'AbortError'
        ? `${provider} did not respond within ${TIMEOUT_MS / 1000}s`
        : `${provider} is unreachable`,
      { provider, cause: error.message },
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    // Named separately because it is the failure we expect under demo load and
    // the one with an obvious remedy: wait, and lean on the cache.
    throw new MarketDataError(`${provider} rate limit reached`, { provider, status: 429 });
  }

  if (!response.ok) {
    throw new MarketDataError(`${provider} returned ${response.status}`, {
      provider, status: response.status,
    });
  }

  try {
    return await response.json();
  } catch (error) {
    throw new MarketDataError(`${provider} returned a malformed response`, {
      provider, cause: error.message,
    });
  }
}

/**
 * Overview for all four assets, in ONE CoinGecko request.
 *
 * One call rather than one per asset keeps us far inside the demo tier's
 * ~30/minute, and means the assets either all appear or all fail together -
 * which is easier to render honestly than a page half-populated.
 *
 * @returns {Promise<{assets:object[], source:string, updatedAt:string}>}
 */
export async function fetchOverview() {
  return cached('overview', TTL.OVERVIEW_MS, async () => {
    const ids = MARKET_ASSETS.map((a) => a.coingeckoId).join(',');

    // per_page COUNTS THE ASSETS, and must never be a literal.
    //
    // It was hardcoded to 4 while the list held four. Adding AVAX and XRP made
    // it six ids into a four-row page, and with order=market_cap_desc the
    // provider returned the four largest and dropped SOL and AVAX. They came
    // back as coins with every field null - which is exactly what the graceful
    // null-fill below is for, so nothing errored and nothing looked wrong.
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}` +
      `&order=market_cap_desc&per_page=${MARKET_ASSETS.length}&page=1&sparkline=false`;

    // The key is optional: without it the public tier still answers, with a
    // lower limit. Server-side only - it must never be VITE_ prefixed, because
    // that would bundle it into the browser (BR-17).
    const headers = {};
    const key = process.env.COINGECKO_API_KEY;
    if (key) headers['x-cg-demo-api-key'] = key;

    const raw = await getJson(url, { provider: 'CoinGecko', headers });

    if (!Array.isArray(raw)) {
      throw new MarketDataError('CoinGecko returned an unexpected shape', { provider: 'CoinGecko' });
    }

    const updatedAt = new Date().toISOString();
    const byId = new Map(raw.map((r) => [r.id, r]));

    // Our order, not the provider's, and an asset the provider omitted comes
    // back with null fields rather than vanishing from the list.
    //
    // That is deliberate and it is also how the per_page bug above stayed
    // invisible: degrading gracefully means degrading QUIETLY. So the omission
    // is logged - the response still renders, but the gap leaves a trace
    // somebody can find.
    const missing = MARKET_ASSETS.filter((a) => !byId.has(a.coingeckoId)).map((a) => a.symbol);
    if (missing.length > 0) {
      console.warn(
        `[marketdata] CoinGecko returned no row for ${missing.join(', ')} - ` +
        `asked for ${MARKET_ASSETS.length} ids, got ${raw.length}. ` +
        'These will render with null fields.',
      );
    }

    const assets = MARKET_ASSETS.map((asset) =>
      normaliseOverview(byId.get(asset.coingeckoId) ?? {}, asset, updatedAt));

    return { assets, source: 'CoinGecko', quoteCurrency: 'USD', updatedAt };
  });
}

/**
 * Which Binance markets are actually trading right now.
 *
 * Verified rather than assumed: a pair can be delisted or halted, and a chart
 * pointed at a dead market would show a flat line rather than an error.
 *
 * @returns {Promise<Set<string>>} pairs with status TRADING
 */
export async function fetchTradingPairs() {
  return cached('exchangeInfo', TTL.EXCHANGE_INFO_MS, async () => {
    const symbols = MARKET_ASSETS.map((a) => `"${a.binancePair}"`).join(',');
    const url = `${BINANCE_BASE}/api/v3/exchangeInfo?symbols=[${encodeURIComponent(symbols)}]`;
    const raw = await getJson(url, { provider: 'Binance' });

    const trading = new Set();
    for (const s of raw?.symbols ?? []) {
      if (s?.status === 'TRADING') trading.add(s.symbol);
    }
    return trading;
  });
}

/**
 * Assert a pair is currently trading, or refuse.
 *
 * @param {{binancePair:string, symbol:string}} asset
 */
export async function assertPairTrading(asset) {
  const trading = await fetchTradingPairs();
  if (!trading.has(asset.binancePair)) {
    throw new MarketDataError(
      `${asset.binancePair} is not currently trading on Binance`,
      { provider: 'Binance' },
    );
  }
}

/**
 * Candles for one asset at one interval.
 *
 * @param {object} asset - a MARKET_ASSETS entry
 * @param {{range:string, interval:string, limit:number}} range
 */
export async function fetchCandles(asset, range) {
  return cached(`candles:${asset.symbol}:${range.interval}`, TTL.CANDLES_MS, async () => {
    await assertPairTrading(asset);

    const url = `${BINANCE_BASE}/api/v3/klines?symbol=${asset.binancePair}` +
      `&interval=${range.interval}&limit=${range.limit}`;
    const raw = await getJson(url, { provider: 'Binance' });

    if (!Array.isArray(raw)) {
      throw new MarketDataError('Binance returned an unexpected shape', { provider: 'Binance' });
    }

    const shaped = normaliseCandles(raw, asset, range.interval);

    // An empty chart is not a chart. Better a clear failure than an axis with
    // nothing on it, which reads as a broken page.
    if (shaped.candles.length === 0) {
      throw new MarketDataError(
        `Binance returned no usable candles for ${asset.binancePair}`,
        { provider: 'Binance' },
      );
    }

    return { ...shaped, range: range.range };
  });
}

/**
 * A depth snapshot for one asset.
 *
 * Cached for a few seconds only - long enough that a page refresh does not
 * hammer the venue, short enough that the book on screen is current. Polling
 * this every 2-3 seconds is what the interface does instead of holding a
 * websocket: at a demo's timescale the two are indistinguishable, and a dropped
 * stream leaves a stale panel that looks live.
 *
 * @param {object} asset
 * @param {number} [depth]
 */
export async function fetchDepth(asset, depth = 10) {
  return cached(`depth:${asset.symbol}:${depth}`, TTL.DEPTH_MS, async () => {
    await assertPairTrading(asset);

    // Binance only accepts certain limits; 20 is the smallest that comfortably
    // covers the 8-10 rows a side the page shows.
    const url = `${BINANCE_BASE}/api/v3/depth?symbol=${asset.binancePair}&limit=20`;
    const raw = await getJson(url, { provider: 'Binance' });

    const shaped = normaliseDepth(raw, asset, depth);

    if (shaped.bids.length === 0 && shaped.asks.length === 0) {
      throw new MarketDataError(
        `Binance returned an empty book for ${asset.binancePair}`,
        { provider: 'Binance' },
      );
    }

    return shaped;
  });
}
