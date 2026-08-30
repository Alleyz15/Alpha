# Alpha Build Plan

MUBA Hacks 2026 · Thetanuts Track 01 · Base mainnet

---

## 0. Working Protocol

This applies to every AI session and every task in this document.

Before implementing anything:

1. State the approach first. Which files will be created or changed, the shape of the solution, the trade-offs, and every assumption being made.
2. Stop and wait for approval. Do not write code in the same turn as the proposal.
3. On approval, implement as proposed. If reality forces a deviation, say so before deviating.
4. On rejection, the developer supplies their own approach. Rebuild the proposal around their idea. Do not re-argue the rejected version unless it has a correctness or security problem, in which case say so once and then follow their direction.
5. Report when done, then stop again. List every file created, changed or deleted and what changed in each. Wait for confirmation before starting anything else.

Reason:

This is a small team on a one-week deadline, several members are working outside their usual area, and the repository is public with a funded wallet attached. Code that appears without a stated plan cannot be reviewed meaningfully.

Two AI roles are kept apart:

```text
Instructor  = chat with web access. Design, fact-checking, documentation.
Worker      = this repository. Implements approved tasks only.
```

The worker's job is execution, not redesign. If a task looks wrong, say so and stop.

---

## 1. Product Direction

This project is a consumer downside-protection app built on an on-chain options protocol. It is not a trading application.

A put option gives its holder the right to settle at a fixed price. Downside gets a floor, upside stays open, and the maximum loss is the premium, known before committing. It is insurance. The instrument has existed for decades and is barely used by ordinary people, because every interface that offers it demands a strike price, an expiry, and a working knowledge of implied volatility before anything can happen.

The instrument is not the barrier. The interface is.

Core MVP use cases:

- A user describes a worry in plain language and receives a real quote from the live order book.
- Two entry points resolve to the same action: a percentage the user can tolerate losing, or an amount they need by a date.
- The system buys a put on their behalf, on-chain, with a verifiable transaction.
- The user sees cost, protected floor, and maximum loss before committing.
- Settlement is automatic; the system records the result and shows it on a dashboard.
- Options terminology never appears in user-facing text.

Beyond the core protection product, two further products build on the same engine:

- Options-powered lending, where the credit limit is derived from a put's strike, so liquidation is structurally unnecessary.
- A principal-protected vault, where yield funds a real on-chain call, so the worst outcome is no gain rather than a loss.

All three of Track 01's stated possibilities are covered: consumer trading apps, options-powered lending, and structured products.

Main system rule:

```text
Thetanuts on Base   = the real position
PostgreSQL          = ownership and history
Scheduler           = reads settlement, writes records
Frontend            = a view, never an actor
```

The database never invents facts that live on chain. The chain never knows which user owns what.

Correct purchase flow:

```text
User describes what they are worried about
v
Quote engine reads the live book and prices the closest available option
v
Pre-flight checks pass, including a callStatic simulation
v
Pending row written to the database
v
fillOrder broadcast on Base mainnet
v
Row updated with transaction hash and option address
v
Scheduler reads settlement after expiry and records the payout
```

The design rule that shapes everything:

```text
The user is always the option buyer, never the seller.
```

Buyers have capped losses and open-ended upside. Sellers have capped gains and losses that run to the size of the position. Retail users have been steered onto the seller side for a decade by products advertising stable yield. This product does not offer that trade at any price.

---

## 2. Recommended Technology Stack

Frontend:

- React
- Vite
- anime.js v4

No component library, no state manager, no router. There are three screens. Every extra dependency is extra surface area, and the sponsor does not score the tech stack.

Backend:

- Node 24, ES modules
- `@thetanuts-finance/thetanuts-client`
- ethers v6
- dotenv
- An HTTP framework for the API layer
- A scheduler for settlement polling

Data:

- Supabase, PostgreSQL
- Migrations as versioned SQL files

Chain:

- Base mainnet, chainId 8453
- USDC as collateral
- Alchemy or Infura RPC, never the public endpoint

Deployment:

- None. The demo runs locally on one laptop at the pitch.

---

## 3. High-Level Architecture

```text
Browser (React + Vite)
v  HTTP, JSON
Backend API (Node)
├─> Thetanuts SDK ──> Base mainnet   (quotes, fills, settlement reads)
└─> Supabase                          (users, quotes, positions, events)

Scheduler (Node, same process or separate)
├─> Thetanuts SDK ──> Base mainnet   (read settlement status)
└─> Supabase                          (record outcomes)
```

