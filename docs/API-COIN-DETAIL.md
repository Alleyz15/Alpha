# Coin Detail market data — API note

For the frontend developer. Three read-only endpoints, built and live.

**Before you start: the frontend has no charting library.** Deps today are
`animejs`, `react`, `react-dom`. Choosing one, adding it and building the
candlestick chart is your half of this, and it is larger than the backend half.
Worth knowing before you plan the day.

---

## Endpoints

```
GET /api/assets/overview
GET /api/assets/:symbol/candles?range=1D
GET /api/assets/:symbol/order-book
```

`:symbol` is `ETH`, `BTC`, `SOL` or `BNB`, case-insensitive. Anything else is
`404`.

**There is no streaming endpoint, deliberately.** Poll the order book every 2–3
seconds. Over a two-minute demo that is visually identical to a 100ms feed, and
it removes the failure a dropped websocket causes: a stale panel that looks like
a working one. A book two seconds behind is honest; a frozen book is not.

---

## Three currencies. They are different, and that is not a bug.

| Source | Currency | What it is |
|---|---|---|
| CoinGecko | **USD** | Aggregated across exchanges |
| Binance | **USDT** | One exchange, one pair |
| Alpha protection | **USDC** | Thetanuts collateral |

Measured within one second of each other:

```
ETH   CoinGecko  $2,415.57 USD     Binance  $2,411.63 USDT     Thetanuts  ~$2,444 USDC
```

**Never relabel a USDT price as USDC** to make a page look consistent. Every
response carries its own `quoteCurrency` and `source`; render them. Small
differences between the three are normal and must not be smoothed.

---

## `GET /api/assets/overview`

All four assets in one request. Cached 45 seconds server-side.

```json
{
  "assets": [
    {
      "symbol": "BTC",
      "name": "Bitcoin",
      "priceUsd": 77220,
      "priceChange24hPct": -2.07,
      "marketCapUsd": 1549900000000,
      "volume24hUsd": 42000000000,
      "circulatingSupply": 19950000,
      "allTimeHighUsd": 126080,
      "allTimeHighDate": "2025-10-06T00:00:00.000Z",
      "quoteCurrency": "USD",
      "source": "CoinGecko",
      "updatedAt": "2026-09-01T18:12:00.000Z"
    }
  ],
  "source": "CoinGecko",
  "quoteCurrency": "USD",
  "updatedAt": "2026-09-01T18:12:00.000Z"
}
```

**Any field can be `null`.** CoinGecko omits figures for some coins. A missing
value is `null`, never `0` — zero reads as a fact ("market cap: nothing"), null
renders as "unavailable". Guard every formatter; `Intl.NumberFormat` turns
`null` into `0`, which is how the dashboard came to show `$0.00`.

All four assets always appear, in a fixed order, even if the provider omitted
one — that asset simply has null fields.

---

## `GET /api/assets/:symbol/candles?range=1D`

Cached 5 minutes per symbol and interval.

| `range` | Interval | Candles |
|---|---|---|
| `1H` | 1m | 60 |
| `1D` | 5m | 288 |
| `1W` | 1h | 168 |
| `1M` | 4h | 180 |
| `1Y` | 1d | 365 |

Default is `1D`. An unknown range is `400` — it is not silently defaulted.

```json
{
  "symbol": "BTC",
  "pair": "BTCUSDT",
  "quoteCurrency": "USDT",
  "range": "1D",
  "interval": "5m",
  "candles": [
    { "timestamp": 1788310800000, "open": 77420.1, "high": 77510.4,
      "low": 77380.2, "close": 77487.38, "volume": 125.6 }
  ],
  "source": "Binance",
  "updatedAt": "2026-09-01T18:12:00.000Z"
}
```

**One response drives both chart modes** — line from `close`, candlesticks from
open/high/low/close. Do not fetch twice.

`timestamp` is epoch milliseconds. Candles are oldest first. A malformed candle
is dropped by the backend rather than passed through, so you will never receive
a bar with a null in it.

---

## `GET /api/assets/:symbol/order-book`

Cached 3 seconds, so polling every 2–3s is cheap and a page refresh does not
hammer the venue.

```json
{
  "symbol": "ETH",
  "pair": "ETHUSDT",
  "quoteCurrency": "USDT",
  "bids": [{ "price": 2411.63, "quantity": 41.0477 }],
  "asks": [{ "price": 2411.64, "quantity": 4.479 }],
  "venue": "Binance",
  "scope": "single-exchange",
  "scopeStatement": "This is Binance's ETH/USDT order book, not a global market view. Other venues quote different prices, and Alpha's protection is priced separately on Thetanuts.",
  "source": "Binance",
  "updatedAt": "2026-09-01T18:12:01.000Z"
}
```

Ten rows a side, best price first.

**Render `scopeStatement`.** An order book belongs to one exchange, and calling
it "the market's order book" would be false. The disclosure travels in the
payload for the same reason `isRealProtocol` does on the loan-stress endpoint —
so styling cannot drop it. `venue` and `scope` are there if you want to build
your own wording; the sentence is there so you do not have to.

---

## Failure — the one behaviour I would least want changed

A provider that is rate-limited, unreachable or returning nonsense produces:

```
HTTP 503
{ "error": { "code": "MARKET_DATA_UNAVAILABLE",
             "message": "CoinGecko rate limit reached",
             "details": { "provider": "CoinGecko", "status": 429 } } }
```

**You will never receive a shaped response with plausible numbers in it.** No
zeros, no empty arrays standing in for a quiet market, no last-known value
served as current. If the data is not real, the request fails and the only thing
you can render is "unavailable".

That is deliberate. An empty order book and an unreachable exchange look
identical in a payload of zeros, and only one of them means the market is quiet.

Other statuses: `404` unknown symbol, `400` unknown range.

---

## What these are not

**Display only.** Nothing from CoinGecko or Binance touches a quote, a fill, a
credit limit, a participation rate or a settlement figure. Protection is priced
on the Thetanuts order book and nowhere else.

That is enforced by `backend/test/marketdataIsolation.test.js`, which fails if
any pricing module imports from `src/marketdata/` or vice versa — the same
structural guarantee that keeps the wallet signer out of the API layer. If you
ever see a protection figure that matches a Binance price exactly, something is
wrong.
