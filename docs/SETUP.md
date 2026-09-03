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

### The fill path — pre-flight only, nothing broadcast

From `backend/`:

```bash
npm run preflight
```

Runs the ten-item checklist against a real order and broadcasts nothing. Takes arguments, because premiums moved fourfold in a single day and a script that cannot be re-aimed is one you rewrite under time pressure:

```bash
node --env-file-if-exists=../.env scripts/preflight-check.js 0.05 middle
```

`UNITS` then `TIER` (`highest` | `middle` | `lowest`), plus `--keep` to leave the test rows behind.

> ⚠️ **A `Panic due to OVERFLOW(17)` from check 9 does NOT mean what it says.**
> It is the contract's way of refusing an order we are not allowed to take. We
> lost hours to it: the first guess was a missing allowance, which was wrong —
> the approval went through and the revert was identical. The real cause was the
> inverted side filter. If you see it now, the order is one we should not have
> selected, not one that needs an approval.

**The approval is a separate script**, because a check that silently sends a transaction is one nobody can run freely:

```bash
node --env-file-if-exists=../.env scripts/approve.js 3
```

Reports what it would do and sends nothing. Add `--confirm` to actually send it. It spends **gas only** (a fraction of a cent on Base), moves **no USDC**, and is reversible by approving 0.

#### The budget is not $10

Every fill has to sit at the bottom of BR-15's 1–3 USDC range, not the middle:

| | |
|---|---|
| Phase 3 first fill | 1–3 USDC |
| Phase 4 short-dated position | 1–3 USDC — required to demo settlement at all |
| Two rehearsals | 2–6 USDC |
| Demo day, live on stage | 1–3 USDC |
| **Total** | **5–15 USDC against a ~10 USDC wallet** |

The pre-flight output prints USDC remaining after the fill would settle, and how many more of that size are affordable. Watch that number rather than the balance.

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

### What we can actually buy (corrected 31 Aug)

> ⚠️ **Everything this section said before 31 Aug was wrong**, including a table
> claiming "SOL/XRP/BNB/AVAX have zero fillable puts" that was cited as evidence of
> BR-1 working in code. It was a bug. What follows is measured against the chain by
> simulating every order.

Three filters decide whether an order is ours to fill:

| Filter | Rule | Why |
|---|---|---|
| Side | `order.isBuyer === true` | We must be the **buyer** (BR-1) |
| Type | `rawApiData.isCall === false` | Downside protection is a put |
| Legs | exactly **one** strike | Vanilla only — see below |

**Fillable vanilla puts below spot, by asset:**

| Asset | Buy-side puts | Vanilla | Simulated OK |
|---|---|---|---|
| ETH | 27 | 17 | 6/6 |
| BTC | 32 | 16 | 6/6 |
| SOL | 14 | 12 | 6/6 |
| BNB | 13 | 10 | 6/6 |
| AVAX | 9 | 9 | 2/6 |
| XRP | 10 | 10 | **0/6** |

**Four assets work well**, not two. XRP reverts at every size; AVAX is intermittent.

**Tenor and depth — the numbers that define the product:**

```
expiry      (+days)  1-strike  2-strike  3-strike
2026-08-31    +0.4d      22        8         2
2026-09-01    +1.4d      37        4         0
2026-09-02    +2.4d      15        3         0
2026-09-25   +25.4d       0        3         2
2026-10-30   +60.4d       0        7         2
```

**The long-dated orders are all multi-leg, and that is OUR exclusion, not the
market's ceiling.** The book carries expiries to two months. At three days and
beyond, the buy-side puts are spreads - ETH shows a $2,440/$2,420 two-leg and a
$2,050/$2,000/$1,950 three-leg at 58 days. A spread stops protecting below its
lower strike, so the floor we would show would not be a floor. We buy single-leg
only, and that is what limits our tenor.

