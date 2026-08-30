# SETUP

Environment setup for the MUBA Hacks 2026 project (Thetanuts Track 01).

**Keep this file updated.** Every time you install something or hit a bug, add a line. Doing it as you go takes seconds; reconstructing it later takes an hour.

> ## ⚠️ If you set up before 30 Aug, read this first
>
> The repository was restructured. If you cloned or configured anything under the old flat layout, three things changed:
>
> | Then | Now |
> |---|---|
> | Scripts at `backend/*.js` | Scripts at `backend/scripts/*.js` |
> | `node test.js` | `npm run inspect:orders` (see the script table below) |
> | Each script built its own SDK client | All scripts import `backend/src/thetanuts/client.js` |
>
> **What to do:** `git pull`, then `cd backend && npm install`. Nothing else.
>
> **Your `.env` does not move.** It stays at the repository root and still works — the npm scripts load it with `--env-file-if-exists=../.env`. Do not copy it into `backend/` or `frontend/`; one file serves the whole project, and duplicates drift apart silently.
>
> If you had local edits to any of the moved scripts, they were carried through the move, but check `git status` before pulling.

---

## Versions

Everyone should be on the same Node version. Mismatched versions cause "works on my machine" problems.

| Tool | Version | How to check |
|---|---|---|
| Node.js | **v24.20.0** | `node -v` |
| npm | **11.19.0** | `npm -v` |
| Git | **2.55.0.windows.5** | `git --version` |
| OS | Windows | |

---

## Repository layout

```
Alpha/
├── backend/            Node. Owned by the backend developer.
│   ├── scripts/        One-off diagnostic tools, run by hand
│   ├── src/
│   │   ├── thetanuts/  SDK integration — client.js is shared by every script
│   │   ├── db/         Supabase client and queries (Phase 2)
│   │   ├── api/        HTTP endpoints (Phase 5)
│   │   └── scheduler/  Settlement polling (Phase 4)
│   └── package.json
├── frontend/           Vite + React. Owned by the frontend developer.
├── supabase/migrations/  Versioned schema. Never edit an applied file.
├── docs/               These documents
├── .env.example        One template for the whole project. Committed.
├── .env                Root. Not committed. Used by backend AND frontend.
└── README.md
```

`backend/` and `frontend/` have separate `package.json` files on purpose: a shared one means two people editing the same `package-lock.json`, and those conflicts are thousands of lines of generated content.

---

## Quick start

```bash
git clone https://github.com/Alleyz15/Alpha.git
cd Alpha
```

**Backend**

```bash
cd backend
npm install                 # NOT npm init - that would overwrite package.json
npm run inspect:orders      # read-only connectivity check, no wallet needed
```

Expected: a live order count of roughly 300, then one order printed as JSON.

Ask a teammate for `.env` values in a DM.

**There is one `.env` for the whole project, at the repository root.** Not one per folder. Copy it from the template:

```bash
cp .env.example .env
```

The backend loads it with `--env-file-if-exists=../.env`. The frontend loads the `VITE_`-prefixed lines through `envDir: '../'` in `vite.config.js`.

> **Vite does not read a parent directory by default.** If `frontend/vite.config.js` is missing `envDir: '../'`, every `VITE_` variable comes back `undefined` and nothing says why. That one line is the fix.

**Frontend** — in a second terminal:

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

No separate `.env` here — it reads the root one.

### Backend scripts

| Command | What it does |
|---|---|
| `npm run inspect:orders` | Live order count and one order's full structure |
| `npm run inspect:expiries` | Every expiry on the book, with days out and order counts |
| `npm run inspect:sdk` | Every module and method on the SDK client |
| `node --env-file-if-exists=../.env scripts/test.js` | Connectivity check: order count and spot prices |
| `node --env-file-if-exists=../.env scripts/check_collar.js` | Whether the loan/collar modules are live on Base |

The last two have no npm entry, so they need the env flag spelled out. Run all of them from inside `backend/`.

