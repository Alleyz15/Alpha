# IMPLEMENTATION PLAN

**Project:** MUBA Hacks 2026 — Thetanuts Track 01
**Repo:** github.com/Alleyz15/Alpha
**Last updated:** 30 Aug 2026

---

## ⚠️ WORKING PROTOCOL — read this before writing any code

**This applies to every AI session and every task in this document.**

Before implementing anything, the assistant must:

1. **State the approach first.** What files will be created or changed, what the shape of the solution is, what trade-offs it involves, and anything that will be assumed.
2. **Stop and wait for approval.** Do not write code in the same turn as the proposal.
3. **On approval** — implement as proposed. If reality forces a deviation, say so before deviating.
4. **On rejection** — the developer supplies their own approach. Rebuild the proposal around *their* idea, not the original one. Do not re-argue the rejected version unless it has a correctness or security problem, in which case say so plainly once and then follow their direction.
5. **Report when done, then stop again.** List every file created, changed or deleted and what changed in each. Say whether you deviated from the proposal. Wait for confirmation before starting anything else.

**Why:** this is a small team on a one-week deadline, several members are working outside their usual area, and everyone has to be able to review what lands in the repo. Code that appears without a stated plan can't be reviewed properly, and unreviewed code in a public repo with a funded wallet is a real risk.

**Also:** after finishing a task, update the status table in this file. A plan that doesn't reflect reality is worse than no plan.

---

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Done and verified |
| 🔄 | In progress |
| ⬜ | Not started — no decision against it, just not built yet |
| ⛔ | Blocked |
| ❌ | **Cut — do not build.** A decision was made against it. The note says when and why. |
| ↩️ | **Back in scope after being cut.** The note says what changed. |

---

## Where we are right now

**Last verified against the code and the chain on 31 Aug, not against this file.**

**A full purchase has happened on Base mainnet.** tx `0x6420c71c…`, an ETH put with a
$2,320 floor expiring 2 Sep, 0.495926 USDC. We hold the buyer side, confirmed on
chain. See `docs/ONCHAIN-EVIDENCE.md`.

Working: quote engine (1.1–1.7), database with RLS and seeds, HTTP API, the fill
path with its ten-item pre-flight, and the settlement scheduler.

Not started: 7.5 no-liquidation demo. Back in scope after being cut: 7.4
repayment and 8.6 vault maturity (1 Sep).

5.7 front-to-back integration is verified as of 1 Sep.

### The product changed shape on 31 Aug

Two bugs in the order filter were found while trying to fill (see Phase 3). Once
corrected, the book looks nothing like what the earlier documents describe:

| | Was believed | Actually |
|---|---|---|
| Longest tenor | ~26 days | **2.4 days** (vanilla puts) |
| Deepest floor | 20%+ | **~6%** |
| Tradable assets | ETH, BTC | **ETH, BTC, SOL, BNB** (+AVAX partial) |

**So the product is event protection, not long-horizon insurance:** *hold your floor
through tonight, settles in two days.* The scenario is "there is a CPI print tonight
and I want to sleep", not "my rent is due next month".

**The shallow floor is the advantage, and it leads.** A 20% floor over 30 days
rarely triggers, so the insurance never pays. A 6% floor over two days pays often,
because ETH moves 6% in two days routinely — and it is why a full lifecycle can be
demonstrated at all.

Entry point B (income/rent hedging) moves to roadmap: two days cannot carry "next
month", and rolling is not built.

⚠️ **Settlement lands 2026-09-02 08:00 UTC = 16:00 MYT, Tuesday afternoon.** See
Phase 4.

**Nothing is blocked.** 5.7 was the last one and cleared on 1 Sep: the interface
gained its third state and the purchase path became real, and the two together
were verified end to end against a live fill.

**Scope:** Phase 8 is cut — see Phase 8. Phase 7 lending is unassessed against the
corrected book.

## Phase 0 — Foundation ✅