The single-leg maximum is not a fixed number either: every expiry is at 08:00
UTC and the set rolls daily, so it sweeps from just under three days after a
roll to about two before the next. And
floors are shallow: ETH −0.4% to −6.1%, BTC −0.5% to −4.4%, SOL −0.7% to −7.5%.

A 20% floor over 30 days is not available and never was.

### Why the inverted filter survived eight tasks

This is worth recording so nobody re-derives it.

**Market makers sell near-the-money and buy deep out-of-the-money.** So the deep
strikes — the 20%-down floors the product was designed around — carry
`isBuyer === false`: the maker wants to *buy* those, and filling one would make us
the seller.

The broken filter selected exactly those orders. It surfaced a book that looked
ideal — deep floors, long tenors, 26- and 60-day expiries — and every one of them
was unfillable. The quote engine priced them, the tier logic ranked them, and the
API served them for eight tasks, because nothing in a read-only path ever asks the
chain whether an order can actually be filled.

**It only surfaced when we tried to spend money.** `callStaticFillOrder` reverted
with `Panic(0x11)`, an arithmetic overflow that says nothing about sides or
permissions.

The lesson for anything similar: a filter that selects what we *cannot* do looks
identical to one that selects what we *can*, until something external disagrees.
Simulate early.

### Vanilla vs multi-leg — not interchangeable

The book carries three products, and only the first is ours:

| Implementation | Strikes | Product | Max payout |
|---|---|---|---|
| `0x7355EB92…` | 1 | vanilla put | `strike × contracts` |
| `0x02Fe0d96…` | 2 | spread | the **spread width** |
| `0x4fd2C6D2…` | 3 | butterfly | narrower still |

A put spread pays out only *between* its strikes. Describing one to a user as
"your floor is $2,100" would be false (BR-6) — its real maximum payout might be
$2.50 where a vanilla put's would be $105. That exact discrepancy is how the second
bug was caught.

`getBuyablePutOrders()` filters to one strike. Do not relax it without changing
what the interface promises.

### The book re-signs wholesale every ~60 seconds

**Nobody would guess this, and anyone touching `findLiveOrder` needs it.**

Every order on the book is re-signed at the same moment, on roughly a 60-second
timer. Not staggered per maker — **100% of signatures replaced simultaneously.**

Measured 1 Sep 2026:

```
REFRESH at t=41.2s  — 100% of signatures replaced
REFRESH at t=101.2s — 100% of signatures replaced
interval: 59.9s
```

The signal was unmistakable. Sampling 320 orders every 5 seconds, **every single
signature lived exactly 35.645 seconds**, identical to three decimal places. A
distribution of independent lifetimes cannot look like that; one scheduled event
can.

**The same orders come back.** Across one refresh, 311 of 311 economically
identical orders persisted — same maker, strike, expiry, type and side — with a
new signature and usually a slightly different price:

```
persisted: 311 of 311    disappeared: 0
price unchanged: 6       price moved: 305
move: min 0.003% | median 0.515% | max 105.346%
```

**Prices are static inside a cycle and step at the refresh:**

```
elapsed   median   p90     max      % over 5% tolerance
10s        0.00    0.00    0.00        0%
20s        0.00    0.00    0.00        0%
31s        0.76   13.94  133.37       11%
92s        7.34   17.45   82.50       78%
```

#### What this means in code

- **Never match a stored order by signature alone.** A quote more than ~60s old
  will never find its signature, and a quote of average age has a coin-flip
  chance. Two integration fills in a row were refused on exactly this.
- `findLiveOrder()` tries the signature first, then falls back to matching on
  **maker + strike + expiry + type + side — all five, or it refuses.** A partial
  match is never approximated.
- **`QUOTE_VALIDITY_SECONDS` must stay well inside 60.** It is 20: the window in
  which the quoted price is exactly, not approximately, right. It was 60, which
  exactly equalled the refresh period and therefore promised the one window that
  cannot be guaranteed.
- Scripts that quote and fill in one process (`scripts/fill.js`, ~6s end to end)
  never hit this. Any flow with a human in the middle does.


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

