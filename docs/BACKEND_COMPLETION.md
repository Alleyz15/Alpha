# BACKEND COMPLETION GUIDE

**Project:** MUBA Hacks 2026 — Thetanuts Track 01
**Repo:** github.com/Alleyz15/Alpha
**Purpose:** the ordered, living checklist for taking the backend from "skeleton built" to
"complete system". Update the status column as each step lands.

> This tracks execution. For *what to build* see `requirements.md`; for the
> broader phase plan see `IMPLEMENT.md`. Where those and this disagree, the doc
> touched most recently against the code wins — keep this one honest.

---

## How we work each step (Working Protocol)

Unchanged from `IMPLEMENT.md §0` and `BUILD_PLAN.md §0`, and it applies to every
step below:

1. **State the approach first** — files touched, the shape, trade-offs, assumptions.
2. **Stop and wait for approval.** No code in the same turn as the proposal.
3. **On approval, implement as proposed.** Flag any forced deviation before making it.
4. **On rejection, rebuild around the developer's idea**, not the original.
5. **Report when done, then stop.** List every file changed and what changed, then wait.

Reason: public repo, funded burner wallet, small team on a one-week deadline. Code
that appears without a stated plan cannot be reviewed meaningfully.

---

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Done and verified |
| 🔄 | In progress |
| ⬜ | Not started |
| ⛔ | Blocked |
| ❌ | Cut from scope |

---

## What "complete" means

A **working, verifiable, trustworthy** backend for the demo — not a production
platform. Judging is *"does it work"* and *"would anyone use it"*, and Track 01's
one hard rule is that the Thetanuts calls must be load-bearing. So complete means:

- the full lifecycle **quote → fill → settle → record** runs end to end against the
  real frontend,
- every number shown is traceable to the row that produced it (BR-40),
- the boundary between simulated and real is stated wherever a user or judge sees it
  (BR-51),
- the database provably matches chain state (BR-36).

### Non-goals — do not build

RFQ · non-custodial signing · any deposit flow · our own smart contracts ·
notifications · multi-asset portfolios · **Phase 8 vault (cut 31 Aug)**. Phase 7
lending is a genuine extension but only *after* the core is complete.

---

## Current state (update as this changes)

✅ Quote engine (1.1–1.7) · ✅ DB + RLS + migrations · ✅ HTTP API · ✅ fill path +
10-item pre-flight · ✅ settlement scheduler · ✅ one real on-chain fill
(`0x6420c71c…`) · ✅ operator-fill bridge (`scripts/fill-position.js`, branch
`Damian`).

**Verified live on the dev machine (31 Aug):** `inspect:orders` (294 orders),
`db:check` (tables, RLS, seeds, lifecycle), `quote` (Step 4 scenarios, math
exact), `api:check` (full API surface). Offline suite `npm test` green (13/13:
decimals + selection).

Remaining work is the steps below.

---

## Gate 0 — Runnable & verified environment 🔄

**Blocks everything.** Nothing is "built" until it runs on the machine that matters.

> **Status (31 Aug):** deps installed (backend + frontend); `.env` in place; all
> read-only checks green. Outstanding: `THETANUTS_PRIVATE_KEY` currently holds the
> wallet *address*, not a private key — needed for `reconcile` and any real fill.

**Do:**

```bash
cd backend && npm install
cd ../frontend && npm install
cp .env.example .env        # at repo ROOT — one file serves backend AND frontend
```

Fill `.env`: `THETANUTS_RPC_URL` (Alchemy Base mainnet), `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, `THETANUTS_PRIVATE_KEY` (burner), and the caps
(`MAX_PREMIUM_PER_FILL_USDC`, `MAX_FILLS_PER_DAY`, `PRICE_TOLERANCE_PCT`,
`QUOTE_VALIDITY_SECONDS`, `SCHEDULER_INTERVAL_MINUTES`, `DEFAULT_PROTECTION_PCT`).

**Verify (read-only, spends nothing):**

```bash
cd backend
npm run inspect:orders
npm run db:check
npm run api:check
node --env-file-if-exists=../.env scripts/quote.js
node --env-file-if-exists=../.env scripts/settle.js      # report only
```

**Definition of done:** all five green on the demo machine.

---

## Step 1 — Frontend ↔ backend integration (Phase 5.7) ⬜ 🔴 must-have

**Goal:** the real UI drives the real backend through a full purchase.

The operator-fill bridge was the missing piece; the API already returns the exact
shapes the frontend adapter destructures (`npm run api:check` asserts this). So the
work is wiring and operating, not new endpoints.

**Do:**

1. `cd backend && npm run api`
2. Frontend `.env`: `VITE_USE_MOCK_API=false`, `VITE_API_BASE_URL=http://localhost:3000`;
   `cd frontend && npm run dev`