| Task | Status | Notes |
|---|---|---|
| GitHub repo created | ✅ | Alleyz15/Alpha, public |
| `.gitignore` + `.env.example` committed | ✅ | Verified `.env` is not tracked |
| Node 24 / npm 11 / Git 2.55 | ✅ | Whole team must match Node 24 |
| Alchemy RPC key (Base mainnet) | ✅ | Free tier |
| Thetanuts SDK installed | ✅ | `thetanuts-client`, `ethers`, `dotenv` |
| Connectivity check passing | ✅ | ~320 live orders, prices for 6 assets |
| Order book structure documented | ✅ | See SETUP.md |
| Expiries mapped | ✅ | Raw book +1 to +62 days. **Buyable puts stop at ~26 days** (BR-52) — see SETUP.md |
| SDK method surface mapped | ✅ | See requirements.md appendix |
| Requirements written | ✅ | requirements.md |
| Custodial vs non-custodial decided | ✅ | Custodial; the backend developer operates the wallet |
| Frontend stack decided | ✅ | Vite + React + anime.js, nothing else |
| Deployment decided | ✅ | **Local only** — no hosting platform |
| Supabase key format decided | ✅ | New `sb_secret_`, not legacy service_role |
| loan / collar modules checked | ✅ | **Not deployed on Base** — `isDeployed: false`, 0 opportunities |
| Repo restructured into backend/frontend | ✅ | |
| RFQ scope decided | ✅ | Out of scope — OptionBook only |

---

## Phase 1 — Quote engine ✅

**Goal:** given an asset, an amount and a protection level, return a real quote from the live book. Read-only — no wallet, no transactions.

**Why first:** it's the core of the product, it's the least risky thing to build, and it proves the concept before any money moves.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 1.1 | Fetch spot price for an asset | ✅ | `src/thetanuts/market.js` — `getSpotPrice(asset)`. Prices are already plain numbers |
| 1.2 | Filter book to puts on one asset | ✅ | `src/thetanuts/orders.js` — `getBuyablePutOrders(asset)`. Buy-side only (BR-1) |
| 1.3 | Convert raw order fields to human values | ✅ | `src/thetanuts/decimals.js` — `toHumanOrder()`. Verified by hand against the live book |
| 1.4 | Select expiry + derive protection tiers | ✅ | `src/thetanuts/selection.js` — `selectProtectionTiers()`. Tiers from real strikes (BR-41); BR-6 strict on expiry |
| 1.5 | Size the position | ✅ | `src/thetanuts/sizing.js` — `sizePosition()`. All limits are parameters. The premium cap is for the fill path only, not quoting (BR-33) |
| 1.6 | Produce a quote object | ✅ | `src/thetanuts/quote.js` — `buildQuote()`. JSON-safe DTO; BR-2's two losses kept apart; BR-8 validity |
| 1.7 | Goal-based input path | ✅ | `buildQuoteSet({ mode: 'goal' })` — strike = target ÷ units (BR-5). NO_EXPIRY carries `longestAvailableDate`. Frontend still needs a date-picker cap |
| 1.8 | Scenario preview | ✅ | `buildScenarios()` in `quote.js` — up/flat/atFloor/down via `calculatePayoutAtPrice`, rescaled 6dp→18dp at the boundary |

**Definition of done:** `node quote.js` prints a complete, correct quote for ETH using live data.

**Rules that apply:** BR-3 (no jargon in output), BR-4, BR-5, BR-6 (disclose the real strike), BR-7 (decimals).

---

## Phase 2 — Database ✅

> **User payment added 1 Sep.** `balances` now carries USDC alongside the asset
> holdings, and buying protection debits it. `balance_events` is append-only:
> a refund is a compensating write, never a deletion, so the trail reads
> `debit → fill failed → refund`. `debit_balance()` locks the row so the check
> and the decrement are one operation. A timeout leaves the debit **held** —
> the balance-side word for `pending_verification`, deliberately not a second
> vocabulary — and `npm run reconcile` surfaces both held and refund-due.