### Operations that fail silently, and report success they did not achieve

**Nineteen instances now, one family.** The shape:

> **An operation that can fail silently will eventually report success it did not
> achieve.** Every instance so far was caught by someone checking the result
> against reality, never by reading the output that claimed it worked.

| Where | Claimed | Actually |
|---|---|---|
| `ensureExactAllowance` | `0.000000 -> 0.000000` | the approval had succeeded |
| disbursement closing balance | `9.371552 (was 9.371552)` | 4.5977 USDC had left |
| post-fill contract read | recorded 2000 contracts | the chain said 1999 |
| `reconcile` settled-state check | printed `ok` | the RPC read had failed |
| `api:check` cleanup | `test rows removed` | an FK blocked every delete |
| `api:check` balances | said nothing | 1.395637 USDC of drift |
| commit `63d7fcc` | added economic matching and a terminal state | also cut `fill.js` from 398 lines to 130 |
| `QUOTE_VALIDITY_SECONDS` | a configured 20-second window | never read; both call sites hardcoded 60 |
| `NOT_FOUND` API code | a 404 for a missing loan | not in the status table, so it surfaced as `UPSTREAM_ERROR` |
| the API router | routes matched by path | exact-match only, so the agreed `/:id/` endpoint could not exist |
| `stress.js` / `repay.js` | pure arithmetic, testable | imported the DB client at load, so the tests could not import them |
| `RUNBOOK.md` | commands to run on the day | `npm run settle` did not exist, and `settle.js` writes nothing without `--confirm` |
| `full.settlementPrice` | the settled price | the field does not exist on `getFullOptionInfo`; it could only return `undefined` |
| "XRP fails 6/6" | the protocol rejects XRP | our premium truncation; XRP fills 8/8 at exact sizes |
| "vanilla puts stop at 2.4 days" | the market's ceiling | our own single-leg rule; the book reaches 2 months |
| a simulated fill refusing a size | the market will not fill it | our own wallet's USDC allowance was too small (**fixed** — see below) |
| `fill-position.js` without `--confirm` | "the row is left pending" | it had transitioned to `failed` and refunded 1.52 USDC |
| `approve 9 --confirm` | one transaction, raising 5.86 to 9 | **two**; the reset landed and the raise ran out of gas, leaving 0 |
| the CoinGecko overview | six assets, all priced | four; `per_page=4` dropped the two smallest, which rendered as coins with no data |

The `api:check` pair were the same bug: twelve `await db.from(...).delete()` calls across
four scripts, none checking `error`. When `balance_events` gained an
`ON DELETE RESTRICT` reference to `positions`, they all began failing and all kept
printing success.

#### Degrading gracefully means degrading quietly

The Coin Detail overview fetches every asset in one CoinGecko call. `per_page`
was hardcoded to `4` while the list held four assets. Adding AVAX and XRP made
it six ids into a four-row page, and with `order=market_cap_desc` the provider
returned the four largest and dropped SOL and AVAX.

They came back as coins with **every field null** — no price, no market cap, no
all-time high. Nothing threw. Nothing logged. The page rendered.

That is because the code does something deliberately kind:

```js
// Our order, not the provider's, and an asset the provider omitted comes
// back with null fields rather than vanishing from the list.
normaliseOverview(byId.get(asset.coingeckoId) ?? {}, asset, updatedAt)
```

That fallback is correct and worth keeping. A provider genuinely missing a coin
should not blank the page. But it makes "the provider had no data" and "we
never asked properly" **indistinguishable in the output** — and the second one
is our bug wearing the first one's clothes.

> **Degrading gracefully means degrading quietly.** Every fallback that keeps a
> page rendering also removes the signal that something is wrong. The kinder the
> failure mode, the more it needs a separate alarm.

Two consequences, both applied:

**The omission is now logged.** The response still renders; the gap leaves a
trace someone can find.

