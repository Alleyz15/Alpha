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
 * The fixed, reviewed mapping. Six assets, matching the ones we can protect.
 *
 * Deliberately a constant rather than something derived: a market-data symbol
 * that silently changed would point a chart at the wrong asset.
 *
 * ---------------------------------------------------------------------------
 * TWO OF THESE IDS DO NOT MATCH THEIR TICKER, WHICH IS WHY THEY WERE CHECKED.
 * ---------------------------------------------------------------------------
 *
 * CoinGecko calls Avalanche `avalanche-2` and XRP `ripple`. Guessing `avalanche`
 * or `xrp` returns nothing, and an empty overview would have rendered as a coin
 * with no market cap rather than as an error. Both were verified against the
 * live API on 3 Sep 2026 - id, symbol and name together, so a right-looking id
 * for the wrong coin could not pass:
 *
 *   avalanche-2  AVAX  Avalanche   $7.15   mcap 3,086,658,185
 *   ripple       XRP   XRP         $1.33   mcap 83,720,595,246
 *
 * Both Binance pairs were confirmed TRADING via exchangeInfo, with klines and
 * depth returning real data. Verify the same way before adding a seventh.
 */
export const MARKET_ASSETS = Object.freeze([
  { symbol: 'ETH',  name: 'Ethereum',  coingeckoId: 'ethereum',    binancePair: 'ETHUSDT'  },
  { symbol: 'BTC',  name: 'Bitcoin',   coingeckoId: 'bitcoin',     binancePair: 'BTCUSDT'  },
  { symbol: 'SOL',  name: 'Solana',    coingeckoId: 'solana',      binancePair: 'SOLUSDT'  },
  { symbol: 'BNB',  name: 'BNB',       coingeckoId: 'binancecoin', binancePair: 'BNBUSDT'  },
  { symbol: 'AVAX', name: 'Avalanche', coingeckoId: 'avalanche-2', binancePair: 'AVAXUSDT' },
  { symbol: 'XRP',  name: 'XRP',       coingeckoId: 'ripple',      binancePair: 'XRPUSDT'  },
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

// resolveRange() and RANGE_KEYS were removed when the candles endpoint moved
// from range-based to interval-based selection. RANGES stays: resolveCandleQuery
// reads the old per-range lookbacks from it so the deprecated `range` alias
// returns byte-identical responses for one release.

/**
 * The candle intervals a caller may request, mapped 1:1 to Binance's kline
 * intervals so nothing here has to translate.
 */
export const CANDLE_INTERVALS = Object.freeze(['1m', '5m', '1h', '4h', '1d']);

/**
 * The hard ceiling on how many candles one request returns.
 *
 * ---------------------------------------------------------------------------
 * 1000 IS BINANCE'S OWN PER-REQUEST CAP, NOT A NUMBER WE CHOSE.
 * ---------------------------------------------------------------------------
 *
 * Asking for more means paginating, which this does not do. So "why 1000"
 * always has an answer that is not "seemed reasonable".
 *
 * At 1000 the widest span any supported interval produces is 1000 x 1d, about
 * 2.7 years; the narrowest is 1000 x 1m, about 16.7 hours. Both are legitimate
 * charts. The half-million-candle memory problem only exists when the count is
 * unbounded - capping it removes that in every interval, so no separate
 * "interval x limit" rule is needed on top.
 */
export const MAX_CANDLE_LIMIT = 1000;

/** The count returned when the caller does not ask for one. */
export const DEFAULT_CANDLE_LIMIT = 200;

/**
 * The old `range` values, as a one-release alias.
 *
 * `range` meant "how far back", and picked the interval for you. The endpoint
 * now takes `interval` directly. These keep existing callers byte-identical for
 * one release: a `range` maps to the interval it used to imply AND to the
 * lookback it used to request (RANGES[key].limit), so a caller that does not
 * change sees the same response it saw before.
 */
const RANGE_ALIAS_INTERVAL = Object.freeze({
  '1H': '1m', '1D': '5m', '1W': '1h', '1M': '4h', '1Y': '1d',
});

/**
 * Resolve a candles request to a concrete { interval, limit }.
 *
 * Precedence:
 *   1. `interval` if given - the new, direct parameter.
 *   2. `range` if given - the alias, mapped to its old interval and old limit.
 *   3. neither - the default interval and DEFAULT_CANDLE_LIMIT.
 *
 * `limit` is CLAMPED to MAX_CANDLE_LIMIT rather than refused: a caller asking
 * for 5000 wants "as much as you have", and because the response states the
 * interval and the candles it actually returns, a clamp cannot mislabel a
 * chart. A limit that is not a positive integer IS refused - that is malformed,
 * not ambitious.
 *
 * Returns a discriminated result rather than throwing, so this module keeps its
 * "no imports" property and the route decides the HTTP shape.
 *
 * @param {{interval?:string, limit?:string|number, range?:string}} q
 * @returns {{ok:true, interval:string, limit:number, viaRange:string|null}
 *          | {ok:false, reason:'interval'|'range'|'limit', got:string}}
 */
export function resolveCandleQuery({ interval, limit, range } = {}) {
  let chosenInterval = null;
  let baseLimit = DEFAULT_CANDLE_LIMIT;
  let viaRange = null;

  const intervalGiven = interval !== undefined && interval !== null && String(interval).trim() !== '';
  const rangeGiven = range !== undefined && range !== null && String(range).trim() !== '';

  if (intervalGiven) {
    const want = String(interval).trim().toLowerCase();
    if (!CANDLE_INTERVALS.includes(want)) {
      return { ok: false, reason: 'interval', got: String(interval) };
    }
    chosenInterval = want;
  } else if (rangeGiven) {
    const key = String(range).trim().toUpperCase();
    const mapped = RANGE_ALIAS_INTERVAL[key];
    if (!mapped) return { ok: false, reason: 'range', got: String(range) };
    chosenInterval = mapped;
    // The old lookback for this range, so an unchanged caller is unchanged.
    baseLimit = RANGES[key]?.limit ?? DEFAULT_CANDLE_LIMIT;
    viaRange = key;
  } else {
    chosenInterval = '5m';
  }

  let chosenLimit = baseLimit;
  if (limit !== undefined && limit !== null && String(limit).trim() !== '') {
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 1) {
      return { ok: false, reason: 'limit', got: String(limit) };
    }
    chosenLimit = Math.min(n, MAX_CANDLE_LIMIT);
  }

  return { ok: true, interval: chosenInterval, limit: chosenLimit, viaRange };
}
