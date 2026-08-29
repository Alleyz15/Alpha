# IMPLEMENTATION PLAN

**Project:** MUBA Hacks 2026 — Thetanuts Track 01
**Repo:** github.com/Alleyz15/Alpha
**Last updated:** 29 Aug 2026

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
| ⬜ | Not started |
| ⛔ | Blocked |
| ❌ | Cut from scope |

---

## Where we are right now

**Phase 0 complete. Phase 1 is next.**

Working: repo, secrets hygiene, Alchemy RPC, Thetanuts SDK connected to Base mainnet, live order book readable, SDK surface mapped.

Not started: database, quote engine, any transaction, any frontend.

**Nothing is blocked.** All open questions from requirements.md §7 are resolved.

**Scope:** all four ideas are being built. Idea 2+4 (one product, two entry points) is the engine; Phase 7 lending and Phase 8 vault build on top of it. The ordering is a dependency chain, not a priority ranking. See `IDEA.md`.

---

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
| Expiries mapped | ✅ | +1 to +62 days; +27 has 49 orders |
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

## Phase 1 — Quote engine ⬜

**Goal:** given an asset, an amount and a protection level, return a real quote from the live book. Read-only — no wallet, no transactions.

**Why first:** it's the core of the product, it's the least risky thing to build, and it proves the concept before any money moves.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 1.1 | Fetch spot price for an asset | ⬜ | `getMarketData()` returns ETH price, converted to a plain number |
| 1.2 | Filter book to puts on one asset | ⬜ | Given ETH, returns only ETH puts, count printed |
| 1.3 | Convert raw order fields to human values | ⬜ | strike/premium correct at 8 decimals, expiry as a Date |
| 1.4 | Select best order for a target strike + expiry | ⬜ | Given "20% protection, 30 days", returns one order with the actual strike and days |
| 1.5 | Size the position | ⬜ | `calculateNumContracts` used; respects `availableAmount` |
| 1.6 | Produce a quote object | ⬜ | Returns: premium, protected floor, expiry, max loss, actual vs requested protection |
| 1.7 | Goal-based input path | ⬜ | "I need $2,000 by 1 Nov" resolves to the same quote object |
| 1.8 | Scenario preview | ⬜ | `utils.calculatePayoutAtPrice` gives outcomes at several prices |

**Definition of done:** `node quote.js` prints a complete, correct quote for ETH using live data.

**Rules that apply:** BR-3 (no jargon in output), BR-4, BR-5, BR-6 (disclose the real strike), BR-7 (decimals).

---

## Phase 2 — Database ⬜

**Goal:** persist users, quotes and positions. See DATABASE.md for the schema.

**Why now:** Phase 3 writes a row *before* it sends a transaction (BR-14), so the schema must exist first.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 2.1 | Supabase project created | ⬜ | Region: Singapore. Keys in `.env` |
| 2.2 | Migration tooling set up | ⬜ | `supabase/migrations/` exists, first migration applies cleanly |
| 2.3 | Core tables created | ⬜ | Per DATABASE.md |
| 2.4 | RLS enabled on every table | ⬜ | BR-16 — verify with a publishable key that nothing leaks |
| 2.5 | DB access layer | ⬜ | Insert/update/query helpers, secret key server-side only |
| 2.6 | Seed a demo user | ⬜ | Demo works without a login flow |

**Definition of done:** a fresh machine can run the migrations and get an identical database.

---

## Phase 3 — Buy execution ⬜ ← highest risk

**Goal:** actually fill an order on Base mainnet with real USDC.

**This is the task most likely to go wrong, so start it early.** Everything before it is read-only; this is where signing, approvals, gas and money enter.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 3.1 | Create burner wallet | ⬜ | Fresh wallet, key only in `.env` (BR-30) |
| 3.2 | Fund it | ⬜ | A few USDC + cents of ETH on Base |
| 3.3 | Balance checks | ⬜ | Refuses to proceed without enough USDC and gas (BR-10) |
| 3.4 | Exact-amount approval | ⬜ | `ensureAllowance`, never MaxUint256 (BR-12) |
| 3.5 | Dry run the fill | ⬜ | `callStaticFillOrder` passes before anything is broadcast (BR-28) |
| 3.5b | Pre-flight checklist as code | ⬜ | A single function that must return pass before any fill; any failure aborts |
| 3.6 | Write pending row, then broadcast | ⬜ | DB row exists before the transaction is sent (BR-14) |
| 3.7 | **First real on-chain fill** | ⬜ | Transaction confirmed, visible on BaseScan, ~1–3 USDC (BR-15) |
| 3.8 | Record the result | ⬜ | Row updated to `active` with tx hash, option address, real fill price |
| 3.9 | Handle failure paths | ⬜ | Revert → `failed`; timeout → `pending_verification`, never blind-retry |
| 3.10 | Reconciliation script | ⬜ | Rebuilds all position facts from chain and diffs against the DB |

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

## Phase 4 — Settlement ⬜

**Goal:** reflect on-chain settlement in our database. Read-only — settlement is automatic (requirements.md UC-3).