**The test asserts the REQUEST, not the response.** This is the part that
generalises. No assertion about the returned assets could have caught this — the
shape was right, the count was right, the fields were merely null, which is a
legitimate state. The bug was a page too small to hold the list, and that is
only visible in the URL. So the test stubs `fetch`, calls `fetchOverview()`, and
checks `per_page` equals `MARKET_ASSETS.length`.

**And it was verified by reinstating the literal `4` and watching it fail.**
Second time that has been necessary this week — see the `modules-link` test,
which was proved by restoring the truncated file. A regression test that has
never seen the regression is a hypothesis.

#### An estimate is a measurement of a state you are about to leave

Raising the approval from 5.863744 to 9 USDC on 2 Sep 2026 left the wallet
approved for **zero**, unable to fill anything.

`ensureAllowance` sends **two** transactions, because USDC-style tokens want the
allowance reset before it is changed:

```
block 50787961   approve(0)   nonce 13   status 1   5.863744 -> 0
block 50787962   approve(9)   nonce 14   status 0   OUT OF GAS
                              gasUsed 46207 of gasLimit 46444  (99.5%)
```

Replaying the second call unconstrained by gas *succeeds*, which is the tell. It
was never invalid — it was underfunded. Writing an allowance slot from a
non-zero value costs about 2,900 gas; writing it from zero is a cold SSTORE at
about 20,000. Both transactions were estimated up front, **while the slot still
held 5.863744**, so the second one was priced for the cheap write it would have
been if the first had not run. Measured after the fact: the estimate against the
zero state is 56,240, against the 46,444 the transaction actually carried.

The SDK's 20% buffer was not the problem and did not fail — the successful
retry used 55,437 of 67,488, so the buffer was working. A 20% buffer cannot
absorb a 21% state change. **No buffer can, because the error is not noise.**

> **An estimate is a measurement of the state at the moment you took it.** Any
> transaction that changes that state between the estimate and the send has
> invalidated it, and a percentage buffer hides the small cases while leaving
> the structural ones exactly as broken.

**This one failed loudly**, which is why it is recorded here rather than in the
table above as a silent success — the script threw and printed a stack trace.
That is the good outcome. The bad part is what it left behind: a zero allowance
and no instruction, on a command the runbook hands to someone who has never run
it. **The remedy is in RUNBOOK.md, not in code**: re-running the command is
safe and fixes it, because from a zero allowance there is no reset step and the
estimate is taken against the state it will execute in. Verified by doing
exactly that — `status 1`, allowance `9000000`, confirmed by a direct
`allowance()` read rather than by the script's own report.

Total cost of the episode: 0.00000082 ETH.

#### The allowance row is now closed, and the fix is the general lesson

`findFillableSize` simulates the fill **as the filling wallet**, so it inherits
that wallet's USDC allowance and balance. A premium above either reverts inside
the ERC-20 transfer, and `staticCall` reports that identically to a size
refusal. The step-down then walked until the premium fitted under our own
approval — and quoted the result as *"the market would not fill that much"*.

Measured: 3 contracts, premium 6.6350 USDC, allowance 5.8637 → silently reduced
to 2. The book had said nothing.

The fix is not a better error parser. It is **reading the simulator's own limits
before asking it anything**: `readSpendCapacity()` takes the smaller of allowance
and balance, and a premium above it is reported as a shortfall (`verified:
false`, with `boundBy: 'allowance' | 'balance'`) with the requested size left
**standing and unprobed**. Nothing is reduced on evidence we did not have.

Note the asymmetry that makes this safe: an unverified size is quoted as-is, and
the pre-flight's BR-12 allowance check still refuses the fill before any
broadcast. The unknown surfaces to the *operator*, where a short approval
belongs — never to the user as a market fact.

> **Rule out your own instrument before attributing a reading to the world.**
> A measurement taken through a limit you imposed measures the limit.

The two newest are different in kind, and worth naming separately.

#### The commit that described a change it did not make

