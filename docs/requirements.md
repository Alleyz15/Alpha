# Requirements — User Stories, Use Cases & Business Rules

> **Agreed baseline.** The scope decisions in §0 are settled; changing one means revisiting everything below.
> The SDK appendix is verified against code, not documentation.

---

## 0. Scope assumption (check this first)

This document assumes we're building **one product with two entry points**:

| Entry point | User says | Comes from |
|---|---|---|
| **A. Percentage** | "Protect my ETH from dropping more than 20%" | Idea 2 |
| **B. Goal** | "I need at least $2,000 on 1 November" | Idea 4 |

Both resolve to the same underlying action: **buy a put on the user's behalf, hold it, settle it at expiry.** The difference is only how we derive the strike and expiry from what the user typed.

**If the team wants a different product, stop here** — everything below changes.

### ✅ Decided: custodial, single burner wallet

| Model | How it works | Effort | Demo risk |
|---|---|---|---|
| **A. Custodial — CHOSEN** | App operates one burner wallet. User "buys protection", backend executes with app funds. | Low — no wallet integration | Low |
| B. Non-custodial | User connects their own wallet and signs each fill. | High — wallet connect, approvals, signing UX | High |

**Rationale:** judging criterion #1 is "does it work". Model A is far more likely to be running on demo day, and it lets a judge try the product on stage without installing a wallet — which reinforces our own pitch about removing barriers. Thetanuts' own workshop guidance (burner wallet, trade small) assumes this shape too.

**Wallet operator: the backend developer.** The burner wallet and its private key are their responsibility. This means:

- The key lives only in the local `.env`. Nothing is hosted, so there is no platform panel. It is never shared in chat, never committed, never screenshotted.
- Only the backend signs. No other component of the system ever touches the key.
- The wallet holds only what a demo needs — a few USDC plus cents of ETH for gas. It is not a treasury.
- If the key is ever exposed, the response is to move the funds and generate a new wallet, not to hope nobody noticed.

**Say this out loud in the pitch.** Custody is a real limitation, and judges will spot it:

> This demo is custodial so you can try it right now without a wallet. Production would be non-custodial — the options logic underneath is identical, only the signer changes.

Owning the limitation reads as engineering judgement. Hiding it and getting caught in Q&A reads as not having thought about it.

### ✅ Decided: OptionBook only, no RFQ

The MVP fills existing signed orders from the book (`optionBook.fillOrder`). It does **not** use the RFQ flow.

**Rationale:** RFQ is a multi-step negotiation — `requestForQuotation` → `makeOfferForQuotation` → `revealOffer` → `settleQuotation`, with a reveal window and encrypted offers. It depends on a market maker responding in real time. Waiting on a stranger's response in front of judges is an unacceptable demo risk.

**Consequence:** we can only offer the strikes and expiries that already exist on the book. The UI must therefore state the actual protection level honestly (see BR-6) rather than pretending the user got exactly what they asked for.

RFQ belongs on the "what's next" slide, as the thing that would let users name any protection level they want.

---

## 1. Actors

| Actor | Description |
|---|---|
| **User** | Someone holding crypto who wants downside protection. Assumed to know nothing about options. |
| **System** | Our app — frontend, backend, database |
| **Scheduler** | Backend job that reads settlement results for expired positions and records them |
| **Thetanuts** | External on-chain options protocol on Base mainnet (OptionBook; RFQ is out of scope) |
| **Base** | The blockchain the protocol runs on |

---

## 2. User Stories

### Epic A — Buying protection

**US-1 — See what protection costs**
As a user holding crypto, I want to see what it costs to protect against a drop, so I can decide whether it's worth it.
*Acceptance:* Given I've chosen an asset, amount and protection level, when I request a quote, then I see a price in USDC and a plain-language summary — with no options jargon anywhere on screen.

**US-2 — Buy protection in one action**
As a user, I want to buy protection by confirming once, so I don't have to understand strikes or expiries.
*Acceptance:* Given a quote is displayed, when I confirm, then the system fills the order on-chain and shows me a confirmation with a transaction link.

**US-3 — Express protection as a life goal**
As someone paid in crypto, I want to say "I need $2,000 by 1 November" and have the system work out what to buy.
*Acceptance:* Given I enter an amount and a date, when I request a quote, then the system derives a strike and expiry and shows me the cost — without asking me for either.

