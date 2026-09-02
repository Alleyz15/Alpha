// Shaping third-party market data.
//
// The properties worth protecting are about honesty rather than arithmetic: a
// missing figure must not become a zero, a Binance price must not be relabelled
// as USDC, and an order book must say which venue it belongs to.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseOverview, normaliseCandles, normaliseDepth } from '../src/marketdata/normalise.js';
import { resolveMarket, resolveRange, RANGE_KEYS, MARKET_ASSETS } from '../src/marketdata/assets.js';
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

test('ranges map to intervals, and an unknown range is refused not defaulted', () => {
  assert.equal(resolveRange('1D').interval, '5m');
  assert.equal(resolveRange('1y').interval, '1d');
  assert.equal(resolveRange(undefined).range, '1D', 'no range means the default');
  assert.equal(resolveRange('5Y'), null, 'an unknown range must not silently become 1D');
  assert.deepEqual(RANGE_KEYS, ['1H', '1D', '1W', '1M', '1Y']);
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
