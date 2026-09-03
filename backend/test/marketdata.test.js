// Shaping third-party market data.
//
// The properties worth protecting are about honesty rather than arithmetic: a
// missing figure must not become a zero, a Binance price must not be relabelled
// as USDC, and an order book must say which venue it belongs to.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseOverview, normaliseCandles, normaliseDepth } from '../src/marketdata/normalise.js';
import {
  resolveMarket, resolveCandleQuery, MARKET_ASSETS,
  CANDLE_INTERVALS, MAX_CANDLE_LIMIT, DEFAULT_CANDLE_LIMIT,
} from '../src/marketdata/assets.js';
import { cacheGet, cacheSet, cached, cacheClear } from '../src/marketdata/cache.js';

const eth = { symbol: 'ETH', name: 'Ethereum', binancePair: 'ETHUSDT' };

// --- the mapping -----------------------------------------------------------

test('symbols resolve case-insensitively, and unknown ones return null', () => {
  assert.equal(resolveMarket('btc').binancePair, 'BTCUSDT');
  assert.equal(resolveMarket('  ETH ').coingeckoId, 'ethereum');
  assert.equal(resolveMarket('DOGE'), null);
  assert.equal(resolveMarket(undefined), null);
});

test('the six assets match the six we can protect', () => {
  assert.deepEqual(MARKET_ASSETS.map((a) => a.symbol), ['ETH', 'BTC', 'SOL', 'BNB', 'AVAX', 'XRP']);
});

test('no two assets share a CoinGecko id or a Binance pair', () => {
  // AVAX is `avalanche-2` and XRP is `ripple` - neither matches its ticker, so
  // a copy-paste that left a duplicated id would point two coins at one price
  // and look entirely plausible on screen.
  const ids = MARKET_ASSETS.map((a) => a.coingeckoId);
  const pairs = MARKET_ASSETS.map((a) => a.binancePair);
  assert.equal(new Set(ids).size, ids.length, 'duplicate coingeckoId');
  assert.equal(new Set(pairs).size, pairs.length, 'duplicate binancePair');
});

// --- resolving a candles request ----------------------------------------------
//
// The endpoint moved from range-based ("how far back") to interval-based ("what
// candle size"). `range` survives as a one-release alias that must return
// byte-identical responses.

test('interval is taken directly and lower-cased', () => {
  for (const iv of CANDLE_INTERVALS) {
    const r = resolveCandleQuery({ interval: iv.toUpperCase() });
    assert.equal(r.ok, true);
    assert.equal(r.interval, iv);
  }
});