> **Never run `npm init` in a folder that already has a `package.json`.** It silently overwrites the file, dropping `"type": "module"` and the dependency list, and you won't find out until `import` stops working.

> `CLAUDE.md` and `codex.md` are not in the repo — they're shared through Discord. Ask for the current copies and put them in your project root so your AI tools follow the same rules as everyone else's.

---

## Services

### Alchemy (Base mainnet RPC) — DONE

1. Sign up at alchemy.com. Free tier, no credit card.
2. Create App → Chain: **Base**, Network: **Mainnet**
3. Copy the HTTPS URL into `THETANUTS_RPC_URL` in `.env`

> Do not use the public Base endpoint. It times out randomly and the failures look like bugs in your own code.

### Thetanuts SDK — DONE

Already installed and wired into the shared client. Recorded for reference, not a step to repeat — `npm install` in `backend/` gets you the same thing.

```bash
npm i @thetanuts-finance/thetanuts-client ethers dotenv
npm i -g @thetanuts-finance/cli     # optional, quote and fill from the terminal
npx -y @thetanuts-finance/mcp       # optional, feeds SDK context to Claude / Codex
```

- Chain: Base mainnet, chainId **8453**
- Docs: docs.thetanuts.finance/for-builders/sdk
- Repo: github.com/Thetanuts-Finance/thetanuts-sdk
- **If the docs and the repo disagree, trust the repo.**
- There is no Thetanuts API key. All you need is a working Base RPC.

### Frontend — NOT SET UP YET

```bash
npm create vite@latest frontend -- --template react
cd frontend
npm i animejs
```

**React + Vite + anime.js. Nothing else** — no UI component library, no state manager, no router. There are three screens; extra dependencies are extra surface area for things to break, and the judges do not score the tech stack.

anime.js v4 notes:
- Scope every animation with `createScope({ root })` so selectors don't leak between components
- Always `revert()` in the `useEffect` cleanup, or animations outlive their component
- **Never let React and anime.js control the same property on the same element.** React re-renders will overwrite mid-animation; the symptom is intermittent flicker that is very hard to trace

### Backend API — DONE (no fill yet)

Two terminals. Backend first, from `backend/`:

```bash
npm run api
```

Then the frontend, from `frontend/`:

```bash
npm run dev
```

Verify the whole surface without a browser:

```bash
npm run api:check
```

| Endpoint | Purpose |
|---|---|
| `GET /api/demo-context` | display name, simulated balances |
| `POST /api/quote` | `{ asset, units, mode, protectionPct? \| targetValueUsdc?+targetDate? }` → tier set |
| `POST /api/purchase` | `{ quoteId, tierId }` — identifiers only |
| `GET /api/positions` | the demo user's positions |
| `GET /health` | liveness, touches nothing |

Error envelope is `{ error: { code, message, details? } }` with `QUOTE_EXPIRED` 409, `BALANCE_EXCEEDED` 400, `NO_EXPIRY` 404, `NO_TIERS` 404, `INVALID_REQUEST` 400, `UPSTREAM_ERROR` 502.

> ⚠️ **`POST /api/purchase` does not buy anything yet.** It persists the chosen quote and a `pending` position, then returns `txHash: null`, `explorerUrl: null`, `status: "pending_fill"`, `simulated: true`. The real fill is Phase 3. **Keep `VITE_USE_MOCK_API=true` until it lands** — in live mode the interface tells the user a real transaction was sent, and right now that would be untrue (BR-51).

**Quote sets live in memory for 60 seconds** (`QUOTE_VALIDITY_SECONDS`), not in Postgres — the `quotes` table records what was purchased, not every price displayed. Restarting the API drops outstanding quotes and users must re-quote. Only the tier actually bought is persisted, at purchase time.

`DEMO_USER_ID` pins which seeded user the API acts for; without it the earliest is used. The client never sends a user id.

### Supabase — DONE