3. Browser: quote → review → confirm. This writes a `pending` row (`txHash: null`,
   `fill: 'operator'`). The confirm button does **not** broadcast (BR-51).
4. Operator completes it:
   ```bash
   npm run fill:position                 # lists pending positions
   npm run fill:position <positionId>    # dry run + full pre-flight
   npm run fill:position <positionId> --confirm   # the real fill
   ```
5. Dashboard shows the position `active` with a working BaseScan link.

**Definition of done:** a position created through the real UI reaches `active` on
the dashboard with a BaseScan link, and the flow is re-runnable (judges may ask to
see it twice).

**Rules:** BR-51 (the "operator" reality state is honest), BR-40 (client sends ids
only), BR-14 (pending row before broadcast).

---

## Step 2 — Settlement lifecycle proof (Phase 4) ⬜ 🔴 must-have · time-boxed

**Goal:** a position completes the whole lifecycle automatically and is recorded.

The live position `ccdcbf28…` (ETH put, $2,320 floor) **settles 2026-09-02 08:00
UTC = 16:00 MYT**.

**Do — one of:**

```bash
# Safe: run the daemon now so it cannot be forgotten
node --env-file-if-exists=../.env scripts/settle.js --loop

# Manual: run the sweep that Tuesday afternoon
node --env-file-if-exists=../.env scripts/settle.js --confirm
```

This is also the first time we learn which settlement-price source answers
(`option.getTWAP` vs `getFullOptionInfo` in `settlement.js`) and whether the
grace-period path (4.4) fires. Record the settled row + BaseScan state in
`docs/ONCHAIN-EVIDENCE.md §3` — **do not edit that entry once written.**

**Definition of done:** the position reaches `settled` or `expired_worthless` with a
payout and settlement price recorded, and it is written into the evidence doc. If
the payout is zero (ETH finished above the floor) that is a *success* — record it as
US-7 ("not needed this time"), not a failure.

---

## Step 3 — Reconciliation script (3.10) 🔄 🟠 trust artefact + test · BR-36

> **Status:** `scripts/reconcile.js` written and committed. Blocked from a live run
> only by `THETANUTS_PRIVATE_KEY` (it derives the wallet address from the key);
> fails loud and clean until a valid key is set.

**Goal:** rebuild every position fact from chain and diff it against the database.

**Approach — new `backend/scripts/reconcile.js`, read-only, no `src/` changes:**

- For each DB position with an `option_address`: `client.option.getFullOptionInfo(addr)`
  → compare `buyer` vs the burner wallet, `numContracts` vs `num_contracts_raw`,
  strike and expiry, and `isSettled`/`settlementPrice` vs the row's status.
- Orphan detection (the deep value): `client.api.getUserPositionsFromIndexer(wallet)`
  → any on-chain position for our wallet **not** in the DB is the exact `user_id`-loss
  case the custodial model fears (BR-31, BR-35). Flag it loudly.
- Output a per-position `PASS / MISMATCH` table plus an orphan list; exit non-zero on
  any mismatch so the script doubles as a test.

**Definition of done:** clean diff for the live position; a deliberately corrupted row
is caught; orphans surface. Also answers the Q&A question "how do you know the DB
matches the chain?"

---

## Step 4 — Scenario preview in the quote (1.8) ✅ 🟡 nice-to-have · US-4

> **Done & verified live (31 Aug):** each tier carries a `scenarios` array; payout
> is 0 at/above the floor and `(floor − price) × contracts` below it, hand-checked
> against a live quote (floor invariant holds). Committed to `Damian`.

**Goal:** the confirmation screen shows outcomes at several prices, from real numbers.

**Approach — in `quote.js` `buildTier()`:** add a `scenarios` array. For a few prices
(spot, floor, −X%, +Y%) compute payout with
`client.utils.calculatePayoutAtPrice(order, toPayoutContracts(contractsRaw), priceRaw8dp)`
→ `payoutToUsdc()`, and derive `{ priceUsdc, holdingValueUsdc, payoutUsdc, netUsdc }`.