The frontend never talks to Supabase and never talks to the chain. It calls our API and renders what comes back. This is simpler to secure and matches the custodial model.

Custody model:

The application operates a single burner wallet. Users do not connect wallets and do not sign anything. This is a deliberate trade-off: it means a judge can try the product on stage without installing anything, and it means the ownership mapping exists only in our database.

The custodial arrangement is disclosed in the UI and stated in the pitch. Hiding it and being caught in Q&A is worse than owning it.

---

## 4. Target Repository Structure

```text
Alpha/
├── backend/
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── thetanuts/      SDK integration: client, quoting, filling, settlement reads
│   │   ├── db/             Supabase client and queries
│   │   ├── api/            HTTP endpoints consumed by the frontend
│   │   └── scheduler/      Settlement polling job
│   └── scripts/            One-off tools: connectivity, expiries, inspection, reconcile
├── frontend/
│   ├── package.json
│   ├── .env.example
│   └── src/
├── supabase/
│   └── migrations/         The real schema. Never edit an applied file.
├── docs/
│   ├── BUILD_PLAN.md
│   ├── IDEA.md             Product thinking, scenarios, pitch material
│   ├── requirements.md     User stories, use cases, business rules
│   ├── DATABASE.md         Schema, relationships, migration policy
│   └── SETUP.md            Environment and known gotchas
└── README.md               For judges
```

Frontend and backend have separate `package.json` files. A shared one means two people editing the same `package-lock.json`, and those conflicts are thousands of lines of generated content.

`CLAUDE.md` and `codex.md` are not committed. They live in each developer's working copy and are shared through Discord.

---

## 4.5 What This Prototype Simulates

This is a prototype, not a product. The line between what is real and what is not runs through the middle of it, and stating that line clearly is part of the work.

```text
Simulated                        Real
─────────────────────────        ─────────────────────────────────────
User balances (seeded)           Quotes, from the live order book
Deposits (there is no flow)      Option purchases on Base mainnet
Vault yield accrual              Settlement, driven by the protocol
                                 Every transaction, verifiable on BaseScan
```

**Users never transfer assets to us.** There is no deposit path and none should be built.

The reason the simulated half exists is scope, not convenience: custody flows and yield integrations are separate products, and building either would displace the part the sponsor actually asked for — meaningful use of on-chain options.

**Every simulated component is labelled where the user sees it.** A prototype that says which half is real is more credible than one that quietly blurs them, and a judge who finds an unlabelled simulation will assume the rest is unlabelled too.

---

## 5. Design Principles Used

### Fail Loudly

A silent catch that swallows a transaction error is worse than a crash. Money is involved and the failure will be discovered later, at a worse time.

### Simulate Before Broadcasting

Every state-changing call is dry-run first with the SDK's `callStatic` variant. Broadcasting a transaction that was never simulated burns gas on a guaranteed revert.

### Write Before You Send

The database row exists before the transaction is broadcast. An interrupted transaction must leave a traceable record, not a silent gap.

### Irreversibility Awareness

We deploy no contracts, so the single irreversible action is `fillOrder`. Once confirmed, the strike, expiry, contract count and premium are permanent. A wrong fill cannot be edited; the only remedies are waiting for expiry or buying again. At 1–3 USDC the money is irrelevant. The time is not.

### Asymmetric Data Value

```text
Chain data      = a cache. Always rebuildable by reading again.
positions.user_id = the only fact with no external source of truth.
```

Under a custodial model, one wallet owns every position on chain. Nothing on the blockchain records which position belongs to which user. That mapping is the product.

### Bounded Authority

Approvals are for exact amounts, never `MaxUint256`. Hard caps on per-fill premium and daily fill count are enforced in code, so a misplaced decimal is impossible to broadcast rather than merely unlikely.

### Real and Simulated Are Never Blurred

Where a component is simulated, the interface says so at the point the number appears. Not in a footnote, not in a README. A prototype is credible when it is explicit about its own boundaries and worthless when it is not.

### Honest Interfaces

The order book offers discrete strikes. If the user asked for a floor at 1946 and the book gave 1900, the interface says 1900. Never display the requested figure as though it were obtained.

### Security by Design

The repository is public. Secrets live only in `.env`, which is gitignored. Variables prefixed `VITE_` are bundled into the browser, so no secret ever carries that prefix. Row Level Security is enabled on every table even though the backend bypasses it, so that a future mistake is not immediately fatal.