**Goal:** persist users, quotes and positions. See DATABASE.md for the schema.

**Why now:** Phase 3 writes a row *before* it sends a transaction (BR-14), so the schema must exist first.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 2.1 | Supabase project created | ✅ | `gphzqvsdubygvijunobj`, region ap-southeast-1 (Singapore) |
| 2.2 | Migration tooling set up | ✅ | `supabase/migrations/`, **14** migrations applied and recorded. Two were missing from the directory until 1 Sep — see DATABASE.md on MCP-applied migrations not writing files |
| 2.3 | Core tables created | ✅ | users, balances, quotes, positions, position_events + DR-3/DR-7/DR-8/DR-10 constraints |
| 2.4 | RLS enabled on every table | ✅ | All five; anon blocked by RLS *and* absent grants — verified with a publishable key |
| 2.5 | DB access layer | ✅ | `src/db/` — secret key server-side only; no bare position update exists |
| 2.6 | Seed a demo user | ✅ | Two users, fixed UUIDs, idempotent (BR-31) |
| 2.7 | Seed demo balances | ✅ | 0.4 ETH and 0.15 ETH, `source=demo_seed` (BR-49, BR-50) |

**Definition of done:** a fresh machine can run the migrations and get an identical database.

---

## Phase 3 — Buy execution 🔄 ← first fill done

**Goal:** actually fill an order on Base mainnet with real USDC.

**This is the task most likely to go wrong, so start it early.** Everything before it is read-only; this is where signing, approvals, gas and money enter.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 3.1 | Create burner wallet | ✅ | `0x4fB77837bf2A0B86D167627Ded2E894f92F15127`, key only in `.env` (BR-30) |
| 3.2 | Fund it | ✅ | ~9.89 USDC + 0.00445 ETH on Base |
| 3.3 | Balance checks | ✅ | `src/thetanuts/wallet.js` — refuses on either; reports USDC remaining after the fill |
| 3.4 | Exact-amount approval | ✅ | `src/thetanuts/allowance.js` + `scripts/approve.js`. MaxUint256 refused, 100 USDC sanity cap |
| 3.5 | Dry run the fill | ✅ | `callStaticFillOrder` wired as check 9. **Fails until an approval exists** — see below |
| 3.5b | Pre-flight checklist as code | ✅ | `src/thetanuts/preflight.js` — ten items plus a `pending_verification` hard block. Reports every item, not just the first failure |
| 3.6 | Write pending row, then broadcast | ✅ | Row written by the purchase path; check 10 verifies it is `pending` before any broadcast (BR-14) |
| 3.7 | **First real on-chain fill** | ✅ | tx `0x6420c71c…` block 50670079, 0.495926 USDC. See `docs/ONCHAIN-EVIDENCE.md` |
| 3.8 | Record the result | ✅ | Row `active` with tx hash, option `0xa609b6fb…`, real premium 0.495926 (fee included) |
| 3.9 | Handle failure paths | ✅ | Revert → `failed`, timeout → `pending_verification`, never retried. **Implemented, not yet exercised** — the one fill succeeded |
| 3.10 | Reconciliation script | ✅ | `resolveUnverified()` in `src/thetanuts/reconcile.js`, section 3 of `scripts/reconcile.js`. Ran clean 1 Sep — no unresolved fills, no drift |

**Definition of done:** a BaseScan link to our own transaction. **Save the hash — it's the proof the whole submission rests on.**

**Rules:** BR-8, BR-9, BR-10, BR-12, BR-14, BR-15, BR-28, BR-29.

### On-chain actions are irreversible

We deploy no contracts of our own — we only call Thetanuts. So our single irreversible action is `fillOrder`. Once it confirms, these are permanent:

- strike, expiry, contract count
- the premium paid (not refundable)
- the burner wallet as holder