**US-4 — Understand the trade-off before paying**
As a user, I want to see what happens in both good and bad scenarios, so I know what I'm buying.
*Acceptance:* Before confirming, I see at minimum: what I pay, my protected floor, and what happens if the price rises instead.

### Epic B — Holding and settling

**US-5 — See my active protection**
As a user, I want to see what protection I currently hold and when it expires.
*Acceptance:* Given I have active positions, when I open the dashboard, then I see asset, protected floor, expiry date, and current status.

**US-6 — Get paid automatically**
As a user, I want protection to pay out without me doing anything.
*Acceptance:* Given a position expires below its protected floor, when the scheduler runs, then it settles automatically and my position shows as settled with the payout amount.

**US-7 — Know when nothing happened**
As a user, I want to be told when protection expired unused.
*Acceptance:* Given a position expires above its floor, when the scheduler runs, then the position shows as expired with a clear "not needed this time" explanation.

### Epic C — Trust

**US-8 — Verify it's real**
As a sceptical user (or judge), I want to see the on-chain transaction, so I know this isn't a mockup.
*Acceptance:* Every position shows a BaseScan link to the actual transaction.

**US-9 — Know my maximum loss**
As a risk-averse user, I want to see clearly that the premium is the most I can lose.
*Acceptance:* The confirmation screen states the maximum loss explicitly, in currency, before I commit.

### Stretch (only if core is finished)

- **US-10** — Roll protection forward before it expires
- **US-11** — Cancel/sell protection back before expiry
- **US-12** — Notification when protection is about to expire

---

## 3. Use Cases

### UC-0 — Establish a protected balance (simulated)

| | |
|---|---|
| **Actor** | System |
| **Goal** | Give each demo user a holding that protection can refer to |
| **Precondition** | Demo users seeded |
| **Postcondition** | Each user has a credited balance per asset |

**This is a prototype. Users never transfer assets to us.**

Protection has to protect *something*. Without a position to point at, a put is just
a financial bet — and this product exists to be the opposite of that. So the
prototype seeds each demo user with a balance, notionally backed by assets already
in the operating wallet.

**Flow**

1. Demo users are seeded with a balance per asset
2. The interface states that the holding is simulated
3. Quote size is capped by that balance (BR-49)
4. Everything downstream is real

**What is real and what is not**

```
Balance / deposit    simulated     prototype scope
Quote                real          live order book
Option purchase      real          Base mainnet, BaseScan verifiable
Settlement           real          protocol-driven
```

**Exception**

- **E1 — Requested size exceeds the credited balance:** refuse to quote. Do not
  silently reduce the size; the user asked for something we cannot honestly offer.

---

### UC-1 — Quote protection

| | |
|---|---|
| **Actor** | User |
| **Goal** | See the cost of protecting a holding |
| **Trigger** | User submits the protection form |
| **Precondition** | Thetanuts order book reachable; price feed available |
| **Postcondition** | A quote is displayed and cached, or a clear reason why none is available |

**Main flow**

1. User selects asset. The book carries ETH, BTC, SOL, XRP, BNB and AVAX; **the MVP UI exposes ETH only** because long-dated liquidity is thin once split across six underlyings. The code must not hardcode ETH.
2. User enters amount held
3. User specifies protection, either:
   - **3a.** protection level as a percentage (e.g. "no more than 20% down"), or
   - **3b.** a target value and a date (e.g. "$2,000 by 1 Nov")
4. System fetches the current price from `getMarketData()`
5. System derives target strike and target expiry from the input (see BR-4, BR-5)
6. System fetches live orders via `fetchOrders()`
7. System filters to puts on the chosen asset, then selects the closest available strike and expiry (BR-6)
8. System calculates total premium = unit premium × contracts (BR-7)
9. System displays: cost, protected floor, expiry date, maximum loss, and a scenario summary
10. Quote is cached with a validity window (BR-8)

**Alternate flows**

- **A1 — No order close enough to the requested strike:** the system offers the nearest available strike and states the real protection level plainly ("closest available protects you below $1,900, not $1,946"). RFQ is **out of scope** — see §0.
- **A2 — No expiry on or after the requested date:** the request is **refused**, and the shortfall is stated precisely: "the longest available is 26 days, you asked for 62." Never offer an earlier expiry as a substitute. Protection that ends before the date it is needed is worthless at the only moment it matters (BR-6, and the same reasoning as BR-48). An expiry *later* than requested is acceptable and is disclosed.
- **A3 — Requested size exceeds `availableAmount`:** system offers the maximum fillable size, or splits across orders (stretch)