`63d7fcc` said it added economic order matching and a terminal state for refused
fills. It added the first. It also truncated `fill.js` from 398 lines to 130,
deleting `prepareFill()` and `executeFill()`, and `failRefusedFill()` — the
terminal state the message describes — was never written at all. The entire
on-chain write path was gone, and three scripts died at parse time.

It was verified with `api:check` and `reconcile`. Both passed. Both were always
going to pass, because neither imports `fill.js`.

> **A verification that cannot observe the change it is verifying is not a
> verification.** The other instances were operations reporting success they did
> not achieve. This was a *commit message* reporting a change it did not make,
> confirmed by a test that could not see the file.

The same failure in another costume: `fill.js`'s own header still read "There is
no executeFill() yet, on purpose" long after task 3.7 added one. A header that
misdescribes what a file does is a commit message that misdescribes what it
changed, left in place.

**What to do:**

- **Run the command that exercises the file you changed**, not the suite that is
  cheap to run. For a change to the fill path, `npm run preflight` is the
  verification and `api:check` is not.
- **`npm test` now fails when a module cannot parse OR imports a name its target
  does not export.** The second is the one that matters here: the truncated file
  parsed perfectly, and the real error was a linking failure. See
  `backend/test/modules-link.test.js`, which was verified by putting the
  truncated file back and watching it fail.
- **Check the commit after making it.**
  `git show HEAD:path | grep "^export"` takes five seconds and catches a
  truncation that a diffstat reading "392 insertions" does not.

#### A measurement taken through your own filters

**Twice in one day, and both read as protocol limitations.**

| We recorded | We concluded | It was actually |
|---|---|---|
| XRP 0/6, AVAX 2/6 in simulation | the protocol will not fill them | our premium truncation. `premiumRawFor` floors `contracts x price / 1e8`, and for cheap assets the lost fraction is worth hundreds of contract-units. XRP fills **8/8** when the product divides exactly |
| vanilla puts stop at 2.4 days | the book has no longer tenors | the book carries expiries to **two months**. At 3 days and beyond the buy-side puts are spreads, and we exclude spreads by our own rule |

Both numbers were honestly measured. Both described the funnel rather than the
market, because every measurement ran through `getBuyablePutOrders`, which
applies four filters before anything is counted.

> **A measurement taken through your own filters describes your filters, not the
> market.** The output is real; the noun attached to it is wrong. "XRP does not
> work" and "XRP does not work through our sizing" are different claims, and only
> one of them survives a judge who has seen a competitor do it.

**What to do:** when an asset or a tenor looks unavailable, count it again with
the filters removed, one at a time. The funnel per stage is four lines of code and
says immediately where something is lost:

```
asset   feedMatch   isPut   isBuyer   singleStrike
XRP     12          5       5         5              <- nothing lost to filters
ETH@3d   5          1       1         0              <- lost at single-leg
```

The first line means the filters are innocent and the cause is downstream. The
second names the exact rule responsible.

#### A field read from a shape that does not exist

`readSettlementPrice()` had two sources. The second was:

```js
const p = full?.settlementPrice ?? full?.settlement?.settlementPrice;
```

`getFullOptionInfo` returns exactly `{ info, buyer, seller, isExpired,
isSettled, numContracts, collateralAmount }`. There is no `settlementPrice`
field and no `.settlement` object, so that expression could only ever evaluate
to `undefined`.

Same family as `getOptionInfo().settled`: code written against a shape nobody
checked. It survived because **nothing ever reached the code path** — it runs
only for a settled option, and this project had never held one to expiry.
The optional chaining meant it failed silently rather than throwing.

> **Dead code in a path that has never executed is indistinguishable from
> working code.** It reviews clean, it passes every test that does not reach
> it, and it fails the first time it matters — which for a settlement path is
> the day the option expires.

**What to do:** for any branch that has never run, print the actual shape
before trusting a field name. `Object.keys()` on the real object takes one
command and would have caught this on the day it was written.