A wrong fill cannot be edited. The only remedies are to wait for expiry or to buy a second, correct option. At 1–3 USDC the money is irrelevant; **the time is not.** A mistake made the day before the pitch cannot be undone.

**The asymmetry that matters:**

| Data | Recoverable if lost? |
|---|---|
| strike, expiry, tx hash, settlement result | **Yes** — the chain has it, just read again |
| **which position belongs to which user** | **No** — on-chain, one wallet owns everything |

Treat chain data as a cache we can always rebuild. Treat `positions.user_id` as the one thing that cannot be reconstructed from any external source.

### Pre-flight checklist (task 3.5b)

Implement as one function. Every item must pass; any failure aborts before broadcast.

```
[ ] USDC balance covers the premium
[ ] ETH balance covers gas
[ ] Quote is still within its validity window        (BR-8)
[ ] Fill price within tolerance of the quote          (BR-9)
[ ] Strike and expiry match what the user was shown
[ ] Premium is under the hard cap                     (BR-33)
[ ] Daily fill count is under the cap                 (BR-34)
[ ] Allowance is the exact amount, not MaxUint256     (BR-12)
[ ] callStaticFillOrder succeeded                     (BR-28)
[ ] Pending row written to the database               (BR-14)
```

**Simulate the whole flow with `callStatic` before the first real fill.** Task 3.5 precedes 3.7 for exactly this reason.

---

## Phase 4 — Settlement 🔄

**Goal:** reflect on-chain settlement in our database. Read-only — settlement is automatic (requirements.md UC-3).

> ⚠️ **Every row below is ✅, and none of this has ever executed.** No position
> has reached a terminal status — `settled`, `expired_worthless` and
> `needs_review` have never once been written. The first options this project has
> held to expiry mature 2 and 3 Sep, so **2 Sep 16:00 MYT is the first real run**.
>
> What HAS been verified, and how far it goes:
>
> - the read path works against all five live options, and the buyer and size
>   match the chain (BR-31)
> - `transition_position` accepts all three terminal statuses — probed against
>   the live database in rolled-back transactions
> - the settled branch has never run, because it requires a settled option
>
> Two of the three price sources were found broken on 1 Sep precisely because
> nothing had reached them: `getTWAP` reverts on an unsettled option, and
> `full.settlementPrice` was read from a shape `getFullOptionInfo` does not
> return. Dead code in a path that has never executed is indistinguishable from
> working code.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 4.1 | Query settlement status | ✅ | `getFullOptionInfo(addr).isSettled` — a FIELD, not a method. Neither `getOptionInfo().settled` nor `option.isSettled()` exists. One call returns expiry, settled, buyer and size |
| 4.2 | Read the payout | ✅ | `calculatePayout()` verified against the real position: $2,000 → 44.79968 USDC |
| 4.3 | Scheduler loop | ✅ | `src/scheduler/` — hourly (BR-11), read-only client so it structurally cannot spend |
| 4.4 | Failed-settlement detection | ✅ | Time threshold `SETTLEMENT_GRACE_HOURS` (default 6) → `needs_review`. An event path now exists after all — `settlementSources.js` scans 9-block `eth_getLogs` cap) |
| 4.5 | Catch-up on restart | ✅ | Startup sweep, oldest expiry first |

**Definition of done:** a position bought in Phase 3 reaches a terminal status automatically.

> ⚠️ **OUR POSITION EXPIRES 2026-09-02 08:00 UTC = 16:00 MYT, Tuesday afternoon.**
>
> If the loop is not running as a daemon by then, **someone runs `node scripts/settle.js --confirm` by hand that Tuesday afternoon.** "2 Sep" gets remembered as "sometime Tuesday"; 16:00 MYT does not.
>
> No second purchase is needed — this position settles four days before the pitch.
>
> **After the sweep, save the settled row and the BaseScan state to `docs/ONCHAIN-EVIDENCE.md`.** A position that completed the full lifecycle — bought, expired, settled, recorded — is the strongest artefact this project will produce, and it exists for exactly one moment.