**Exceptions**

- **E1 — RPC unreachable:** show a connection error; never show a stale price as if it were current
- **E2 — Asset has no options on the book:** disable that asset in the UI rather than failing after submission

---

### UC-2 — Buy protection

| | |
|---|---|
| **Actor** | User, System, Thetanuts |
| **Goal** | Execute an on-chain purchase of the quoted put |
| **Trigger** | User confirms a quote |
| **Precondition** | Valid unexpired quote; burner wallet funded |
| **Postcondition** | Position recorded in DB with a transaction hash, or a failure with no partial state |

**Main flow**

1. User reviews the confirmation screen (cost, floor, expiry, max loss)
2. User confirms
3. System re-validates the quote is still fresh (BR-8)
4. System re-checks the order is still on the book and the price hasn't moved beyond tolerance (BR-9)
5. System checks the burner wallet has sufficient USDC and gas (BR-10)
6. System writes a `pending` position row to the database **before** submitting
7. System submits the fill to Thetanuts
8. System waits for confirmation
9. System updates the position to `active` with transaction hash, actual fill price, strike and expiry
10. System displays confirmation with a BaseScan link

**Alternate flows**

- **A1 — Quote expired:** re-quote and require the user to confirm the new price
- **A2 — Price moved beyond tolerance:** abort, show old vs new price, require re-confirmation

**Exceptions**

- **E1 — Transaction reverts:** mark position `failed`, surface the reason, charge nothing
- **E2 — Transaction times out with unknown state:** mark `pending_verification`; the scheduler reconciles against chain state (BR-14). **Never** assume failure and retry blindly — that risks a double buy.
- **E3 — Insufficient wallet balance:** block before submitting; show a clear message

---

### UC-3 — Record settlement at expiry

| | |
|---|---|
| **Actor** | Scheduler (automatic — no user action) |
| **Goal** | Reflect on-chain settlement results in our database |
| **Trigger** | Scheduled job |
| **Postcondition** | Every expired position is `settled` or `expired_worthless` |

> ✅ **Confirmed from the SDK type definitions:** settlement is **fully automatic**. The protocol settles via the factory's `notifyTradeSettled` callback and pays the buyer without any action from us. `client.option.payout()` is **deprecated and throws `INVALID_PARAMS`** — it no longer exists on the r12 deployment.
>
> **This use case sends no transactions. No signing, no gas.** It only reads chain state and writes to our own database.

**Main flow**

1. Scheduler runs on interval (BR-11)
2. Query DB for `active` positions with expiry ≤ now
3. For each position, call `client.option.getFullOptionInfo(optionAddress)` and check `.isSettled`
4. If not yet settled on-chain, leave as `active` and retry next run (BR-27)
5. If settled, read the payout amount with `client.option.calculatePayout(optionAddress, settlementPrice)` (view call)
6. **If payout > 0:** set status `settled`, record payout amount and settlement price
7. **If payout = 0:** set status `expired_worthless`, record zero payout
8. Update the user-facing dashboard

**Alternate flows**

- **A1 — Event-driven instead of polling:** `client.events.getOptionPayoutEvents(optionAddress)` returns the actual `OptionPayout` events, and `client.ws.subscribePositions` pushes position updates live. Either is a cleaner source of truth than polling, and the WebSocket version makes the dashboard update in real time. Polling is the safer fallback — implement polling first.

**Exceptions**

- **E1 — Settlement failed on-chain:** `client.events.getOptionSettlementFailedEvents(optionAddress)` exists, so automatic settlement is **not** guaranteed. Positions stuck unsettled past a threshold must be flagged for manual review, never silently dropped (BR-27)
- **E2 — Scheduler was down over an expiry:** on startup, process all overdue positions before handling new ones. Because settlement is automatic, no payout is lost by being late — only our records are stale.

---

### UC-4 — View positions

| | |
|---|---|
| **Actor** | User |
| **Goal** | See active and historical protection |

**Main flow**