#### A runbook describing commands that do not exist

The operational instructions for 3 September were drafted and then **walked as an
instruction rather than read as a description** - every command run in order. That
found three errors in a document that read perfectly well:

- **`npm run settle` did not exist.** Step 1 would have failed outright, for
  someone who by definition has nobody to ask.
- **`settle.js` is report-only without `--confirm`.** The runbook would have left
  the database un-updated while appearing to work - the silent-success family,
  this time in prose.
- **It said three positions expire on the 3rd.** Four do.

It also omitted the 2 September run entirely, which nobody noticed while reading
because a document about the 3rd does not look like it is missing the 2nd.

> **A document that tells someone what to do is code.** It has the same failure
> modes and deserves the same verification: run it, do not review it. The pattern
> now covers code, commit messages, configuration, reference docs and operational
> instructions - the only thing they have in common is describing something that
> was not checked.

**What to do:** before handing anyone a runbook, execute every command in it in
order, on the real machine, and paste what actually came back. A command that
cannot be run yet - because a date has not arrived - should say what its blocked
output looks like, which is itself something you can only know by running it.

#### The configuration value that was never read

`QUOTE_VALIDITY_SECONDS` sat in `.env` from Phase 1 and had no effect. Both
`buildQuote()` and `buildQuoteSet()` defaulted to a hardcoded
`validitySeconds = 60` and neither read the environment.

This cost more than it looks. We spent an afternoon measuring that 60 seconds
promises exactly the window the book cannot guarantee — the book re-signs
wholesale every ~60s — and concluded the value had to come down to 20. The rule
was right and the measurement was right. Nothing was enforcing either, and
changing the number in `.env` produced no error and no effect.

> **A value that looks configured and is not is worse than one that is plainly
> hardcoded.** A hardcoded number is visibly a decision. A dead environment
> variable is an invitation to tune something that does not move.

**What to do:**

- **Grep `.env.example` against the source.** Every name in it should appear in a
  `process.env` read somewhere, or it is decoration.
- **Read configuration at call time, not at module load**, so the value applies
  after `--env-file` and a test can override it.
- **Make one command print the value it is actually using.** Pre-flight check 3
  reports both windows, so a wrong number shows up in every run rather than
  being inferred from a file nobody re-reads.

#### Three found by running the code rather than reading it

All three came from the same twenty minutes of exercising one new endpoint, and
none would have been found by reading the diff.

**`NOT_FOUND` was not in the API status table.** `toErrorResponse` maps any
unlisted code to `UPSTREAM_ERROR`, so asking for a loan that does not exist
reported that the service had broken. The handler raised `NOT_FOUND` correctly
and something downstream changed it, which is why reading the handler proved
nothing. Two attempts to fix it by matching the error message also failed:
PostgREST puts `0 rows` in a `details` field, and the message says only that the
result could not be coerced. The identifying mark is `error.code === 'PGRST116'`.

**The router matched exact paths only.** `/api/loans/:loanId/stress` had already
been agreed and written into the note for the frontend developer, and could not
have existed. A route may now carry a `pattern` instead of a `path`.

**A pure calculation could not be imported without credentials.** `stress.js`
and `repay.js` imported the Supabase client and the signer at module load, both
of which throw when `.env` is absent - and `npm test` does not load `.env`. The
money arithmetic was therefore impossible to test at all.

> **Untestable arithmetic is where the 100x errors live.** This project has
> already had two scale bugs - 6dp versus 18dp contracts, and the payout
> helpers. The defence against a third is a test, and a test needs an import.

Fix: import the credentialed modules INSIDE the functions that use them, so the
money maths stays a pure function of its arguments.

**What the audit found.** Eighteen modules still need credentials at import, and
for `src/db/*`, `src/api/*` and `src/scheduler/*` that is correct - they exist to
talk to the database. What matters is that none of them is arithmetic. Every
calculation module now imports cleanly:

```
credit.js  stress.js  repay.js  vault.js  decimals.js  selection.js  sizing.js
```

`quote.js` is on the credentialed list, but its pure parts already live in
`selection.js` and `sizing.js`, which are clean and tested.

**Re-run the audit** after adding a module that does arithmetic:

```bash
for f in $(find src -name '*.js'); do node -e "import('./$f').catch(e=>/is not set/.test(e.message)&&console.log('$f'))"; done
```

**What to do:**

- **Check every write's `error`.** Supabase returns it rather than throwing, so a
  bare `await db.from(x).delete()` swallows failures by default.
- **Verify the outcome; do not infer it from the absence of a throw.**
  `verifyDiscarded()` re-queries the database, and `confirmedRead()` polls and
  returns `{ value, confirmed }`.
- **Never weaken a constraint for test convenience.** `ON DELETE RESTRICT` was
  correct — a financial event must not vanish because the row it referenced was
  deleted. The cleanup respects it instead: refund, delete the events, then
  delete the position.
- **A check that changes what it measures is not a check.** `api:check` now
  refunds through the same compensating path a failed fill uses, and asserts the
  rows are actually gone.


### Read-your-own-write: decisions made against state that has already moved

**This has bitten three times in one day.** It is one bug wearing three costumes,
so recognise the shape rather than fixing each instance.

The shape: read some state, decide something from it, then act — while the state
changes underneath between the read and the act.

| Where | What happened | Symptom |
|---|---|---|
| `ensureExactAllowance` | re-read the allowance immediately after approving | reported `0.000000 -> 0.000000` on an approval that had actually succeeded |
| `approve(6)` after `approve(0)` | gas estimated while the allowance was still non-zero, executed once it was zero | **reverted out of gas** — a zero→non-zero SSTORE costs ~20k more, limit 46,444 against ~56,240 needed |
| post-fill contract count | read the option contract milliseconds after its creation confirmed | returned `null`, so the row kept the quoted 2000 instead of the on-chain 1999 |

Two of the three cost real money in gas; the third would have made a lending
artefact claim a number the chain disagreed with.

**What to do about it:**

- **Never estimate gas across a state change you are about to cause.** If you send
  A then B, and A changes what B writes, B's estimate must be taken after A lands.
- **Poll, don't peek.** A single read straight after a write can be served from a
  block that predates it. `pollAllowanceUntil()` is the pattern.
- **A fresh contract is not immediately queryable.** Reads against an address
  created in the transaction you just confirmed can return null for a moment.
- **Fall back rather than block** when the read is a nicety, but record that the
  read failed. The post-fill guard did this correctly — the event payload said
  `onChainContractsSeen: null`, which is how the discrepancy was found later.
- **Reconcile catches what the moment missed.** `npm run reconcile` compares every
  row against chain and is the backstop for all of the above.


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

### An operation that reported what it did NOT do, and stayed silent about what it did

**Seventeenth instance, and the inverse of every other one.** The rest claimed
success they had not achieved. This one claimed *inaction it had not maintained*.

`scripts/fill-position.js` was described as a dry run. Run without `--confirm`
against a position whose order had left the book, it printed:

```
BLOCKED: the quoted order is no longer on the book — re-quote
Nothing was broadcast. The row is left pending (BR-14).
```

The first line is true. The second was false: `prepareFill` had already called
`failRefusedFill`, moving the position `pending → failed` and refunding 1.522569
USDC. Someone reading it concluded the position was untouched. It had
transitioned and returned money.

Nothing was wrong with the *behaviour* — resolving a refused fill is correct,
and leaving it `pending` was the gap we had closed the day before. The message
had simply never been updated to match, and it described the chain while saying
nothing about the database.

> **"Nothing happened" is two claims, not one.** Nothing was broadcast, and
> nothing was written. A message that verifies the first and asserts the second
> is the easiest kind of lie to write, because the author is thinking about the
> money and the reader is thinking about the row.