| # | Task | Status | Acceptance |
|---|---|---|---|
| 4.1 | Query settlement status | ⬜ | `getOptionInfo().settled` read correctly |
| 4.2 | Read the payout | ⬜ | `calculatePayout` view call returns the amount |
| 4.3 | Scheduler loop | ⬜ | Finds expired positions, updates status (BR-11) |
| 4.4 | Failed-settlement detection | ⬜ | Unsettled past threshold → `needs_review` (BR-27) |
| 4.5 | Catch-up on restart | ⬜ | Processes overdue positions first |

**Definition of done:** a position bought in Phase 3 reaches a terminal status automatically.

> ⚠️ **Timing:** the shortest expiry is 1 day. To demo a real settlement, **the position must be bought at least a day before demo day.** Buy a short-dated one by 3 Sep at the latest, or the settlement path will only ever be shown as a simulation.

---

## Phase 5 — Frontend ⬜

**Owner:** teammates. Backend exposes the API.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 5.1 | API contract agreed | ⬜ | Endpoint shapes written down **before either side builds** |
| 5.2 | CORS configured | ⬜ | 5173 → 3000. Requests are blocked without it and the error doesn't say so |
| 5.3 | Quote screen | ⬜ | No options jargon anywhere (BR-3) |
| 5.4 | Confirmation screen | ⬜ | Shows max loss explicitly (BR-2, US-9) |
| 5.5 | Position dashboard | ⬜ | Status, floor, expiry, BaseScan link |
| 5.6 | Custody disclosure | ⬜ | Visible in the UI, not buried (BR-32) |
| 5.7 | Front-to-back integration verified | ⬜ | Both running together on one machine, full flow works |

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
| 6.5 | Public repo README | ⬜ | Description, problem, chain, contract addresses, setup, team |
| 6.6 | AI tool declaration | ⬜ | Every tool used, as required by the rules |
| 6.7 | Devfolio submission | ⬜ | **Submit 4 Sep, not 5 Sep.** Leave a day of margin |
| 6.8 | Q&A prep | ⬜ | Stop-loss vs put, odette.fi / collar difference, custody, seller side, why ETH only |

---

## Phase 7 — Options-powered lending ⬜

**Depends on Phases 1–4.** The put that acts as a collateral floor is bought and settled by the same code the core product uses, so that code must work first. This is a dependency, not a priority ranking.

**Why it's viable:** we're already custodial, so we can be the lender ourselves. No smart contract needed — the put is a real on-chain position and the USDC transfer is a real on-chain transaction. Both verifiable on BaseScan. See `IDEA.md` Idea 1.

**Why it's cheap once the core works:** it reuses ~90% of the existing code. Buying, settlement, database and scheduler are unchanged — what's new is a `loans` table and two flows.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 7.1 | `loans` table + migration | ⬜ | Per DATABASE.md conventions |
| 7.2 | Credit limit derived from strike | ⬜ | `limit = strike × contracts`. Never a hardcoded ratio — this is the whole point |
| 7.3 | Disburse USDC on-chain | ⬜ | Real transfer to the user's address, tx hash recorded |
| 7.4 | Repayment flow | ⬜ | Repay principal + interest, ETH released |
| 7.5 | No-liquidation demo | ⬜ | Two positions side by side, price fed to 350, one flags, one doesn't |

**Definition of done:** a BaseScan link to a USDC disbursement whose size is provably derived from an on-chain put's strike.

**The question judges will ask:** "You're the lender — you're not liquidating because of the put, or because you chose not to?" The answer must be: *the credit limit is the strike. Remove the put and we'd lend 500, not 800, and keep the right to liquidate.* Make sure the code actually works that way, or the answer is a lie.

---

## Phase 8 — Principal-protected vault ⬜

**Depends on Phases 1–4**, for the same reason as Phase 7: it buys and settles an option, only a call instead of a put.

**The constraint that shapes it:** the longest expiry on the book is 62 days, not a year. Over 62 days, 95 USDC at 5% generates ~0.81 USDC, which buys 10–16 USDC of exposure. **Participation rate is 10–16%, not 40–50%.** That number goes on screen.

**What's real:** the call, on Base mainnet, BaseScan verifiable.
**What's simulated:** yield accrual, labelled as such in the UI.

| # | Task | Status | Acceptance |
|---|---|---|---|
| 8.1 | `vaults` table + migration | ⬜ | Per DATABASE.md conventions |
| 8.2 | Deposit split logic | ⬜ | Principal split into yield and option portions |
| 8.3 | Buy a real call on Thetanuts | ⬜ | BaseScan verifiable, 62-day expiry |
| 8.4 | Simulated yield accrual | ⬜ | Labelled as simulated in the UI, not hidden (BR-37) |
| 8.5 | Participation rate displayed | ⬜ | Calculated from real premium and exposure, never hardcoded (BR-38) |
| 8.6 | Maturity flow | ⬜ | Principal returned plus any call payout |

**Definition of done:** a BaseScan link to a real call purchase, with the interface stating the participation rate and labelling the simulated yield.

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
- Principal-protected vault (Idea 3) — needs an RWA yield source, and its value only shows after a year
- **Writing our own smart contracts** — mainnet deployment costs real gas and Thetanuts has no testnet, so there is nowhere to deploy them
- Rolling or cancelling protection before expiry
- Notifications
- Multi-asset portfolios
- User authentication beyond what the demo needs