1. User opens dashboard
2. System queries positions for that user
3. System displays each: asset, amount, protected floor, expiry, status, premium paid, payout (if settled), BaseScan link
4. Active positions show days remaining and current price relative to floor

---

## 4. Business Rules

### Product philosophy

| ID | Rule |
|---|---|
| **BR-1** | The system **only ever buys options on behalf of users. It never sells them.** Buyers have capped losses; sellers have near-unlimited losses. Retail users must never be placed on the seller side. |
| **BR-2** | **Two different maximum losses exist and must never be conflated.** The loss on the *protection itself* is capped at the premium. The loss on the *combined position* (asset plus protection) is `(spot − strike) + premium` — the user still carries every point of decline down to the floor. Confirmation screens state the combined figure in currency, because that is what the user actually stands to lose. |
| **BR-3** | Options terminology (strike, IV, theta, delta, premium, put, call) must **never** appear in the user-facing UI. Internal code and admin views may use it freely. |

### Deriving the option

| ID | Rule |
|---|---|
| **BR-4** | For percentage-based input: `target strike = current price × (1 − protection%)`. Default protection level is 20%. |
| **BR-5** | For goal-based input: `target strike = target value ÷ amount held`. Target expiry = the user's stated date. |
| **BR-6** | Because the book only offers discrete strikes and expiries, the system selects the **closest available** and **must disclose the difference** when the gap is material. Expiry must be **on or after** the user's target date — never earlier. |
| **BR-7** | `strikePrice` and `price` from the SDK use **8 decimals** (divide by 1e8). USDC uses 6. Getting this wrong makes premiums appear 100× off. |

#### Derived figures — the formulas

These are computed from the order actually filled, then stored (BR-40). Never configured, never recomputed on read.

**Credit limit (Phase 7, BR-39)**

```
credit_limit = strike × num_contracts
```

Taken directly from the put that was bought. No haircut, no buffer — that is the entire point. A conventional lender discounts because it has no floor and relies on liquidation. We have a floor, so the limit is the floor.

Worked example:

```
Collateral       1 ETH, spot 1000
Put filled       strike 790, 1 contract
credit_limit     790 × 1 = 790 USDC
```

**Participation rate (Phase 8, BR-38)**

```
1.  yield_portion  = principal ÷ (1 + annual_rate × days / 365)
    option_portion = principal − yield_portion

2.  exposure = option_portion ÷ premium_per_contract × contract_size

3.  participation_rate = exposure ÷ principal
```

Step 1 works backwards from the guarantee: not "95 grows into 100", but "to reach exactly 100, how much must be set aside today". This makes the principal protection exact rather than approximate.

Worked example:

```
Deposit          100 USDC, 62 days, simulated 5% annual
yield_portion    100 ÷ (1 + 0.05 × 62/365) = 99.16
option_portion   100 − 99.16 = 0.84

Book quote       62-day ATM ETH call, 0.07 USDC per contract, 1 USDC exposure each
exposure         0.84 ÷ 0.07 × 1 = 12 USDC

participation    12 ÷ 100 = 12%
```

The premium comes from the live book, so the rate moves with the market. It is fixed for a given deposit at the moment of purchase and never changes afterwards.

### Execution safety