### Finishability Over Cleverness

The sponsor judges on two questions: does it work, and would anyone use it. They stated explicitly that they do not score complexity or tech stack. An unfinished clever thing scores zero.

---

## 6. Competition Constraints

These are external and non-negotiable.

```text
Submission   5 September 2026, 23:59 MYT, via Devfolio. Late is not accepted.
Pitch        6 September 2026, in person at APU.
Format       5-minute presentation plus 5-minute Q&A.
Requirement  A live working demo is mandatory. Slides are optional.
Code window  26 August to 5 September 2026. Commit timestamps are inspected.
Repository   Public, with clear commit history.
Also         A 3–5 minute demo video and a declaration of every AI tool used.
```

Prize structure for this track is 600 USDC for first and 400 for second. Two places only.

Chain reality:

Thetanuts exists only on Base mainnet. There is no testnet. Track 01 therefore requires real USDC in small amounts. Rule Section 9 prohibits deploying your own contracts with real funds; calling an already-deployed protocol is a different act, and Thetanuts confirmed this is acceptable for their track.

We write no contracts of our own. This keeps us clear of that rule entirely.

---

## 7. Build Phases

## Phase 0: Foundation

Status: complete.

Goal:

Create a working local backend environment connected to the live protocol.

Deliverables:

- Repository created, public, with `.gitignore` verified to exclude `.env`.
- Node 24, npm 11, Git 2.55 across the team.
- Alchemy RPC key for Base mainnet.
- Thetanuts SDK installed and reachable.
- Read-only connectivity confirmed: roughly 320 live orders and prices for six underlyings.
- Order book structure documented, including decimals.
- SDK method surface mapped by runtime introspection and by reading the type definitions.
- `loan` and `collar` modules checked: not deployed on Base.

Verification:

```text
node backend/scripts/test.js
```

Expected: a live order count and a price map for ETH, BTC, SOL, XRP, BNB, AVAX.

Principles used:

- Explicit Configuration: the RPC endpoint is a required environment variable with no code default.
- Verify, Do Not Assume: the SDK surface was read from `.d.ts` and from runtime introspection rather than from documentation.

## Phase 1: Quote Engine

Goal:

Given an asset, an amount and a protection level, return a real quote from the live order book. Read-only. No wallet, no transactions, no funds at risk.

Why first:

It is the core of the product, it is the least risky thing to build, and it proves the concept before any money moves.

Deliverables:

- Spot price fetched and converted to a plain number.
- Book filtered to puts on a single asset.
- Raw order fields converted to human values at the correct decimals.
- Best order selected for a target strike and expiry.
- Position sized with `calculateNumContracts`, respecting `availableAmount`.
- A quote object returning premium, protected floor, expiry, maximum loss, and requested versus actual protection.
- Goal-based input resolving to the same quote object.
- Scenario preview using `utils.calculatePayoutAtPrice`.

Derivation rules:

```text
percentage mode:  target strike = spot × (1 − protection)
goal mode:        target strike = target value ÷ amount held
expiry:           on or after the user's date. Never earlier.
disclosure:       the interface shows the actual strike, never the requested one.
```

Modules involved:

- `backend/src/thetanuts`

Principles used:

- Honest Interfaces: the gap between requested and available protection is surfaced, not hidden.
- Single Responsibility: price fetching, filtering, selection and pricing are separate functions.

Verification:

```text
node backend/scripts/quote.js
```

Expected: a complete, correct quote for ETH from live data, with no options jargon in the output.

## Phase 2: Database

Goal:

Persist users, quotes and positions, reproducibly.

Why now:

Phase 3 writes a row before it sends a transaction, so the schema must exist first.

Deliverables:

- Supabase project created in the Singapore region.
- Migration tooling in place under `supabase/migrations/`.
- Core tables created per `DATABASE.md`.
- Row Level Security enabled on every table.
- A database access layer using the secret key, server-side only.
- Demo users seeded, since there is no login flow.

Schema shape:

```text
users ──1:N──> quotes ──1:0..1──> positions ──1:N──> position_events
  └────────────────1:N───────────────┘
```

Migration rules:

```text
One logical change per file.
Filename: YYYYMMDDHHMMSS_description.sql
Never edit a migration that has already been applied. Add a new one.
Schema changes never go through the Supabase web editor — that creates no file.
```

Modules involved:

- `backend/src/db`
- `supabase/migrations`

Principles used:

- Reproducibility: a fresh machine runs the migrations and gets an identical database.
- Append-Only History: a position is never updated without an event row being inserted.

Verification:

A fresh clone plus a migration run produces the same schema, and querying with a publishable key returns nothing it should not.

## Phase 3: Buy Execution

Highest risk phase. Start it early.

Goal:

Fill an order on Base mainnet with real USDC.

Why it is the risk:

Everything before this is read-only. This is where signing, approvals, gas and money enter, and where a mistake cannot be undone.

Deliverables:

- A fresh burner wallet, key only in `.env`.
- Funded with a few USDC and cents of ETH for gas.
- Balance checks that refuse to proceed.
- Exact-amount approval via `ensureAllowance`.
- A `callStaticFillOrder` dry run that must pass.
- A pre-flight checklist implemented as a single function.
- A pending row written before broadcast.
- The first real on-chain fill, 1–3 USDC.
- The result recorded with transaction hash, option address and real fill price.
- Failure paths handled.
- A reconciliation script.

Pre-flight checklist:

```text
[ ] USDC balance covers the premium
[ ] ETH balance covers gas
[ ] Quote is still within its validity window
[ ] Fill price within tolerance of the quote
[ ] Strike and expiry match what the user was shown
[ ] Premium is under the hard cap
[ ] Daily fill count is under the cap
[ ] Allowance is the exact amount, not MaxUint256
[ ] callStaticFillOrder succeeded
[ ] Pending row written to the database
```

Any failure aborts before broadcast.

Failure handling:

```text
Transaction reverts    -> status failed, reason surfaced, nothing charged
Transaction times out  -> status pending_verification, reconcile against chain
```

Never assume a timeout means failure and retry. That risks a double buy.

Modules involved:

- `backend/src/thetanuts`
- `backend/src/db`

Principles used:

- Simulate Before Broadcasting.
- Write Before You Send.
- Bounded Authority.

Verification:

A BaseScan link to our own transaction. Save the hash. The entire submission rests on it.

## Phase 4: Settlement

Goal:

Reflect on-chain settlement results in the database.

Important protocol fact:

Settlement is fully automatic. The protocol settles through the factory's `notifyTradeSettled` callback and pays the buyer without any action from us. `client.option.payout()` is deprecated and throws `INVALID_PARAMS`; it no longer exists on the current deployment.

This phase therefore sends no transactions. No signing, no gas. It reads chain state and writes to our own database.

Deliverables:

- Settlement status read from `getOptionInfo().settled`.
- Payout amount read from `calculatePayout`, a view call.
- A scheduler loop that finds expired positions and updates their status.
- Failed-settlement detection.
- Catch-up processing on restart.

Status transitions:

```text
active + expired + settled + payout > 0   -> settled
active + expired + settled + payout = 0   -> expired_worthless
active + expired + not settled past limit -> needs_review
```

Automatic settlement is not guaranteed. The protocol emits `OptionSettlementFailed` events. Positions stuck unsettled are flagged, never silently dropped.

Modules involved:

- `backend/src/scheduler`
- `backend/src/thetanuts`
- `backend/src/db`

Timing constraint:

The shortest expiry is one day. To demonstrate a real settlement, a short-dated position must be bought by 3 September at the latest. Otherwise the settlement path can only ever be shown as a simulation.

## Phase 5: Frontend

Owner: the frontend developer. The backend exposes the API.

Goal:

Three screens that never mention options.

Deliverables:

- API contract agreed and written down before either side builds.
- CORS configured between the two local ports.
- Quote screen with no options jargon.
- Confirmation screen stating maximum loss explicitly.
- Position dashboard with status, floor, expiry and a BaseScan link.
- Custody disclosure visible, not buried.
- Front-to-back integration verified on one machine.

anime.js rules:

```text
Scope every animation with createScope({ root }).
Always revert() in the useEffect cleanup.
Never let React and anime.js control the same property on the same element.
```

The third rule matters most. React re-renders overwrite mid-animation, and the symptom is intermittent flicker that is very hard to trace.

Animation comes last. The one animation worth having is the moment the price crosses the protected floor. Decoration built before the flow works is wasted.

Principles used:

- Frontend as a View: it renders what the API returns and holds no authority.
- Honest Interfaces: the real protection level is displayed.

## Phase 6: Demo and Submission

Goal:

Ship on time with a demo that survives contact with judges.

