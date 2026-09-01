// Market-data asset mapping (Coin Detail page).
//
// ===========================================================================
// DISPLAY ONLY. NOTHING IN src/marketdata/ MAY EVER PRICE A TRADE.
// ===========================================================================
//
// No quote, fill, credit limit, participation rate or settlement figure may
// read from CoinGecko or Binance. Protection pricing comes from the Thetanuts
// order book and nowhere else.
//
// This is enforced by the directory, not by memory: nothing here imports from
// src/thetanuts/, src/lending/, src/vault/ or src/scheduler/, and
// test/marketdataIsolation.test.js fails if any pricing module imports from
// here. The same guarantee that keeps signer.js out of src/api/.
//
// Why it matters: a market-cap figure and a strike price look alike on a
// screen. If one ever fed the other, a protection quote would be priced off an
// aggregator's view of a market rather than off the orders we can actually
// fill - and the resulting number would look entirely reasonable.
//
// ---------------------------------------------------------------------------
// THREE CURRENCIES, AND THEY ARE NOT THE SAME.
// ---------------------------------------------------------------------------
//
//   CoinGecko    USD    aggregated across exchanges
//   Binance      USDT   one exchange, one pair
//   Alpha        USDC   Thetanuts collateral
//
// They differ, normally and legitimately. Every response carries its own
// `quoteCurrency` and `source` so the interface can label them apart. NEVER
// relabel a USDT price as USDC to make a page look consistent.

/**
 * The fixed, reviewed mapping. Four assets, matching the ones we can protect.
 *
 * Deliberately a constant rather than something derived: a market-data symbol
 * that silently changed would point a chart at the wrong asset.
 */
export const MARKET_ASSETS = Object.freeze([
  { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum',    binancePair: 'ETHUSDT' },
  { symbol: 'BTC', name: 'Bitcoin',  coingeckoId: 'bitcoin',     binancePair: 'BTCUSDT' },
  { symbol: 'SOL', name: 'Solana',   coingeckoId: 'solana',      binancePair: 'SOLUSDT' },
  { symbol: 'BNB', name: 'BNB',      coingeckoId: 'binancecoin', binancePair: 'BNBUSDT' },
]);

/**
 * Resolve a symbol to its market mapping, or null.
 *
 * Returns null rather than throwing so a route can answer 404 for an unknown
 * asset without a try/catch around every lookup.
 *
 * @param {string} symbol
 * @returns {{symbol:string,name:string,coingeckoId:string,binancePair:string}|null}
 */
export function resolveMarket(symbol) {
  if (typeof symbol !== 'string') return null;
  const wanted = symbol.trim().toUpperCase();
  return MARKET_ASSETS.find((a) => a.symbol === wanted) ?? null;
}

/**
 * UI timeframe to Binance interval and how many candles to ask for.
 *
 * Chosen so each range is a readable chart rather than thousands of points:
 * roughly 60-360 candles per range.
 */
export const RANGES = Object.freeze({
  '1H': { interval: '1m',  limit: 60  },
  '1D': { interval: '5m',  limit: 288 },
  '1W': { interval: '1h',  limit: 168 },
  '1M': { interval: '4h',  limit: 180 },
  '1Y': { interval: '1d',  limit: 365 },
});

/** The default when no range is given. */
export const DEFAULT_RANGE = '1D';

/**
 * Resolve a requested range, or null if it is not one we offer.
 *
 * @param {string} [range]
 * @returns {{range:string, interval:string, limit:number}|null}
 */
export function resolveRange(range) {
  const wanted = (range ?? DEFAULT_RANGE).trim().toUpperCase();
  const found = RANGES[wanted];
  return found ? { range: wanted, ...found } : null;
}

/** Every range the interface may ask for, for error messages and docs. */
export const RANGE_KEYS = Object.freeze(Object.keys(RANGES));