> ⚠️ **BR-27 cannot be implemented as written.** It specifies detecting failed settlement via `OptionSettlementFailed` events, but Alchemy's free tier caps `eth_getLogs` at a **9-block range** (~18 seconds of history). Scanning from our fill to head already needs ~500 requests and grows. `isSettled()` is a plain contract read and is unaffected, so primary detection works; only the failure path falls back to a time threshold. Upgrading Alchemy to PAYG would restore the rule as written.

---

## Phase 5 — Frontend 🔄

**Owner:** teammates. Backend exposes the API.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 5.1 | API contract agreed | ✅ | Backend half built — `src/api/`. **8** endpoints. Contracts handed over: `docs/API-LOAN-STRESS.md` (7.5), `docs/API-MARKET-CONTEXT.md`, `docs/API-COIN-DETAIL.md` |
| 5.2 | CORS configured | ✅ | `http://localhost:5173` named explicitly, preflight handled, unknown origins not echoed — verified in `api:check` |
| 5.3 | Quote screen | ✅ | `frontend/src/screens/QuoteScreen.jsx`, both entry modes, no options jargon (BR-3) |
| 5.4 | Confirmation screen | ✅ | `ConfirmationScreen.jsx` — shows max loss via `maxLoss.forConfirmation` (BR-2) |
| 5.5 | Position dashboard | 🔄 | `DashboardScreen.jsx` renders status, floor, expiry and the BaseScan link. **Two known defects, both introduced by the API change on 1 Sep and both in the frontend developer's files:** a vault call shows `$0.00 USDC` because `formatUsdc(null)` returns zero, and three positions still read "Payment status unavailable" because `paymentStatus: 'none'` is not in `paymentStatusCopy` |
| 5.6 | Custody disclosure | ✅ | `RealityDisclosure.jsx` — "Who holds the funds?", shown not buried (BR-32) |
| 5.8 | Coin Detail market data | 🔄 | **Backend done 1 Sep**, scope added by team decision. Three read-only endpoints in `src/marketdata/` — CoinGecko overview, Binance candles and depth snapshot. Display only, enforced by a test, not a comment. **No streaming endpoint**: polling depth every 2–3s is visually identical over a demo and cannot leave a stale panel looking live. The chart itself is the frontend developer's half, and the frontend has no charting library yet |
| 5.7 | Front-to-back integration verified | ✅ | Verified 1 Sep against a real fill, tx `0x64e37010…`. Quote to broadcast took 140.7s — at least two book re-signings — so the fill went through economic matching, not the signature fast path. See ONCHAIN-EVIDENCE.md §6 |

**Stack:** Vite + React + anime.js. Nothing else — no component library, no state manager, no router.

**Animation comes last.** The one animation worth having is the moment the price crosses the protected floor. Decoration built before the flow works is wasted.

---

## Phase 6 — Demo & submission ⬜

**Deadline: 5 Sep 23:59 MYT. Pitch 6 Sep at APU.**

| # | Task | Status | Acceptance |
|---|---|---|---|
| 6.0 | **Demo machine decided and verified** | ⬜ | Frontend + backend + `.env` all on the one laptop going on stage |
| 6.1 | **Feature freeze** | ⬜ | **4 Sep.** After this, only bug fixes |
| 6.2 | Demo script rehearsed | ⬜ | Fits in 5 minutes, run end to end at least 3 times |
| 6.3 | Demo can be re-run live | ⬜ | Judges may ask to see it twice |
| 6.4 | 3–5 min video | ⬜ | YouTube or Loom, unlisted is fine |
| 6.5 | Public repo README | 🔄 | Audited against code and chain 1 Sep: eight transactions with what each proves, five option contracts, a simulated-vs-real table, and the setup section corrected (a fresh clone runs on mock data by default). **Demo section still to rewrite; video link still a placeholder** |
| 6.6 | AI tool declaration | 🔄 | Table split per person. One row complete; **three carry a visible TODO** pending answers from the other developers. A blank is a disqualification risk and a guess is worse |
| 6.7 | Devfolio submission | ⬜ | **Submit 4 Sep, not 5 Sep.** Leave a day of margin |
| 6.8 | Q&A prep | ⬜ | Stop-loss vs put, odette.fi / collar difference, custody, seller side, why ETH only |

