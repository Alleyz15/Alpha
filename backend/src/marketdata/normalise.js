// Turning third-party responses into our shapes.
//
// DISPLAY ONLY — see the header of assets.js.
//
// Pure functions, no network, no credentials, so the shaping is testable. Every
// one of these carries `source` and `quoteCurrency` through to the output,
// because the three currencies on the Coin Detail page are genuinely different
// and the interface has to be able to say which is which.
//
// ---------------------------------------------------------------------------
// A MISSING FIELD BECOMES null, NEVER 0.
// ---------------------------------------------------------------------------
//
// Zero is a number a person will read as a fact: a market cap of zero, a price
// change of zero. Null renders as "unavailable". CoinGecko omits fields for
// some coins and occasionally returns them as null, so this is not theoretical.

/** A finite number, or null. Never 0 as a stand-in for "missing". */
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Round for display without pretending to precision we do not have. */
const round = (v, dp) => (v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

/**
 * One CoinGecko /coins/markets entry -> our overview shape.
 *
 * @param {object} raw - a single element of the markets array
 * @param {{symbol:string,name:string}} asset - our mapping, which names the asset
 * @param {string} [updatedAt]
 */
export function normaliseOverview(raw, asset, updatedAt = new Date().toISOString()) {
  return {
    symbol: asset.symbol,
    // OUR name, not the provider's. CoinGecko calls BNB "BNB" today and has
    // called it other things; the page should not rename an asset because an
    // aggregator did.
    name: asset.name,

    priceUsd: round(num(raw?.current_price), 2),
    priceChange24hPct: round(num(raw?.price_change_percentage_24h), 2),
    marketCapUsd: num(raw?.market_cap),
    volume24hUsd: num(raw?.total_volume),
    circulatingSupply: num(raw?.circulating_supply),
    allTimeHighUsd: round(num(raw?.ath), 2),
    allTimeHighDate: raw?.ath_date ?? null,

    // USD, and said so. CoinGecko aggregates across venues; it is not Binance's
    // USDT price and not our USDC quotes, and the three will differ.
    quoteCurrency: 'USD',
    source: 'CoinGecko',
    updatedAt,
  };
}

/**
 * Binance /api/v3/klines -> OHLCV.
 *
 * The response is an array of arrays. Positions 0-5 are open time, open, high,
 * low, close, volume; the rest are close time, quote volume and trade counts,
 * which the chart does not need.
 *
 * A malformed row is DROPPED rather than coerced. A candle with a NaN high
 * would render as a spike to zero, which reads as a flash crash that never
 * happened.
 *
 * @param {Array<Array>} rows
 * @param {{symbol:string, binancePair:string}} asset
 * @param {string} interval
 */
export function normaliseCandles(rows, asset, interval) {
  const candles = [];

  for (const row of rows ?? []) {
    if (!Array.isArray(row) || row.length < 6) continue;

    const candle = {
      timestamp: num(row[0]),
      open: num(row[1]),
      high: num(row[2]),
      low: num(row[3]),
      close: num(row[4]),
      volume: num(row[5]),
    };

    // Every field must be present. A partial candle is not a candle.
    if (Object.values(candle).some((v) => v === null)) continue;
    candles.push(candle);
  }

  return {
    symbol: asset.symbol,
    pair: asset.binancePair,
    // USDT, explicitly. The chart's y-axis is not denominated in what our
    // protection is priced in.
    quoteCurrency: 'USDT',
    interval,
    candles,
    source: 'Binance',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Binance /api/v3/depth -> bids and asks.
 *
 * @param {{bids:Array,asks:Array}} raw
 * @param {{symbol:string, binancePair:string}} asset
 * @param {number} [depth] - rows per side
 */
export function normaliseDepth(raw, asset, depth = 10) {
  const side = (rows) => (rows ?? [])
    .slice(0, depth)
    .map(([price, quantity]) => ({ price: num(price), quantity: num(quantity) }))
    .filter((r) => r.price !== null && r.quantity !== null);

  return {
    symbol: asset.symbol,
    pair: asset.binancePair,
    quoteCurrency: 'USDT',

    bids: side(raw?.bids),
    asks: side(raw?.asks),

    // ---------------------------------------------------------------------
    // An order book belongs to ONE exchange. This travels in the payload for
    // the same reason isRealProtocol does: a disclosure the interface renders
    // rather than one it decides whether to render. Calling this "the market's
    // order book" would be false, and styling cannot drop a field.
    // ---------------------------------------------------------------------
    venue: 'Binance',
    scope: 'single-exchange',
    scopeStatement:
      `This is Binance's ${asset.symbol}/USDT order book, not a global market view. ` +
      'Other venues quote different prices, and Alpha\'s protection is priced ' +
      'separately on Thetanuts.',

    source: 'Binance',
    updatedAt: new Date().toISOString(),
  };
}
