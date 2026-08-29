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
# 1. Clone
git clone https://github.com/Alleyz15/Alpha.git
cd Alpha

# 2. Install backend dependencies
cd backend
npm install
cd ..

# 3. Configure secrets
cp .env.example .env
# Open .env and fill in the values.
# Ask for them in a DM - never post keys in the group chat.

# 4. Verify the connection to Thetanuts (read-only, no wallet needed)
cd backend
npm run inspect:orders
```

> There is no `npm run dev` yet — the frontend has not been set up. The backend currently contains read-only inspection scripts.

---

## Services

### Alchemy (Base mainnet RPC) — DONE

1. Sign up at alchemy.com. Free tier, no credit card.
2. Create App → Chain: **Base**, Network: **Mainnet**
3. Copy the HTTPS URL into `THETANUTS_RPC_URL` in `.env`

> Do not use the public Base endpoint. It times out randomly and the failures look like bugs in your own code.

### Thetanuts SDK — DONE

```bash
cd backend
npm i @thetanuts-finance/thetanuts-client ethers dotenv
npm i -g @thetanuts-finance/cli     # optional, quote and fill from the terminal
npx -y @thetanuts-finance/mcp       # optional, feeds SDK context to Claude / Codex
```

- Chain: Base mainnet, chainId **8453**
- Docs: docs.thetanuts.finance/for-builders/sdk
- Repo: github.com/Thetanuts-Finance/thetanuts-sdk
- **If the docs and the repo disagree, trust the repo.**
- There is no Thetanuts API key. All you need is a working Base RPC.

### Supabase — NOT SET UP YET

1. Sign up at supabase.com → New Project
2. Region: **Southeast Asia (Singapore)** — closest to Malaysia
3. Set a database password and **save it in a password manager**. Losing it is painful.
4. Settings → API, copy three values:
   - Project URL → `VITE_SUPABASE_URL`
   - anon public key → `VITE_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY` (**server-side only**)
5. **Enable Row Level Security on every table.** Supabase does not enable it by default, and the anon key is public — without RLS, anyone can read and write the entire database.

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

---

## Secrets handling

The repo is **public**. Treat this seriously.

- `.env` is gitignored. Never commit it, never screenshot it, never paste keys in the group chat.
- Share keys one-to-one, or through the Vercel environment variable panel.
- Before sharing, confirm the other person's `.gitignore` contains `.env`.
- **Run `git status` after creating `.env`.** If `.env` shows up, `.gitignore` is not working — stop and fix it before continuing.
- Once a key is committed it stays in the git history forever, even if you delete it later. Rotate the key instead.
- **Variables prefixed with `VITE_` are bundled into the browser** and readable by anyone. Never put a private key or a service_role key behind that prefix.
- The wallet used for trading must be a **fresh burner** holding only a few USDC and cents of ETH for gas.