---

## Phase 7 — Options-powered lending 🔄

**Depends on Phases 1–4.** The put that acts as a collateral floor is bought and settled by the same code the core product uses, so that code must work first. This is a dependency, not a priority ranking.

**Why it's viable:** we're already custodial, so we can be the lender ourselves. No smart contract needed — the put is a real on-chain position and the USDC transfer is a real on-chain transaction. Both verifiable on BaseScan. See `PRODUCT-THINKING.md` Idea 1.

**Why it's cheap once the core works:** it reuses ~90% of the existing code. Buying, settlement, database and scheduler are unchanged — what's new is a `loans` table and two flows.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 7.1 | `loans` table + migration | ✅ | Triggers enforce BR-39 and BR-48 — a ratio cannot be inserted |
| 7.2 | Credit limit derived from strike | ✅ | `src/lending/credit.js` — strike × contracts in bigint, no configurable factor |
| 7.3 | Disburse USDC on-chain | ✅ | tx `0x29165d16…`, 4.597700 USDC = 2300 × 0.001999. See ONCHAIN-EVIDENCE.md |
| 7.4 | Repayment flow | ✅ | Verify-and-record: the borrower signs, we verify on chain. tx `0x02c37705…`, 4.599411 owed. Seven checks; check 5 refused a wrong-direction transfer on first use. See ONCHAIN-EVIDENCE.md §4 |
| 7.5 | No-liquidation demo | 🔄 | **Backend done, screen not built.** `src/lending/stress.js` + `GET /api/loans/:id/stress`, nine tests, both `as-disbursed` and `current` rule views. The side-by-side visualisation is the frontend developer's file; contract handed over in `docs/API-LOAN-STRESS.md` |

**Definition of done:** a BaseScan link to a USDC disbursement whose size is provably derived from an on-chain put's strike.

**The question judges will ask:** "You're the lender — you're not liquidating because of the put, or because you chose not to?" The answer must be: *the credit limit is the strike. Remove the put and we'd lend 500, not 800, and keep the right to liquidate.* Make sure the code actually works that way, or the answer is a lie.

---

## Phase 8 — Two-day principal protection 🔄

**Cut on 31 Aug, reinstated the same day.** The analysis that led to the cut still
stands and is recorded below; the team decided it ships anyway, with a real
on-chain call like everything else.

**What it is, named honestly:** *two-day principal protection with a small share of
the upside.* Not a savings vault — over two days there is nothing for principal
protection to protect against, and calling it savings would invite an arithmetic
question we would lose.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 8.1 | `vaults` table + migration | ✅ | `yield_is_simulated` pinned true by CHECK; maturity must equal the call expiry |
| 8.2 | Deposit split logic | ✅ | `splitDeposit()` solves backwards from the guarantee, so protection is exact |
| 8.3 | Buy a real call on Thetanuts | ✅ | tx `0x7930bc42…`, strike 2660, buyer side, 9347 raw contracts. See ONCHAIN-EVIDENCE.md §5 |
| 8.4 | Simulated yield accrual | ✅ | `yieldIsSimulated` carried as data; `scripts/vault.js` labels it SIMULATED on the line the number is printed and again in the summary (BR-37). No frontend vault screen exists, so the CLI is where the number appears |
| 8.5 | Participation rate displayed | ✅ | `participationFor()` — from the real premium paid, never hardcoded (BR-38) |
| 8.6 | Maturity flow | 🔄 | **Code done 1 Sep.** `src/vault/maturity.js`, `npm run mature`, nine checks, eight tests. Resize tx `0xd7fec53c…`, participation 23.5422% (§7). **The transfer executes 3 Sep after 16:00 MYT** — see `docs/RUNBOOK.md` |