Project `gphzqvsdubygvijunobj`, region `ap-southeast-1` (Singapore). Schema, RLS and demo seeds are applied.

**Verify your setup in one command**, from `backend/`:

```bash
node --env-file-if-exists=../.env scripts/db-check.js
```

It checks the tables, the seeds, that an anonymous client is locked out, and a full quote → position → settled round trip including the event trail. It writes test rows and deletes them again. Set `SUPABASE_PUBLISHABLE_KEY` to include the anonymous-lockout check; without it that one is skipped.

#### Migrations

The schema lives in `supabase/migrations/`, one logical change per file, named `YYYYMMDDHHMMSS_description.sql`.

- **Never edit a migration that has already been applied.** Write a new one. Editing an applied file makes your database and everyone else's diverge silently, and nobody finds out until something breaks in a way that makes no sense.
- **Never change the schema in the Supabase web editor.** Clicking through the table editor creates no migration file, so the folder and the real database drift apart and the whole thing stops being trustworthy.
- The filename timestamp must match the version recorded in `supabase_migrations.schema_migrations`, or the CLI will try to re-apply work that is already done.

#### Two failure modes that look identical

Both make a query come back with nothing, and they have different fixes:

| Symptom | Cause | Fix |
|---|---|---|
| `42501 permission denied for table X` | missing `GRANT` | grant the role DML — see `20260830210500_grant_service_role_access.sql` |
| query returns zero rows, no error | RLS with no matching policy | add a policy, or use the secret key |

> ⚠️ **This project's default privileges do not grant DML on new tables to `service_role`.** A newly created table is unreadable by the backend until it is granted explicitly. The grant migration sets `ALTER DEFAULT PRIVILEGES` so future tables are covered, but if you add a table and immediately get `42501`, this is why.

#### If you are setting up a fresh project

1. Sign up at supabase.com → New Project
2. Region: **Southeast Asia (Singapore)** — closest to Malaysia
3. Set a database password and **save it in a password manager**. Losing it is painful.
4. Settings → API Keys → **Publishable and secret API keys** tab. Use the new format:
   - Project URL → `SUPABASE_URL`
   - Secret key (`sb_secret_...`) → `SUPABASE_SECRET_KEY` (**server-side only**)

   > Do **not** use the legacy `anon` / `service_role` JWT keys. Supabase deprecates them by the end of 2026, and new projects should start on the new format. Secret keys can also be revoked individually, instead of regenerating the whole JWT secret.

   The publishable key is not needed — the frontend never talks to Supabase directly, only to our backend API.
5. **Enable Row Level Security on every table.** Supabase does not enable it by default. Our backend uses the secret key, which bypasses RLS, so RLS is not today's line of defence — but leaving it off means any future exposure is immediately fatal.

---

## Connectivity check

Read-only. No wallet, no signing, no funds at risk.

```js
import 'dotenv/config';
import { ThetanutsClient } from '@thetanuts-finance/thetanuts-client';
import { ethers } from 'ethers';

const client = new ThetanutsClient({
  chainId: 8453,
  provider: new ethers.JsonRpcProvider(process.env.THETANUTS_RPC_URL),
});

console.log((await client.api.fetchOrders()).length, 'live orders');
console.log(await client.api.getMarketData());
```

**Status: working as of 30 Aug 2026.**

This code now lives in `backend/src/thetanuts/client.js` and is imported by every script rather than repeated in each one. If you need a client in new code, import it — do not construct another.

---

## What is actually on the order book

Checked 29 Aug 2026. The book is live, so counts change constantly.

**Underlyings with price feeds:** ETH, BTC, SOL, XRP, BNB, AVAX
**Collateral token:** USDC
**Order count:** ~320 live orders

**Expiries available:**