Deliverables:

- Demo machine decided and verified, with frontend, backend and `.env` all on the one laptop.
- Feature freeze on 4 September. After that, bug fixes only.
- Demo script rehearsed end to end at least three times, fitting in five minutes.
- The demo can be re-run live, because judges may ask to see it twice.
- A 3–5 minute video.
- README complete: description, problem, chain, contract addresses, setup, team.
- Declaration of every AI tool used.
- Devfolio submission on 4 September, not 5 September.
- Q&A preparation.

Demo structure:

```text
0:00–0:30  "My income moves. My rent doesn't."
0:30–1:00  The two sides of the options market; we only put users on the buy side
1:00–3:30  Live demo: plain-language input, real quote, on-chain fill, BaseScan, settled position
3:30–4:30  Who it's for and why they would pick it
4:30–5:00  Honest limitations, and what's next
```

Stop-loss comparison, the odette.fi difference, custody, the seller side, and why only ETH — all of these stay in Q&A, not in the five minutes.

## Phase 7: Options-Powered Lending

Depends on Phases 1 through 4. The put that acts as a collateral floor is bought and settled by the same code the MVP uses, so that code must work first.

Goal:

Let a user borrow USDC against protected collateral, with a credit limit derived from the option's strike, so liquidation is structurally unnecessary.

Why it is viable without contracts:

The system is already custodial. The user's collateral sits in our wallet, so we can be the lender ourselves. The put is a real on-chain position and the USDC disbursement is a real on-chain transfer. Both are verifiable on BaseScan. Nothing needs to be deployed.

Why it is cheap once the MVP exists:

The plumbing is reused — buying, settlement, database and scheduler are unchanged. **But reuse of code is not reuse of risk.** Lending makes us the lender, which introduces credit risk, default handling and an additional irreversible on-chain transfer. It also introduces a constraint that runs through the whole flow: the loan's maturity must equal the expiry of the put backing it, because the collateral floor exists only on that date and nowhere before it.

What is reused is the plumbing. What is new is the responsibility.

What was verified:

```text
client.collar.isDeployed()            -> false
client.loan.getLendingOpportunities() -> []
```

The SDK exposes lending interfaces, but they are not live on Base. This is not a ready-made feature.

Deliverables:

- A `loans` table and migration.
- Credit limit derived from the strike, never a hardcoded ratio.
- On-chain USDC disbursement to the user's address, transaction hash recorded.
- Repayment flow releasing the collateral.
- A no-liquidation demonstration: two positions side by side, price fed to a level that would liquidate a normal loan.

The credit rule:

```text
credit limit = strike × contracts
```

The question judges will ask:

"You are the lender. You are not liquidating because of the put, or because you chose not to?"

The answer must be: the credit limit is the strike. Remove the put and we would lend 500 instead of 800, and keep the right to liquidate. Make sure the code actually works that way, or the answer is a lie.

## Phase 8: Principal-Protected Vault

Depends on Phases 1 through 4 for the same reason as Phase 7: it buys and settles an option, only a call instead of a put.

Goal:

A deposit product where the worst outcome is no gain rather than a loss.

Structure:

```text
deposit 100 USDC
v
99.2 recorded as the yield portion, simulated at 5% annual
0.8  buys a real 62-day at-the-money call on Thetanuts
v
at maturity the yield portion has grown back to 100
plus whatever the call settles for
```

The constraint that shapes it:

The longest expiry on the book is 62 days, not a year. Over 62 days, 95 USDC at 5 percent generates roughly 0.81 USDC. That buys 10 to 16 USDC of exposure, so the participation rate is 10 to 16 percent, not the 40 to 50 percent a one-year product would reach.

```text
ETH +40%   -> user receives +4 to 6%
ETH +100%  -> user receives +10 to 16%
```

This number is displayed in the interface. Hiding it is dishonest, and judges will calculate it themselves.

What is real and what is not:

```text
Call option     real, on Base mainnet, BaseScan verifiable
Yield accrual   simulated for the demo, labelled as such in the interface
```

Integrating a live yield source is a separate integration that would displace core work. Track 01 asks whether Thetanuts is used meaningfully; the call satisfies that.

Technically this is simpler than lending — no borrower, no default path. The harder problem is honesty: the yield is simulated and the participation rate is low, so both must be visible at the point of decision rather than explained afterwards.

Deliverables:

- A `vaults` table and migration.
- Deposit flow splitting principal into yield and option portions.
- A real call purchased on Thetanuts, verifiable on BaseScan.
- Simulated yield accrual, labelled as simulated.
- Participation rate calculated from actual premium and exposure, never hardcoded, displayed before deposit.
- Maturity flow returning principal plus any call payout.

Modules involved:

- `backend/src/thetanuts`
- `backend/src/db`

Principles used:

- Honest Interfaces: the participation rate and the simulated portion are both disclosed before the user commits.

Verification:

A BaseScan link to a real call purchase, and an interface stating the participation rate and labelling the simulated yield.

---

## 8. Module Responsibilities

## `backend/src/thetanuts`

Owns every interaction with the options protocol. Constructs the client once and exports it, so no script builds its own.

Responsibilities:

- Fetch the order book and spot prices.
- Convert raw values at the correct decimals.
- Select orders against a target strike and expiry.
- Simulate and execute fills.
- Read settlement status and payout amounts.

Does not:

- Touch the database.
- Format anything for display.
- Know what a user is.

Decimals it must respect:

```text
strike, price, settlement price   8 decimals
USDC / collateral                 6 decimals
numContracts                      18 decimals
```

Getting these wrong makes numbers look 100 times off.

## `backend/src/db`

Owns all Supabase access. Uses the secret key, server-side only.

Responsibilities:

- Insert and update users, quotes, positions.
- Append position events.
- Provide the scheduler's query for expired positions.

Does not:

- Call the chain.
- Make product decisions about what should be stored.

Rule: a position is never updated without an event row being inserted alongside it.

## `backend/src/api`

Owns the HTTP surface consumed by the frontend.

Responsibilities:

- Validate incoming requests.
- Orchestrate quote, purchase and dashboard flows.
- Return shapes the frontend can render without further computation.

Does not:

- Contain SDK calls directly.
- Contain SQL directly.

## `backend/src/scheduler`

Owns the settlement polling loop.

Responsibilities:

- Find positions past expiry.
- Read their settlement status and payout from chain.
- Update the database.
- Flag positions that never settle.

Does not:

- Send transactions. Settlement is automatic.

Interval must be materially shorter than the shortest supported expiry. Given one-day expiries exist, hourly at minimum.

## `backend/scripts`

One-off diagnostic tools, not part of the running system.

- Connectivity check.
- Expiry listing.
- Order structure inspection.
- SDK surface introspection.
- Reconciliation against chain state.

These are how the project learns facts about the protocol. Keep them; they are also the evidence behind claims made in the pitch.

## `frontend/src`

Owns presentation only.

Responsibilities:

- Collect user input in plain language.
- Render quotes, confirmations and the dashboard.
- Display the custody disclosure.

Does not:

- Talk to Supabase.
- Talk to the chain.
- Hold any secret.

---

## 9. Business Rules Reference

The full list lives in `requirements.md`. These are the ones that will bite hardest.

Product:

```text
Only ever buy options. Never sell.
No options jargon in user-facing text.
Always state the maximum loss before a purchase.
Disclose the real protection level, not the requested one.
```

Money and chain:

```text
Dry-run with callStatic before broadcasting anything.
Write the database row before sending the transaction.
Approve exact amounts. Never MaxUint256.
Hard caps in code for per-fill premium and daily fill count.
Trades stay at 1–3 USDC.
```

Secrets, in a public repository:

```text
Never commit, log, print or echo a private key or the Supabase secret key.
Never prefix a secret with VITE_.
Enable RLS on every table.
```

Data:

```text
positions.user_id has no external source of truth. Protect it accordingly.
Never edit an applied migration.
Never UPDATE a position without inserting a position_events row.
```

---

## 10. Testing Strategy

There is one week. Testing is proportionate, not exhaustive.

Manual verification at every phase boundary:

```text
Phase 1  A printed quote that a human can check against the live book
Phase 2  A fresh migration run producing an identical schema
Phase 3  A BaseScan link
Phase 4  A position reaching a terminal status without intervention
Phase 5  The full flow completed in a browser
```

Automated checks worth the time:

- Decimal conversion, both directions. This is where silent 100x errors live.
- Strike and expiry selection against a fixed order book fixture.
- Pre-flight checklist: every individual failure must abort.

Not worth the time:

- End-to-end test infrastructure.
- Mocking the chain.
- Frontend component tests.

The reconciliation script doubles as a test: it rebuilds every position fact from chain state and diffs it against the database. Run it whenever the data is in doubt.