**Non-negotiable in the copy** — a judge will do the arithmetic:

- participation rate computed from the **real premium paid**, never hardcoded (BR-38)
- the yield portion labelled **simulated at the point the number appears** (BR-37)
- the **two-day tenor stated**, not implied
- **not** retitled "principal-protected savings"

### The arithmetic, and why it was nearly cut

Measured 31 Aug rather than assumed. Vanilla buy-side ETH calls exist:

```
2026-09-02 (+2.3d)  9 strikes 2420-2580   premium $3.47-39.71/unit
```

A $100 deposit at 5%/yr over 2.3 days sets aside $99.97 and spends **$0.03** on a
call, which buys ~$21 of exposure — **participation ~21%**, higher than the 4–7%
once feared.

**The honest problem is the other half.** Over 2.3 days the yield given up is three
cents. The guarantee protects against a risk that barely exists at that horizon, so
the number is correct and the product it describes is thin. That is why the copy
constraints above are not optional: state the tenor, label the simulation, and
derive the rate from what was actually paid.

**Definition of done:** a BaseScan link to a real call purchase, with the interface
stating the participation rate and labelling the simulated yield.

---


## Timeline

| Date | Target |
|---|---|
| 29–30 Aug | Phase 1 quote engine + Phase 2 database |
| 31 Aug – 1 Sep | Phase 3 — **first real fill** |
| 2 Sep | Phase 4 settlement + buy a short-dated position for the demo |
| 2–3 Sep | Phase 5 frontend, Phase 7 lending, Phase 8 vault |
| 4 Sep | **Freeze.** Video, README, submit |
| 5 Sep | Buffer. Rehearse |
| 6 Sep | Pitch |

**Build in dependency order.** Phases 7 and 8 both rest on the buy-and-settle code from Phases 1–4. Starting them before that code works means debugging three products at once.

---

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| First on-chain fill fails or takes days | Fatal — no working product | Start Phase 3 by 31 Aug. Dry-run everything first |
| No settled position to show | Weakens the demo | Buy a 1-day expiry by 3 Sep so it settles before pitch day |
| Private key leaked into public repo | Funds lost, possible DQ | `.gitignore` verified, `git status` before every commit |
| Book has no suitable strike | Product looks broken | Disclose the real strike (BR-6). Pick assets with dense books |
| Frontend and backend integrate late | Nothing works together | Agree the API contract in Phase 5.1 before either side builds |
| Team over-builds and finishes nothing | Fails criterion #1 | Freeze on 4 Sep regardless of state |
| Wrong parameters filled on-chain the day before the pitch | Unfixable in time | Pre-flight checklist (3.5b) + `callStatic` dry run on every fill |
| `user_id` mapping lost | Product broken, unrecoverable | Verify backups (BR-35); reconciliation script (BR-36) |
| Three products each half-finished | Fails criterion #1 for all three | Build in dependency order; each phase's definition of done must be met before the next starts |
| Vault participation rate looks unattractive | Weakens criterion #2 | Frame it as short-dated and state the constraint openly — the guarantee is the product, not the upside |
| Frontend and backend on different laptops on demo day | Nothing runs | Task 6.0 — decide the machine early and rehearse on it |
| Venue wifi fails | Local demo survives; RPC calls do not | Cache a recent quote; dashboard must be readable from the database alone |

---

## Out of scope — do not build

Recorded so nobody quietly starts one of these:

- RFQ flow (§0 decision)
- Non-custodial wallet integration
- Hosted deployment — the demo runs locally
- **Writing our own smart contracts** — mainnet deployment costs real gas and Thetanuts has no testnet, so there is nowhere to deploy them
- Rolling or cancelling protection before expiry
- Notifications
- Multi-asset portfolios
- User authentication beyond what the demo needs