| Expiry | Days out | Orders |
|---|---|---|
| 2026-08-30 | +1 | 66 |
| 2026-08-31 | +2 | 84 |
| 2026-09-01 | +3 | 43 |
| 2026-09-04 | +6 | 24 |
| 2026-09-11 | +13 | 31 |
| **2026-09-25** | **+27** | **49** |
| **2026-10-30** | **+62** | **22** |

> ⚠️ **The table above is the RAW book. It is not what we can buy.** Once puts, below-spot strikes and the buy side (BR-1) are filtered, the picture is much smaller — see below. An earlier version of this note claimed 27-day and 62-day options "exist with real liquidity" and that a 30-day product was feasible. **Both claims are false of the buyable book.**

### Raw book vs buyable book (BR-52)

Checked 31 Aug 2026. Of ~330 raw orders, these are the ones we can actually fill — puts, struck below spot, where the maker is the seller:

| Expiry | Days out | ETH strikes | BTC strikes | Floors available |
|---|---|---|---|---|
| 2026-09-04 | +4.7 | 4 | 4 | 3–9% (ETH), 2–6% (BTC) |
| 2026-09-11 | +11.7 | 6 | 7 | 5–15% (ETH), 3–11% (BTC) |
| **2026-09-25** | **+25.7** | **9** | **9** | **7–23% (ETH), 5–19% (BTC)** |
| ~~2026-10-30~~ | ~~+62~~ | **0** | **0** | — |

**There are no buyable puts beyond ~26 days.** The +62 day expiry carries 22 raw orders but none survive the filter. Consequences:

- **A 30-day protection product is not deliverable.** BR-6 forbids an expiry earlier than the user's target date, so a 30-day request returns nothing — the longest available is 25.7 days, 4.3 days short. Quote 25 days, not 30.
- **Only ETH and BTC are tradable at all.** SOL, XRP, BNB and AVAX have puts on the book but zero on the buy side.
- **Phase 8's vault cannot use a 62-day call.** It is repositioned as 26-day principal protection with a 4–7% participation rate.

Always measure the *buyable* book. The raw count is roughly double and is a misleading number to plan against.

### Order object shape

```js
{
  order: {
    strikePrice: "238000000000",   // 8 decimals -> $2,380
    price: "214908926",            // 8 decimals -> $2.15 (the premium)
    expiry: "1788076800",          // unix seconds
    optionType: 1,
    underlyingToken: "0x4200...0006",  // WETH
    collateralToken: "0x8335...2913",  // USDC
  },
  availableAmount: "10000000000",
  rawApiData: {
    isCall: false,                 // false = put
    isLong: false,
    greeks: { delta: -0.0783, iv: 0.3016, gamma: 0.0039, theta: -2.862, vega: 0.1827 }
  }
}
```

**Decimals: `strikePrice` and `price` both use 8 decimals — divide by 1e8.** Getting this wrong makes premiums look 100x too expensive.

### Decimals — the full table

All verified against the live book on 31 Aug 2026, not from documentation. Conversions live in `backend/src/thetanuts/decimals.js`; do not convert inline anywhere else.

| Value | Decimals | Notes |
|---|---|---|
| `strikePrice`, `strikes[]` | 8 | |
| `price` | **8** | The per-contract premium. **8, not USDC's 6** — see the trap below |
| `availableAmount`, `maxCollateralUsable` | 6 | USDC |
| `Order.numContracts` | **6** | Not 18 — see below |
| `numContracts` **argument** to the payout helpers | **18** | Different from the field above |
| return value of the payout helpers | 6 | USDC |

**Runtime types:** order fields are `bigint` — `strikePrice`, `price`, `expiry`, `numContracts`, `deadline`, `availableAmount`. But `rawApiData.strikes[]` and `rawApiData.maxCollateralUsable` are **strings**. The same strike is reachable as both types, and a string passed to some SDK helpers skips scaling silently. Always read from `order.order`, never `rawApiData`.

#### Trap 1 — the premium is 8 decimals even though it is paid in USDC