| ID | Rule |
|---|---|
| **BR-8** | Quotes are valid for a fixed window (suggest 60 seconds). Expired quotes must be refreshed and re-confirmed, never silently executed. |
| **BR-9** | If the fill price moved more than a set tolerance (suggest 5%) from the quote, abort and require re-confirmation. |
| **BR-10** | Every purchase is preceded by a balance check for both USDC and gas. |
| **BR-11** | Scheduler interval must be materially shorter than the shortest supported expiry. Given 1-day expiries exist, hourly at minimum. |
| **BR-27** | Automatic settlement is not guaranteed — the protocol emits `OptionSettlementFailed` events. Any position still unsettled beyond a threshold after expiry must be flagged for manual review, never silently dropped. |
| **BR-28** | Every state-changing call must be dry-run first with the SDK's `callStatic*` variant (`callStaticFillOrder`, `callStaticApprove`). Broadcasting a transaction that was never simulated wastes gas on guaranteed reverts. |
| **BR-29** | Use the SDK's own validation helpers rather than hand-rolling equivalents: `validateBuySlippage`, `validateOrderExpiry`, `validateFillSize`. They encode the protocol's actual rules; ours would only approximate them. |
| **BR-12** | Token approvals must be for the **exact amount required**, never `MaxUint256`. |
| **BR-13** | All trading uses a dedicated **burner wallet** holding only what's needed: a few USDC plus cents of ETH for gas. |
| **BR-30** | The burner wallet key exists in exactly one place: the local `.env`. Nowhere else — not in chat, not in the repo, not in a screenshot. |
| **BR-31** | Because the system is custodial, every position row must record which user it belongs to. On-chain the wallet owns everything; only our database knows whose protection is whose. This mapping is the product's core record and must never be lost or ambiguous. |
| **BR-32** | The custodial arrangement must be disclosed in the UI and in the pitch, not buried. Users are trusting us with funds; saying so is the minimum. |
| **BR-33** | A hard per-fill premium cap is enforced in code. A misplaced decimal must be impossible to broadcast, not merely unlikely. |
| **BR-34** | A hard daily fill count cap is enforced in code. A retry loop must not be able to drain the wallet. |
| **BR-35** | On-chain data is a rebuildable cache; `positions.user_id` is not. Verify Supabase backups are actually running. |
| **BR-36** | A reconciliation script must be able to rebuild every position fact from chain state and diff it against the database. |
| **BR-37** | Any simulated component must be labelled as simulated in the interface, at the point where the user sees the number. Demo simplifications are acceptable; presenting them as real is not. |
| **BR-38** | A principal-protected product's participation rate is calculated from the actual premium paid and the exposure obtained, never hardcoded, and is displayed before the user commits. |
| **BR-39** | A loan's credit limit is derived from the backing option's strike. It is never a fixed loan-to-value ratio — the derivation is the product's entire claim, and a hardcoded ratio would make that claim false. |
| **BR-41** | Protection tiers are **derived from the strikes actually available at the chosen expiry** — normally three (highest, middle, lowest below spot), with the middle preselected. Never a hardcoded percentage list, never a slider. If fewer than three strikes exist below spot, show fewer tiers rather than padding the list. Verified on the live book: a 20% floor on ETH is only deliverable at the +27 day expiry; short tenors top out near 10–15%. |
| **BR-44** | Every option shown must be fillable at the moment it is shown. The interface never offers a protection level the book cannot deliver, which makes BR-6's disclosure a safety net rather than a routine occurrence. |
| **BR-45** | **Settlement pays USDC, not fiat.** Never describe protection in AUD, MYR or any local currency. "You will have at least 2,000 AUD" is a promise we cannot keep — the payout is USDC and the FX rate on the settlement date is outside our control. Say "at least 2,000 USDC" and, where a fiat goal motivated the purchase, state plainly that the exchange rate is not covered. |
| **BR-46** | **Never imply continuous protection.** Options here are European: nothing pays out before expiry, no matter how far the price falls in between. Copy says "at expiry, if the price is below your floor, you receive the difference" — never "your assets will not go below X for 30 days". |
| **BR-47** | Never promise that settlement will succeed. The protocol emits `OptionSettlementFailed` events. Copy says results are synced once the protocol settles, and that anomalies are flagged for review. |
| **BR-49** | Protection is only quoted against a balance the system holds a record of, and never exceeds it. A larger position would be a directional bet dressed as insurance — the exact thing this product exists to avoid. |
| **BR-50** | This is a prototype. There is no user deposit flow and users never transfer assets to us. Balances are seeded. Do not build a deposit path; if one becomes necessary, propose it rather than assuming. |
| **BR-51** | The boundary between simulated and real must be stated wherever a user or a judge can see it (BR-37). Balances are simulated; quotes, fills and settlement are real and verifiable on BaseScan. Blurring the two is worse than either alone. |
| **BR-52** | Expiry availability is measured against the **buyable** book, not the raw book. Orders that exist but sit on the forbidden side do not count as liquidity. As of 30 Aug the raw book carries a +62 day expiry but none of it is buyable — the longest protection we can actually deliver is ~26 days. |
| **BR-48** | **A loan's maturity must equal the expiry of the put backing it.** The collateral floor only exists at expiry — before that, the put's market value is not its strike. A loan that can come due earlier than its protection has no floor at the moment it matters, and the product's central claim collapses. |
| **BR-42** | No user-facing screen offers a sell action on an option. Buyers have capped losses; sellers do not. If a second action is needed, it is borrowing or depositing — both keep the user on the buy side (BR-1). |
| **BR-43** | A protection level is a floor, not a guarantee against all loss. Screens must make clear that movement above the floor is carried by the user, or someone who drops 10% under a 20% floor will ask why nothing paid out. |
| **BR-40** | Derived figures are computed once, at the moment of purchase, from the order actually filled — then stored on the row. They are never recomputed on read. A number shown to a user must always be traceable to the row that produced it. |
| **BR-14** | Every write to the chain must be recorded in the database **before** submission, so an interrupted transaction leaves a traceable record rather than a silent gap. |
| **BR-15** | Trade sizes stay minimal (1–3 USDC per fill). Thetanuts stated a 1 USDC fill scores identically to a 100 USDC fill. |