**Critical:** convert contracts to 18 decimals at that boundary with
`toPayoutContracts()` — passing the 6-dp value straight in is a 10¹² error that does
not throw. The frontend's `FloorCrossingScenario.jsx` already exists to render it.

**Definition of done:** the quote DTO carries hand-checkable scenarios (payout above
floor = 0, below floor = `(floor − price) × contracts`), JSON-safe, no BigInt leak.

---

## Step 5 — Exercise the failure paths (3.9) 🔄 🟡 confidence

> **Offline half done (31 Aug):** `BUILD_PLAN §10` automated checks landed and pass
> (`test/decimals.test.js` — the three decimal traps; `test/selection.test.js` —
> BR-6 expiry + BR-41 tiers). Suite is `npm test`, 13/13. The live-revert half
> below still needs a real broadcast.

**Goal:** confirm the revert→`failed` and timeout→`pending_verification` branches
behave. They are implemented in `executeFill` but never triggered — the one fill
succeeded.

**Do:** force one revert (e.g. attempt a fill against a stale/removed order so the
broadcast reverts) and confirm the row lands `failed` with the reason, and that a
`pending_verification` row blocks any re-fill via pre-flight check 0.

**Definition of done:** at least one failure branch observed doing the right thing,
or an explicit, recorded decision to accept it as low-risk before freeze.

---

## Step 6 — Demo-day hardening (Phase 6 backend bits) ⬜ 🔴 by 4 Sep freeze

- Fill README contract addresses (OptionBook, USDC, burner wallet, example tx).
- Verify the whole stack on the **actual demo laptop** — frontend + backend + `.env`
  on one machine.
- Venue-wifi resilience: the dashboard already reads from Postgres, so it survives an
  RPC outage — confirm it, and cache a recent quote.
- Complete the AI-tool declaration required by the rules.

**Definition of done:** the full demo runs with only the single live fill touching the
chain.

---

## Stretch — Phase 7 lending ⬜ (only after Steps 1–6)

`loans` table migration → `credit_limit = strike × contracts` read from the filled put
(never a ratio — BR-39) → on-chain USDC disbursement → repayment releasing collateral
→ side-by-side no-liquidation demo. Loan maturity **must equal** the put's expiry
(BR-48). Unassessed against the corrected 2-day book; bonus, not core.

---

## Priority & sequence

```
Gate 0  ── runnable            ← do immediately, blocks all
  │
  ├── Step 1  integration       🔴  (uses the operator-fill bridge)
  ├── Step 2  settlement 2 Sep  🔴  (calendar-locked — start the daemon now)
  ├── Step 3  reconciliation    🟠  (BR-36, test + Q&A artefact)
  ├── Step 4  scenarios         🟡  (polish)
  ├── Step 5  failure paths     🟡  (confidence)
  └── Step 6  demo hardening    🔴  (by 4 Sep freeze)
        │
        └── Phase 7 lending     stretch
```

---

## Definition of "backend complete"

- [ ] Gate 0 green on the demo machine
- [ ] Real UI → quote → purchase → `fill:position --confirm` → dashboard `active` +
      BaseScan (Step 1)
- [ ] The live position auto-settles and is recorded in the evidence doc (Step 2)
- [ ] `reconcile.js` shows DB ≡ chain, orphans flagged (Step 3)
- [ ] README contract addresses + AI declaration filled, stack verified on the demo
      laptop (Step 6)

Steps 4, 5 and Phase 7 are above the line — genuinely nice, not required to call the
backend complete.

---

## Changelog

Record each completed step here so the doc reflects reality.

| Date | Step | What landed |
|---|---|---|
| 2026-08-31 | (pre) | Operator-fill bridge `scripts/fill-position.js` |
| 2026-08-31 | 3 | `scripts/reconcile.js` (DB↔chain, BR-36) — written, awaits a valid key |
| 2026-08-31 | 4 | Scenario preview per tier — **verified live** |
| 2026-08-31 | 5 | Offline tests: `decimals` + `selection` (`npm test`, 13/13) |
| 2026-08-31 | Gate 0 | deps installed, `.env` set, read-only checks green |