```js
client.utils.fromPriceDecimals(215625969n)  // "2.15625969"  correct
client.utils.fromUsdcDecimals(215625969n)   // "215.625969"  100x too expensive
```

`price` is a USDC amount, so reaching for `fromUsdcDecimals` is the natural mistake. It does not throw.

#### Trap 2 — `numContracts` means two different scales

**`Order.numContracts` is 6 decimals.** Verified by arithmetic: `numContracts(6dp) × price(8dp)` equals `availableAmount(6dp)` exactly, 8/8 orders sampled.

```
nc=4303987819  px= 2.32342665  avail=10000.00 | nc@6dp*px=10000.00 | nc@18dp*px=1.00e-8
nc=2425421120  px= 4.12299535  avail=10000.00 | nc@6dp*px=10000.00 | nc@18dp*px=1.00e-8
nc= 642855247  px=15.55560141  avail=10000.00 | nc@6dp*px=10000.00 | nc@18dp*px=1.00e-8
```

**But `utils.calculatePayoutAtPrice` and `utils.calculateMaxPayout` expect 18 decimals** for the same argument, and return 6 decimals. Verified by computing payouts by hand against the live book: 25/25 for `calculatePayoutAtPrice`, 10/10 for `calculateMaxPayout`, across several strikes, contract counts, in-the-money and out-of-the-money cases.

**Both are correct — they are describing different things.** The `.d.ts` field comment on the `Order` struct (line 758) documents the field; the `@example` blocks on the payout helpers (`5n * 10n**18n`) document the argument. Reading either as the whole story gives a 10¹² error.

**Passing an order's own `numContracts` into a payout helper is silently wrong:**

```
strike $2,250, settling at $2,000, 4637.660318 contracts

hand                4637.660318 × $250 = $1,159,415.08
passed as-is (6dp)  raw             1 =        0.000001 USDC   ← 10^12 too small
rescaled to 18dp    raw 1159415079500 =  1,159,415.0795 USDC   ← correct
```

It returns `1`, not an error. Use `toPayoutContracts()` from `decimals.js` at that boundary. **This matters for task 1.8** (scenario previews) and for anything showing a user what they would receive.

#### Trap 3 — `order.numContracts` is not the order's size

It looks like the quantity available. It is not, and it overstates the real cap by roughly 1000×:

```
order.numContracts        4932.23    = availableAmount / price   ← NOT a size limit
calculateMaxContracts()      4.44    = availableAmount / strike  ← the real cap
maxContracts × strike   10,000.00    = the maker's collateral, exactly
```

The seller's collateral has to cover the **maximum payout**, which is `strike × contracts` — so the cap is `availableAmount / strike`. `order.numContracts` instead answers "how many contracts if the entire collateral were spent on premium", which is not a thing anyone can do.

Verified: `maxContracts × strike` equals `availableAmount` to the cent on every order sampled.

**Always size with `optionBook.calculateMaxContracts(order)`.** `toHumanOrder()` deliberately does not expose `numContracts` so it cannot be picked up by mistake. See `backend/src/thetanuts/sizing.js`.

**One contract protects one unit of the underlying** — `calculateMaxPayout` returns exactly `strike` for one contract. Protecting 1 ETH takes 1 contract.

**Fractional contracts work.** `calculateNumContracts(usdcAmount, price)` round-trips exactly at 6dp granularity: 1 USDC buys 0.493223 contracts, and 0.493223 × 2.02747993 = 1.000000 USDC. The protocol's *minimum* fill size is still undocumented (requirements.md §7 open question 4), so `sizePosition()` takes `minContracts` as a parameter and only reports violations — it must become a hard refusal once the real figure is known.

### Identifying which asset an order is for

**`order.underlyingToken` is not a usable asset identifier.** It is the WETH address for ETH, an unrelated token for BTC, and **`0x0000…0000` for SOL, XRP, BNB and AVAX** — four assets share one value, so it cannot tell them apart.

**Use `rawApiData.priceFeed` instead**, resolved against `client.chainConfig.priceFeeds`:

```js
client.chainConfig.priceFeeds
// { ETH: "0x71041d…", BTC: "0x64c911…", SOL: "0x975043…", DOGE: "0x8422f3…",
//   XRP: "0x9f0C1d…", BNB: "0x4b7836…", PAXG: "0x5213eB…", AVAX: "0xE70f2D…",
//   "ETH/USD": "0x71041d…", "BTC/USD": "0x64c911…" }
```

Feed addresses are unique per asset and present on every order. Note the `ETH/USD` and `BTC/USD` aliases point at the same addresses as `ETH` and `BTC` — drop keys containing `/` or those two assets get listed twice. `DOGE` and `PAXG` have feeds but no market data and no orders.

> `api.filterOrders({ asset, type })` looks like it would do this for us. **It is broken** — it throws `Cannot read properties of undefined (reading 'map')` for every asset. Filter `fetchOrders()` by hand.

### Spot prices are already plain numbers

`api.getMarketData()` returns human-scale JS numbers, **not** 8-decimal integers:

```js
{ prices: { ETH: 2458.24, BTC: 78156.73, SOL: 105.13, XRP: 1.39, BNB: 693.54, AVAX: 7.38 },
  metadata: { lastUpdated: 1788088438000, currentTime: 1788088412911 } }
```

**The 8-decimal rule applies only to `strikePrice` and `price` on order objects.** Dividing a spot price by 1e8 gives a number 100 million times too small.

> `api.getMarketPrices()` returns `{ price: "0", change24h: 0, timestamp: null }` — all zeros, for every asset. **Unusable.** Use `getMarketData()`.

### Order side — which orders we are allowed to fill

`isBuyer` describes the **maker's** side, from the taker's perspective. We are always the taker.

| `order.isBuyer` | `rawApiData.isLong` | Maker wants to | We would be the | Fillable? |
|---|---|---|---|---|
| `false` | `true` | sell | **buyer** | ✅ yes |
| `true` | `false` | buy | **seller** | ❌ **never — BR-1** |

`isLong === !isBuyer` always (verified across all 359 orders on the book).

**This is a product constraint, not a detail.** Selling exposes us to near-unlimited loss, which is the exact risk this product exists to keep users away from. Roughly **half the puts on the book are the forbidden side**, so an unfiltered "puts on ETH" count is about double what we can actually trade.

**Consequence for asset selection:** filtering to buyable puts leaves **ETH and BTC only**. SOL, XRP, BNB and AVAX each have 10–20 puts on the book and **zero** we can fill.

| Asset | Puts on book | Buyable by us |
|---|---|---|
| ETH | 48 | **19** |
| BTC | 54 | **22** |
| SOL | 20 | 0 |
| XRP | 13 | 0 |
| BNB | 16 | 0 |
| AVAX | 10 | 0 |

Checked 30 Aug 2026; the book moves constantly, but the ETH/BTC-only shape has been stable. This is what UC-1 exception E2 ("disable that asset in the UI") has to act on.

---

## Gotchas we already hit

Format: symptom → cause → fix

- **`Cannot use import statement outside a module`** → `package.json` defaults to `"type": "commonjs"` → change it to `"type": "module"`
- **`Do not know how to serialize a BigInt`** → order objects contain BigInt values that `JSON.stringify` can't handle → pass a replacer: `JSON.stringify(obj, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2)`
- **`.env` value read as empty or with a leading space** → spaces around `=` → write `KEY=value`, no spaces
- **`LF will be replaced by CRLF` warning on git add** → Windows vs Unix line endings → harmless warning, ignore. A `.gitattributes` containing `* text=auto eol=lf` silences it.
- **`pathspec '.env.example' did not match any files`** → the file does not exist in the current folder, or Windows Explorer refused to create a dotfile → create it from inside VS Code, which allows leading dots
- **RPC timeouts / "unstable API"** → using the public Base endpoint → use your own Alchemy key
- **Every `VITE_` variable is `undefined` in the frontend** → Vite only reads `.env` from its own directory by default → add `envDir: '../'` to `frontend/vite.config.js`
- **Script can't find `.env` after the restructure** → run it from inside `backend/`, and use the npm script where one exists → the npm entries carry `--env-file-if-exists=../.env`
- **`npm init` in a folder that already has `package.json`** → silently overwrites it, dropping `"type": "module"` and the dependency list → run `npm install` instead; you only find out when `import` breaks