### Data & security

| ID | Rule |
|---|---|
| **BR-16** | Row Level Security must be enabled on every Supabase table. Our backend uses the secret key, which bypasses RLS by design — but RLS must still be on, so that a future change (or a mistake) that exposes a publishable key doesn't leave the database world-readable. |
| **BR-17** | The Supabase **secret key** (`sb_secret_...`) and the wallet private key are **server-side only** and must never be prefixed `VITE_` — that prefix bundles a variable into the browser. Supabase's new key format also rejects secret keys sent from something that looks like a browser, but do not rely on that as the only defence. |
| **BR-18** | No secret is ever committed. `.env` stays gitignored; the repo is public and git history is permanent. |
| **BR-19** | Position records are immutable once settled — corrections are new rows, not edits. |

### Competition constraints

| ID | Rule |
|---|---|
| **BR-20** | Base mainnet, chainId 8453, only. Thetanuts has no testnet. |
| **BR-21** | The Thetanuts calls must be load-bearing: if the product would behave identically with them stubbed out, it fails Track 01's one hard rule. |
| **BR-22** | All code written between 26 Aug and 5 Sep 2026. Commit timestamps will be inspected. |
| **BR-23** | Every AI tool used must be declared in the submission. |

---

## 5. Traceability

| User story | Use case | Key rules |
|---|---|---|
| US-1 Quote | UC-0, UC-1 | BR-3, BR-4, BR-6, BR-7, BR-49 |
| US-2 Buy | UC-2 | BR-8, BR-9, BR-10, BR-12, BR-14 |
| US-3 Goal input | UC-1 (3b) | BR-5, BR-6 |
| US-4 Trade-off | UC-1 (9) | BR-2, BR-3 |
| US-5 Dashboard | UC-4 | BR-16, BR-19 |
| US-6 Auto payout | UC-3 | BR-11, BR-14 |
| US-7 Expired unused | UC-3 | BR-2, BR-3 |
| US-8 Verify on-chain | UC-2 (10), UC-4 | BR-14 |
| US-9 Max loss | UC-2 (1) | BR-1, BR-2 |

---

## 6. MVP cut

Judging is **"does it work"** and **"would anyone use it"** — not complexity. Finish this and stop:

**Must have for demo day**
- UC-1 quote (one asset — ETH — is enough)
- UC-2 buy, with at least one real on-chain fill
- UC-4 dashboard showing the position with a BaseScan link
- US-9 max loss stated on screen

**Should have**
- UC-3 settlement, even if the scheduler is run by hand for the demo
- Second entry point (goal-based input) — it's the same backend, mostly UI

**Also being built** (each depends on the buy-and-settle engine above)
- Options-powered lending: credit limit derived from a put's strike (BR-39)
- Principal-protected vault: simulated yield funds a real on-chain call (BR-37, BR-38)

**Won't have**
- Rolling, cancelling, notifications, multi-asset portfolios, non-custodial wallets, our own smart contracts, a live yield source

---

## 7. Questions to resolve before building

1. ✅ **Resolved:** custodial, single burner wallet operated by Alvin. See §0.
2. ✅ **Resolved:** OptionBook only. RFQ is out of scope for the MVP — too much demo risk. See §0.
3. ✅ **Resolved:** settlement is fully automatic via the factory callback. `payout()` is deprecated and throws. UC-3 is read-only — no transaction, no gas.
4. ✅ **Resolved:** fractional fills work. Thetanuts confirmed it, and Shawn has filled with **0.01 USDC**. `calculateNumContracts` round-trips exactly at 6dp granularity, so BR-15's 1–3 USDC sizing is comfortable — 1 USDC buys ~0.1 contracts at the 26-day expiry. `sizePosition()` still takes `minContracts` as a parameter in case a floor appears later; it currently reports rather than refuses.
5. How many demo users to seed — see `DATABASE.md` open questions. There is no login either way.