---

## 11. Recommended Build Order

```text
1.  Quote engine, read-only                       Phase 1
2.  Database and migrations                       Phase 2
3.  Burner wallet, funded                         Phase 3.1–3.2
4.  Pre-flight checklist and dry run              Phase 3.3–3.6
5.  First real fill                               Phase 3.7
6.  Result recording and failure paths            Phase 3.8–3.9
7.  Buy a short-dated position for the demo       by 3 September
8.  Settlement scheduler                          Phase 4
9.  API contract, then frontend                   Phase 5
10. Reconciliation script                         Phase 3.10
11. Freeze, video, submission                     Phase 6
12. Options-powered lending                       Phase 7
13. Principal-protected vault                     Phase 8
```

Step 5 is the milestone the submission depends on. Everything before it is reversible. Nothing after it matters if it never happens.

---

## 12. Timeline

```text
29–30 Aug   Phase 1 quote engine, Phase 2 database
31 Aug–1 Sep Phase 3, first real fill
2 Sep       Phase 4 settlement, buy a short-dated position for the demo
2–3 Sep     Phase 5 frontend integration, Phase 7 lending, Phase 8 vault
4 Sep       Freeze. Video, README, submit.
5 Sep       Buffer. Rehearse.
6 Sep       Pitch.
```

Submission is due 5 September but happens on 4 September. The buffer exists because late submissions are not accepted.

---

## 13. Risk Register

```text
First on-chain fill fails or takes days
  Impact: fatal, no working product
  Mitigation: start Phase 3 by 31 August; dry-run everything first

No settled position to show
  Impact: the strongest part of the demo becomes a simulation
  Mitigation: buy a one-day expiry by 3 September

Private key leaked into the public repository
  Impact: funds lost, possible disqualification
  Mitigation: .gitignore verified; git status before every commit

Book has no suitable strike
  Impact: the product looks broken
  Mitigation: disclose the real strike; keep the MVP on ETH

Frontend and backend integrate late
  Impact: nothing works together
  Mitigation: agree the API contract before either side builds

Three products each half-finished
  Impact: fails the first judging criterion for all three
  Mitigation: build in dependency order; each phase has a definition of done
              that must be met before the next begins

Participation rate makes the vault look unattractive
  Impact: weakens the second judging criterion
  Mitigation: frame it as a short-dated product and state the constraint openly;
              the guarantee is the product, not the upside

Frontend and backend on different laptops on demo day
  Impact: nothing runs
  Mitigation: decide the demo machine early and rehearse on it

Venue wifi fails
  Impact: local demo survives, RPC calls do not
  Mitigation: cache a recent quote; the dashboard must render from the database alone

Team over-builds and finishes nothing
  Impact: fails the first judging criterion
  Mitigation: freeze on 4 September regardless of state
```

---

## 14. Out of Scope

Recorded so nobody quietly starts one of these:

- RFQ flow. It depends on a market maker responding in real time, which is an unacceptable demo risk.
- Non-custodial wallet integration.
- Hosted deployment.
- Writing our own smart contracts. Mainnet deployment costs real gas and there is no testnet to deploy to.
- A live yield source for the vault. The yield portion is simulated and labelled; integrating Aave or tokenised treasuries is out of scope.
- Rolling, cancelling or selling protection before expiry.
- Notifications.
- Multi-asset portfolios.
- Authentication beyond what the demo needs.

If one of these becomes necessary, propose it and explain why. Do not build it and ask afterwards.

---

## 15. First Milestone Checklist

Before anything else is considered started:

```text
[ ] Repository restructured into backend/ and frontend/
[ ] Every existing script still runs after the move
[ ] .env absent from git status
[ ] node_modules absent from git status
[ ] Shared Thetanuts client module, no script constructing its own
[ ] Quote engine prints a correct ETH quote from live data
```

The last line is Phase 1 complete. Nothing about money has happened yet, and the core of the product already works.

---

## 16. Beginner Rule

If a step is not understood, stop and ask before running it.

This applies with particular force to anything in Phase 3. A misunderstood command in Phase 1 prints the wrong number. A misunderstood command in Phase 3 spends money on an option that cannot be cancelled, and the week has no room for that.

Two habits worth keeping:

```text
Run git status before every commit.
Read what a command does before running it, especially if it was pasted.
```

Neither costs more than a few seconds. Both prevent the failures that end weeks.