---

## Environment variables

`backend/.env` — copy from `.env.example` and fill in.

| Variable | Needed by | Notes |
|---|---|---|
| `THETANUTS_RPC_URL` | Phase 1 | Alchemy, Base mainnet. The only one Phase 1 needs |
| `SUPABASE_URL` | Phase 2 | Project URL |
| `SUPABASE_SECRET_KEY` | Phase 2 | `sb_secret_...`, server-side only |
| `THETANUTS_PRIVATE_KEY` | **Phase 3** | Burner wallet. **Leave empty until then** |
| `MAX_PREMIUM_PER_FILL_USDC` | Phase 3 | Hard cap, BR-33 |
| `MAX_FILLS_PER_DAY` | Phase 3 | Hard cap, BR-34 |
| `QUOTE_VALIDITY_SECONDS` | Phase 1 | BR-8 |
| `PRICE_TOLERANCE_PCT` | Phase 3 | BR-9 |
| `SCHEDULER_INTERVAL_MINUTES` | Phase 4 | BR-11 |
| `DEFAULT_PROTECTION_PCT` | Phase 1 | BR-4 |
| `LOAN_INTEREST_RATE_ANNUAL_PCT` | Phase 7 | Interest charged on USDC loans |
| `VAULT_SIMULATED_YIELD_ANNUAL_PCT` | Phase 8 | **Simulated.** The UI must say so (BR-37) |
| `VAULT_TERM_DAYS` | Phase 8 | Cannot exceed 62 — the book's longest expiry |
| `PORT` | Phase 5 | Backend API port |

`frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:3000
```

### What must NOT be an environment variable

Two figures are deliberately absent, and adding them would break the product's claims:

| Not this | Because |
|---|---|
| `LOAN_LTV_RATIO` | The credit limit comes from the filled put's strike (BR-39). A configured ratio would produce the same number with or without the option, which makes our answer to judges false |
| `VAULT_PARTICIPATION_RATE` | It comes from the premium actually paid and the exposure actually obtained (BR-38). Configuring it means displaying a number nobody earned |

Both are computed at purchase time and stored on the row (BR-40). Formulas are in `requirements.md`.

**The test:** if changing a value would alter what an existing user already bought, it does not belong in the environment.

---

## Deployment

**There is none.** The demo runs locally at the pitch: frontend on Vite's dev server, backend as a local Node process.

Consequences:
- CORS must be configured between the two local ports (5173 → 3000)
- **The whole environment must be verified on the machine that will actually be used on stage.** Frontend on one laptop and backend on another will not work
- A demo video is still required by the rules, so record it well before the deadline

---

## Secrets handling

The repo is **public**. Treat this seriously.

- `.env` is gitignored. Never commit it, never screenshot it, never paste keys in the group chat.
- Share keys one-to-one in a DM. Nothing is hosted, so there is no platform panel to put them in.
- Before sharing, confirm the other person's `.gitignore` contains `.env`.
- **Run `git status` after creating `.env`.** If `.env` shows up, `.gitignore` is not working — stop and fix it before continuing.
- Once a key is committed it stays in the git history forever, even if you delete it later. Rotate the key instead.
- **Variables prefixed with `VITE_` are bundled into the browser** and readable by anyone. Never put a private key or the Supabase secret key behind that prefix.
- The wallet used for trading must be a **fresh burner** holding only a few USDC and cents of ETH for gas.