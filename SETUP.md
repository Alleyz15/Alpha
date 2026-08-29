# SETUP

Environment setup for the MUBA Hacks 2026 project (Thetanuts Track 01).

**Keep this file updated.** Every time you install something or hit a bug, add a line. Doing it as you go takes seconds; reconstructing it later takes an hour.

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

## Quick start

```bash
git clone https://github.com/Alleyz15/Alpha.git
cd Alpha
```

**Backend**

```bash
cd backend
npm install                 # NOT npm init - that would overwrite package.json
cp .env.example .env        # fill in the values, ask in a DM
node scripts/test.js        # read-only connectivity check, no wallet needed
```

**Frontend** (once it exists) — in a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev                 # http://localhost:5173
```

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

### Supabase — NOT SET UP YET

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

**Status: working as of 29 Aug 2026.**

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

> **This matters for product design.** Short-dated expiries dominate, but 27-day and 62-day options do exist with real liquidity. A "30-day downside protection" product is feasible — it maps to the +27 day expiry.

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

---

## Gotchas we already hit

Format: symptom → cause → fix

- **`Cannot use import statement outside a module`** → `package.json` defaults to `"type": "commonjs"` → change it to `"type": "module"`
- **`Do not know how to serialize a BigInt`** → order objects contain BigInt values that `JSON.stringify` can't handle → pass a replacer: `JSON.stringify(obj, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2)`
- **`.env` value read as empty or with a leading space** → spaces around `=` → write `KEY=value`, no spaces
- **`LF will be replaced by CRLF` warning on git add** → Windows vs Unix line endings → harmless warning, ignore. A `.gitattributes` containing `* text=auto eol=lf` silences it.
- **`pathspec '.env.example' did not match any files`** → the file does not exist in the current folder, or Windows Explorer refused to create a dotfile → create it from inside VS Code, which allows leading dots
- **RPC timeouts / "unstable API"** → using the public Base endpoint → use your own Alchemy key
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