---

## Appendix — Confirmed SDK surface

Verified by introspecting `client` at runtime and reading `node_modules/@thetanuts-finance/thetanuts-client/dist/index.d.ts`. This is code fact, not documentation — trust it over the docs and over any AI answer.

### Modules on `ThetanutsClient`

`erc20` · `optionBook` · `api` · `optionFactory` · `option` · `ranger` · `events` · `ws` · `utils` · `rfqKeys` · `mmPricing` · `loan` · `collar` · `wheelVault` · `strategyVault`

### Methods we need

**Quoting (UC-1)**
- `api.fetchOrders()` — the live book
- `api.getMarketData()` / `api.getMarketPrices()` — spot prices
- `optionBook.calculateNumContracts()` / `calculateMaxContracts()`
- `utils.calculatePayoutAtPrice(order, numContracts, price)` — pure client-side, ideal for the "what if" scenario display
- `utils.calculateMaxPayout(order, numContracts)`
- `mmPricing.getUniqueExpiries()` — available expiries without parsing the whole book

**Buying (UC-2)**
- `optionBook.previewFillOrder()` — preview before committing
- `optionBook.callStaticFillOrder()` — **simulate without broadcasting** (BR-28)
- `optionBook.fillOrder()` — the real transaction
- `erc20.ensureAllowance()` / `approve()` — exact-amount approvals (BR-12)
- `validateBuySlippage` / `validateOrderExpiry` / `validateFillSize` — exported helpers (BR-29)

**Settlement (UC-3) — all read-only**
- `option.getFullOptionInfo(addr)` → `.isSettled` ← **authoritative settlement status**. `getOptionInfo()` does NOT exist; it was in this appendix from 30 Aug to 1 Sep and reached the README
- `option.calculatePayout(addr, settlementPrice)` — view call, payout amount
- `option.isExpired(addr)` — note `isSettled` is a FIELD on `getFullOptionInfo()`, not a client method
- `events.getOptionPayoutEvents(addr)` — actual payout events
- `events.getOptionSettlementFailedEvents(addr)` — failure monitoring (BR-27)
- ❌ `option.payout(addr)` — **deprecated, throws `INVALID_PARAMS`.** Removed in audit fix TNU-AUDIT-0046. Do not call it.

**Dashboard (UC-4)**
- `api.getUserPositionsFromIndexer()` — positions by wallet
- `api.getUserHistoryFromIndexer()`
- `ws.subscribePositions()` / `subscribePrices()` — live updates without polling

### Decimals

- `strikePrice`, `price`, settlement prices: **8 decimals**
- USDC / collateral: **6 decimals**
- `numContracts` on an Order: **6 decimals** — verified against `.d.ts:758` and confirmed arithmetically against the live book (`numContracts × price == availableAmount`, exact at 6dp, off by 10¹² at 18dp)
- ⚠️ `utils.calculatePayout`'s doc example implies **18 decimals** for its own `numContracts` parameter. Whether the payout helpers really use a different scale than the order struct is **unverified** — check empirically before passing an order's value into one, because the mismatch is a 10¹² error that does not throw
- `availableAmount` / `maxCollateralUsable`: **6 decimals**, USDC collateral — not a contract count
- Helpers: `utils.fromStrikeDecimals`, `fromUsdcDecimals`, `fromPriceDecimals`, `toBigInt`, `fromBigInt`

### Relevant to the deprioritised Idea 1

`client.loan` and `client.collar` expose option-backed lending methods — `requestLoan`, `acceptOffer`, `lend`, `isOptionITM`, `estimateCollar`, `walkAwayCollar`.

**Verified 29 Aug 2026: neither is live on Base.** `client.collar.isDeployed()` returns `false` and `client.loan.getLendingOpportunities()` returns an empty array. The interfaces exist; the backend does not. So option-collateralised lending is **not** a ready-made SDK feature — it would have to be built. See `IDEA.md` Idea 1 for the custodial approach that avoids writing contracts.