test('an unknown interval is refused, not defaulted', () => {
  const r = resolveCandleQuery({ interval: '3m' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'interval');
  assert.equal(r.got, '3m');
});

test('no parameters gives 5m and the default limit', () => {
  const r = resolveCandleQuery({});
  assert.deepEqual(
    { interval: r.interval, limit: r.limit, viaRange: r.viaRange },
    { interval: '5m', limit: DEFAULT_CANDLE_LIMIT, viaRange: null },
  );
});

test('the range alias maps to its OLD interval AND its OLD lookback', () => {
  // Byte-identical for one release: a caller still sending ?range=1D must get
  // exactly what it got before - 5m candles, 288 of them.
  assert.deepEqual(resolveCandleQuery({ range: '1D' }),
    { ok: true, interval: '5m', limit: 288, viaRange: '1D' });
  assert.deepEqual(resolveCandleQuery({ range: '1h' }),
    { ok: true, interval: '1m', limit: 60, viaRange: '1H' });
  assert.equal(resolveCandleQuery({ range: '1Y' }).interval, '1d');
});

test('an unknown range alias is refused', () => {
  const r = resolveCandleQuery({ range: '5Y' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'range');
});

test('interval WINS over range when both are given', () => {
  // range is the alias; interval is the real parameter.
  const r = resolveCandleQuery({ interval: '1h', range: '1D' });
  assert.equal(r.interval, '1h');
  assert.equal(r.viaRange, null, 'range was ignored, so it is not echoed');
});

test('an explicit limit overrides the range alias lookback', () => {
  const r = resolveCandleQuery({ range: '1D', limit: 50 });
  assert.equal(r.interval, '5m');
  assert.equal(r.limit, 50);
});

test('an oversized limit is CLAMPED to the Binance cap, not refused', () => {
  // A caller asking for 5000 wants "as much as you have". Because the response
  // states the interval and the candles actually returned, a clamp cannot
  // mislabel a chart - so clamp rather than 400.
  const r = resolveCandleQuery({ interval: '1m', limit: 999999 });
  assert.equal(r.ok, true);
  assert.equal(r.limit, MAX_CANDLE_LIMIT);
  assert.equal(MAX_CANDLE_LIMIT, 1000, "Binance's own per-request cap");
});

test('a limit at the cap is left alone', () => {
  assert.equal(resolveCandleQuery({ interval: '1m', limit: 1000 }).limit, 1000);
});

test('a limit that is not a positive integer IS refused', () => {
  // Malformed, not ambitious. Zero, negative, fractional, non-numeric.
  for (const bad of ['0', '-5', '1.5', 'lots', 'NaN']) {
    const r = resolveCandleQuery({ interval: '1m', limit: bad });
    assert.equal(r.ok, false, `limit=${bad} should be refused`);
    assert.equal(r.reason, 'limit');
  }
});

test('a blank or absent limit falls through to the default', () => {
  assert.equal(resolveCandleQuery({ interval: '1m', limit: '' }).limit, DEFAULT_CANDLE_LIMIT);
  assert.equal(resolveCandleQuery({ interval: '1m', limit: undefined }).limit, DEFAULT_CANDLE_LIMIT);
});

test('the widest and narrowest spans at the cap are both sane charts', () => {
  // The reasoning behind having no separate "interval x limit" rule: at the
  // cap, 1d x 1000 is about 2.7 years and 1m x 1000 is about 16.7 hours.
  // Neither is the half-million-candle memory problem.
  const minutes = { '1m': 1, '5m': 5, '1h': 60, '4h': 240, '1d': 1440 };
  for (const iv of CANDLE_INTERVALS) {
    const spanHours = (minutes[iv] * MAX_CANDLE_LIMIT) / 60;
    assert.ok(spanHours >= 16 && spanHours <= 24_500,
      `${iv} x ${MAX_CANDLE_LIMIT} = ${spanHours}h is outside the sane band`);
  }
});

// --- overview --------------------------------------------------------------

test('a missing CoinGecko field becomes null, never zero', () => {
  // Zero reads as a fact - a market cap of nothing. Null renders as unavailable.
  const r = normaliseOverview({}, eth, 'T');

  for (const field of ['priceUsd', 'priceChange24hPct', 'marketCapUsd',
    'volume24hUsd', 'circulatingSupply', 'allTimeHighUsd', 'allTimeHighDate']) {
    assert.equal(r[field], null, `${field} should be null`);
  }
});

test('overview is labelled USD and CoinGecko, never USDC', () => {
  const r = normaliseOverview({ current_price: 2415.567 }, eth, 'T');
  assert.equal(r.quoteCurrency, 'USD');
  assert.equal(r.source, 'CoinGecko');
  assert.notEqual(r.quoteCurrency, 'USDC');
});

test('overview uses OUR asset name, not the provider\'s', () => {
  const r = normaliseOverview({ name: 'Ether (Wormhole)' }, eth, 'T');
  assert.equal(r.name, 'Ethereum');
});

// --- candles ---------------------------------------------------------------

const row = (t, o, h, l, c, v) => [t, String(o), String(h), String(l), String(c), String(v), 0, '0', 0];

test('candles carry OHLCV so one response drives a line or a candlestick', () => {
  const r = normaliseCandles([row(1000, 1, 2, 0.5, 1.5, 10)], eth, '5m');

  assert.equal(r.candles.length, 1);
  assert.deepEqual(r.candles[0], { timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 });
  assert.equal(r.interval, '5m');
});

test('candles are labelled USDT and Binance, never USDC', () => {
  const r = normaliseCandles([row(1, 1, 1, 1, 1, 1)], eth, '5m');
  assert.equal(r.quoteCurrency, 'USDT');
  assert.equal(r.pair, 'ETHUSDT');
  assert.equal(r.source, 'Binance');
});

test('a malformed candle is dropped, not coerced to zero', () => {
  // A NaN high coerced to 0 renders as a spike to the axis - a flash crash
  // that never happened.
  const r = normaliseCandles([
    row(1, 1, 2, 0.5, 1.5, 10),
    [2, '1', 'not-a-number', '0.5', '1.5', '10', 0, '0', 0],
    [3],
    null,
    row(4, 1, 2, 0.5, 1.5, 10),
  ], eth, '5m');

  assert.equal(r.candles.length, 2);
  assert.deepEqual(r.candles.map((c) => c.timestamp), [1, 4]);
});

// --- order book ------------------------------------------------------------

test('the order book says which venue it is, in the payload', () => {
  const r = normaliseDepth({ bids: [['100', '1']], asks: [['101', '2']] }, eth);

  assert.equal(r.venue, 'Binance');
  assert.equal(r.scope, 'single-exchange');
  assert.match(r.scopeStatement, /not a global market view/);
  assert.equal(r.quoteCurrency, 'USDT');
});

test('order book rows are numbers, capped at the requested depth', () => {
  const many = Array.from({ length: 20 }, (_, i) => [String(100 - i), '1']);
  const r = normaliseDepth({ bids: many, asks: many }, eth, 8);

  assert.equal(r.bids.length, 8);
  assert.deepEqual(r.bids[0], { price: 100, quantity: 1 });
  assert.equal(typeof r.bids[0].price, 'number');
});

test('a malformed order book row is dropped rather than shown as zero', () => {
  const r = normaliseDepth({ bids: [['100', '1'], ['bad', '1']], asks: [] }, eth);
  assert.equal(r.bids.length, 1);
  assert.equal(r.asks.length, 0);
});

// --- cache -----------------------------------------------------------------

test('the cache serves inside its TTL and expires after it', () => {
  cacheClear();
  const t = 1_000_000;
  cacheSet('k', 'v', 1000, t);

  assert.equal(cacheGet('k', t + 999), 'v');
  assert.equal(cacheGet('k', t + 1001), null, 'expired entries are not served');
});

test('a failed refetch does NOT serve the stale value', async () => {
  // The property that matters. An old number presented as current is exactly
  // the failure this project spent two days removing.
  cacheClear();
  cacheSet('k', 'stale', 1, Date.now() - 10_000);

  await assert.rejects(
    () => cached('k', 1000, async () => { throw new Error('provider down'); }),
    /provider down/,
  );
  assert.equal(cacheGet('k'), null, 'nothing was cached from a failure');
});

test('a successful load is cached and not repeated', async () => {
  cacheClear();
  let calls = 0;
  const load = async () => { calls += 1; return calls; };

  assert.equal(await cached('k', 10_000, load), 1);
  assert.equal(await cached('k', 10_000, load), 1);
  assert.equal(calls, 1, 'the second call was served from cache');
});

// --- the request must count the assets, not assume them --------------------

test('the overview asks for as many rows as there are assets', async (t) => {
  // per_page was hardcoded to 4 while the list held four. Adding AVAX and XRP
  // made it six ids into a four-row page, and with order=market_cap_desc the
  // provider returned the four largest and silently dropped SOL and AVAX. They
  // rendered as coins with every field null, because the graceful null-fill is
  // indistinguishable from a provider that genuinely had no data.
  //
  // This asserts the request, not the response: a page too small to hold the
  // list is the bug, and it is invisible in the output.
  const { MARKET_ASSETS: assets } = await import('../src/marketdata/assets.js');
  const { fetchOverview } = await import('../src/marketdata/providers.js');

  let seen = null;
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => assets.map((a) => ({
        id: a.coingeckoId, current_price: 1, market_cap: 1, total_volume: 1,
      })),
    };
  };
  t.after(() => { globalThis.fetch = real; });

  const out = await fetchOverview();

  assert.ok(seen, 'no request was made');
  assert.match(seen, new RegExp(`per_page=${assets.length}(&|$)`),
    `per_page must equal the asset count (${assets.length}), got: ${seen}`);

  for (const a of assets) {
    assert.ok(seen.includes(a.coingeckoId), `${a.symbol} was not requested`);
  }

  // And every asset came back populated rather than null-filled.
  assert.equal(out.assets.length, assets.length);
  assert.equal(out.assets.filter((a) => a.priceUsd === null).length, 0);
});