**What to do:** when an operation has more than one kind of side effect, say
something about each one every time — including "unchanged". All three
non-broadcast exits in that script now state the database outcome explicitly,
and the two that genuinely change nothing say so rather than leaving it to be
inferred from silence.

And do not call something a dry run if it can write. The flag now promises two
separate things: without `--confirm` nothing is broadcast and no money is spent,
**and** the database may still change when a position is unfillable.

### A simulation inherits the constraints of whoever it simulates as

**Sixteenth instance, and a new shape.** The others were things that reported
success they had not achieved, or described something nobody checked. This one
is a measurement that was *correct* and meant something other than what it
appeared to.

On 2 September we tried to confirm option sizes against the chain before quoting
them, by simulating a fill with `eth_call`. An `eth_call` runs *as* an address,
and that address has a USDC balance and an allowance. So a size could be refused
for two entirely different reasons, and the simulation gives the same answer to
both:

```
3 units, premium 6.6350, burner allowance 5.8637  ->  refused
```

The code then did the reasonable-looking thing and offered a smaller position —
presenting **"our operator has not approved enough USDC"** to the user as
**"the market will not fill this size"**. A reduced position looks like a
legitimate result, so nothing about it would have looked wrong. The remedy is a
larger approval, not selling someone less coverage than they asked for.

It also silently dropped one of ETH's three tiers, reproducibly, because that
tier's premium exceeded the allowance.

> **A simulation answers "would this work, as me, right now" — never "is this
> valid".** Any constraint attached to the simulating account, its balance, its
> allowances, its nonce, comes back indistinguishable from a property of the
> thing being tested.

**What to do:** before treating a simulated refusal as a fact about the subject,
rule out the simulator. Check the account's own constraints FIRST and report a
shortfall as a shortfall — the pre-flight already does exactly this for
allowances under BR-12, and the same check belonged in the probe.

**This is now fixed and merged.** `readSpendCapacity()` reads the wallet's
allowance and balance once, up front, and takes the smaller; a premium above it
is never probed. See "The allowance row is now closed" above for the shape of
the fix and what it deliberately does *not* do.

---

## Known design gaps

Not bugs. Decisions with consequences we have not built around, written down so
nobody has to discover them under questioning.

### The operator model has no timeout

`POST /api/purchase` writes the position row and debits the user's balance, then
stops. A person runs `scripts/fill.js` afterwards. That separation is deliberate
— the confirm button must not broadcast to mainnet (BR-51), and the reality block
reports `fill: 'operator'` so the interface never claims otherwise.

**But nothing reclaims a purchase the operator never executes.**

A position created through the API and left unfilled:

- stays `pending` forever — the settlement sweep selects `status = 'active'`, so
  it is invisible to that process permanently, even after its expiry passes
- holds the debit indefinitely — `findStandingDebits` reports it, but reporting
  is all that happens; nothing acts on the report
- shows on the dashboard as a position in progress that will never resolve

Observed on 2 Sep: `fc08e2e3`, a BTC $76,500 put requested from the browser at
16:46 the previous day, holding **1.522569 USDC** with no transaction behind it.
The flow worked exactly as designed. There was simply no operator.

**Why it matters beyond the demo.** Here it is simulated balance and a stuck card.
In a real product it is a customer's money held against a purchase that never
happened, with no expiry, no notification and no automatic reversal.

**What a fix would look like** (not before the freeze):

- a TTL on `pending` — after some interval with no `broadcast` event, transition
  to `failed` and refund through the compensating path `failRefusedFill` already
  uses
- the sweep, or a second job, actually acting on `findStandingDebits` rather than
  only listing them
- the interface distinguishing "waiting for the operator" from "processing", so
  the state is legible while it lasts

**If a judge asks what happens when nobody executes:** the honest answer is that
the funds stay held and a person has to notice. We know, it is written down, and
the compensating-refund path that would fix it already exists and is tested — it
is wiring, not design.

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