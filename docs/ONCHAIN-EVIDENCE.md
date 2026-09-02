# On-chain evidence

Permanent record of transactions this project has sent on Base mainnet.
**Do not edit an entry once written.** Add new ones below.

Wallet (burner, custodial — BR-13, BR-30):
`0x4fB77837bf2A0B86D167627Ded2E894f92F15127`

---

## 1. First protection purchased — 30 Aug 2026

**This is the single strongest piece of evidence in the submission.** It is what
"does it work" is answered with.

| | |
|---|---|
| **BaseScan** | https://basescan.org/tx/0x6420c71c0ec21eec902df711086c33a23559102d2fd1ead17a9436865be10de0 |
| Transaction | `0x6420c71c0ec21eec902df711086c33a23559102d2fd1ead17a9436865be10de0` |
| Block | 50670079 |
| Option contract | `0xa609b6fbcf89dfb9bc671cfaa519d4ad63404329` |
| Asset | ETH |
| Type | Vanilla put — **we hold the buyer side** |
| Strike (floor) | $2,320 |
| Expiry | 2026-09-02 08:00 UTC |
| Contracts | 0.139999 (protecting ~0.14 ETH) |
| Total paid | 0.495926 USDC — 0.433936 premium + 0.061990 protocol fee |
| Gas used | 646,060 |
| Position row | `ccdcbf28-125b-4d38-9a28-353ef1b9ed43` |

**Proof we are the buyer, not the seller (BR-1).** USDC movements in the fill:

```
0.433936 USDC   our wallet -> 0xEcda1D00…  the maker      (premium)
0.061990 USDC   our wallet -> 0x1bDff855…  OptionBook     (fee)
324.797680 USDC 0xEcda1D00… -> 0x1bDff855… -> the option  (the MAKER's collateral)
```

`324.797680 = 0.14 × 2320`. The counterparty posted the collateral; we paid a
premium. The indexer agrees: `"side": "buyer"`, `"buyer": 0x4fB77837…`,
`"seller": 0xEcda1D00…`.

## 2. USDC approval — 30 Aug 2026

| | |
|---|---|
| BaseScan | https://basescan.org/tx/0xec836267a62d5699eaf9ce382252bb8efcdad41d9680b4462ce0ddc4171c75d2 |
| Block | 50669494 |
| What | Approved exactly 3 USDC to the OptionBook. Never MaxUint256 (BR-12) |

---

## 3. Settlement — TO BE FILLED IN 2 Sep 2026, after 16:00 MYT

The position above expires **2026-09-02 08:00 UTC = 16:00 Malaysia time**.

Run the sweep that afternoon (or have the daemon running):

```
cd backend && node --env-file-if-exists=../.env scripts/settle.js --confirm
```

Then record here, and do not edit afterwards:

- final status — `settled` or `expired_worthless`
- settlement price the protocol used, and which source reported it
- payout in USDC
- the full event trail: created → broadcast → confirmed → settled
- the option contract's state on BaseScan

**Why this matters more than the purchase.** A position that completed the whole
lifecycle — bought on-chain, held to expiry, settled by the protocol, recorded in
our database — is the strongest artefact this project will produce. It answers
"does it work" with a chain of evidence rather than a claim. It exists for exactly
one moment; if nobody writes it down that afternoon, the demo shows a screenshot
of a position that is merely active.

**If the payout is zero** (ETH finished above $2,320) that is a *success*, not a
failure: the protection was not needed. Record it as such — US-7 exists because a
user who sees "expired worthless" without explanation assumes something broke.

---

## 4. Options-powered lending — 31 Aug 2026

**A USDC loan whose size IS the option's strike times its contract count.** Not a
loan-to-value ratio we chose; a number three independent sources agree on.

### The backing put

| | |
|---|---|
| **BaseScan** | https://basescan.org/tx/0x637242cabaf89a69cea5d240da3ef4ab78b380df1292f87b6df8a58a33a0fd94 |
| Option contract | `0xaa77372360c2414198080dc837df680674b6e7e1` |
| Strike (floor) | $2,300 |
| Contracts | **0.001999** |
| Expiry | 2026-09-03 08:00 UTC |
| Premium paid | 0.022186 USDC |
| Position row | `efa8d071-444c-46f5-a0e6-8b7915f6c778` |

### The disbursement

| | |
|---|---|
| **BaseScan** | https://basescan.org/tx/0x29165d16cb9ad2a38f7fa875c0d436464cd9a91090e3f6699074be134fa0201b |
| Block | 50699221 |
| Amount | **4.597700 USDC** |
| From | `0x4fB77837bf2A0B86D167627Ded2E894f92F15127` (the app's wallet) |
| To | `0xc169c7c000cAA28807Ab2585D707C7A6457d718E` |
| Loan row | `740a417d-3393-444f-bc09-6979d2315971` |
| Due | 2026-09-03 08:00 UTC — **the put's expiry** (BR-48) |

### Why the number is provable by inspection

```
credit limit = strike x contracts = 2300 x 0.001999 = 4.5977 USDC
```

**Both figures come from the option contract, not from our quote.** Read
`0xaa77372360c2414198080dc837df680674b6e7e1` and you get strike `230000000000`
(8 decimals) and `numContracts` `1999` (6 decimals). Multiply them and you have the
amount transferred, to the cent.

Three independent sources agree on 4.5977:

1. the option contract's strike x contracts
2. **the collateral the counterparty locked** — 4.597700 USDC
3. the USDC actually transferred on chain

There is no ratio anywhere in the derivation. `backend/src/lending/credit.js`
contains no configurable factor, and the database refuses a `credit_limit` that
does not equal strike x contracts — a loan-to-value ratio cannot be inserted.

### The row was corrected from chain, and that is part of the evidence

Our database first recorded **2000** contracts, the count we quoted. The chain says
**1999**. The post-fill read that should have caught this returned null: the option
contract was not yet queryable milliseconds after its creation confirmed.

The row was corrected to 1999 through `transitionPosition`, so the event trail
records the quoted count, the on-chain count, the exact read that produced it, and
why the first read failed.

This is worth stating rather than hiding. The credit limit is $4.5977 and not
$4.6000 **because the number was taken from the chain rather than asserted from our
own quote** — which is precisely the claim the artefact exists to make. A figure
that needed a footnote would not be provable by inspection.

### What is real and what is not

```
the put              real, on Base mainnet, buyer side
the credit limit     derived from that put, not configured
the USDC transfer    real, 4.597700 moved between two addresses
the recipient        an address we control, standing in for a user address -
                     the prototype is custodial and users have no wallets (BR-32)
repayment            NOT built. Roadmap.
```

Wallet after: **4.773852 USDC**, 0.00444069 ETH.

---

## Settlement runs — two afternoons, local time

**Read these in MYT.** Whoever runs them is reading a local clock, and "2 Sep" gets
remembered as "sometime Wednesday".

| When (MYT) | What settles | Command |
|---|---|---|
| **Wed 2 Sep, 16:00** | The protection position `ccdcbf28…`, $2,320 floor | `cd backend && node --env-file-if-exists=../.env scripts/settle.js --confirm` |
| **Thu 3 Sep, 16:00** | The loan `740a417d…` and its backing put `efa8d071…`, $2,300 floor | same command |

(08:00 UTC on both days.)

Two separate afternoons is deliberate and better than one: each artefact gets its
own run and its own record, rather than three things landing inside an hour.

After each run, record the outcome in the section above it. **A zero payout is a
success, not a failure** — it means the price finished above the floor and the
protection was not needed (US-7). Record it that way, or it reads as a fault.

---

## 5. Two-day principal protection — 1 Sep 2026

**A real call, bought on Base, funding the upside share of a principal-protected
deposit.** The participation rate on screen is computed from the premium actually
paid — a judge who recalculates it gets the same number.

| | |
|---|---|
| **BaseScan** | https://basescan.org/tx/0x7930bc428fbca01749f7d4afae3bceec44123107dd5049cbd075f44196cb47b0 |
| Block | 50701555 |
| Option contract | `0x4634838086ed31e432db1cefa4e3ab19ef60159f` |
| Type | Vanilla **call** — we hold the buyer side (optionType 256) |
| Strike | $2,660 |
| Expiry | 2026-09-03 08:00 UTC (16:00 MYT) |
| Contracts | **0.009347** |
| Total paid | **0.036441 USDC** — 0.031886 premium + 0.004555 protocol fee |
| Vault row | `2dbc767a-1090-4e00-96c3-3552829ec8dc` |
| Position row | `7a7d1153-ff3b-42b4-a7e9-7ef7353959f6` |

### The participation rate, recomputed from the chain

```
premium per contract = 0.036441 / 0.009347       = $3.89868407
exposure             = 0.009347 x $2,471.01 spot = $23.096530
PARTICIPATION        = 23.096530 / 100           = 23.0965%
```

Every input is on chain: `numContracts` and `strike` from the option contract, the
USDC total from the transaction's transfer logs. Nothing is configured — there is
no participation rate in the environment or in code, only in `participationFor()`
as a division (BR-38).

The row was quoted at **23.0986%** and corrected to **23.0965%** after the fill:
the order filled 0.009347 contracts rather than the 0.009348 quoted, and the true
cost includes the protocol fee. Same principle as the loan's 2000 → 1999
correction — the stored number is the one the chain supports.

### What is real and what is not

```
the call             real, on Base mainnet, buyer side
the participation    derived from the real premium paid
the 99.963559 USDC   SIMULATED. No yield source exists (BR-37). It moves nowhere.
the 2.7-day term     real — the longest vanilla call the book carries
maturity flow        NOT built. Roadmap.
```

**Only 0.036441 USDC actually left the wallet.** The "deposit" is a simulated
figure; the option portion is the sole real spend.

**Called what it is.** Two-day principal protection with a small share of the
upside — not a savings vault. Over 2.7 days the yield given up on 100 USDC is
about three cents, so the guarantee protects against a risk that barely exists at
that horizon. The arithmetic is honest and the product it describes is thin; saying
so is better than inviting the question.

Wallet after: **4.737411 USDC**.
---

### The loan was repaid — 1 Sep 2026

**The lending cycle is complete on chain: put bought, funds disbursed, loan
repaid.** Three transactions telling one story.

| | |
|---|---|
| **BaseScan** | https://basescan.org/tx/0x02c37705b14fd86072b76108f0181869680d1998684e5dcea57eb41e069a6a09 |
| From | `0xc169c7c0…` the borrower |
| To | `0x4fB77837…` the lender |
| Owed | **4.599411 USDC** — 4.597700 principal + 0.001710 interest, 5%/yr over 2.7155 days |
| Transferred | **9.198822 USDC** |

#### Why the transfer is 9.198822 and the debt is 4.599411

**The excess is a returned mis-transfer, not interest.** Reading the `from` field
in the operator instruction as "send from here", the operator first sent 4.599411
in the wrong direction, to `0xc1a97f98…`. The return transfer therefore carried
both amounts: the repayment plus the money that should never have moved.

Nothing was lost and no figure in the loan row is affected. The debt was and is
4.599411; the row records that, and the verification checked the transfer against
it rather than against the amount that happened to arrive.

#### Two checks earned themselves on first use

**The wrong-direction transfer was refused.** The mis-sent transaction was offered
for confirmation first and check 5 rejected it: its `Transfer` log ran lender →
borrower, not borrower → lender. The check exists because a hash proves a
transaction happened, not that it was the right one — and it caught a real error
the first time it was asked to.

**"Covers what is owed" rather than "equals what is owed" was the right rule.** An
overpayment completed the loan correctly. Equality would have refused a payment
that was unambiguously sufficient, and the borrower would have been told a correct
transfer was wrong.

#### Who signed it

The repayment was sent by the borrower, not by us. We hold one private key and
deliberately do not hold a second: BR-18 says never commit or log a private key,
and the surest way to honour that is not to have another one to protect. The code
records what is owed, a human sends it, and the code verifies it on chain — so the
row is written before the money moves, exactly as it is for a fill.

#### A limitation this shares with the premium

The borrower address is a second address we control; the prototype has no user
funding path. The 0.00171 USDC of interest was funded by us, exactly as the
premium was. In production the borrower holds their own funds.

#### This loan was written under the OLD credit rule

It was lent **4.5977 — the whole floor** — and then charged interest on top, so it
came due owing 4.599411 against a guarantee of 4.597700. It was under-
collateralised by exactly its own interest from the moment it was written.

BR-39 was revised the same day so the limit reserves the interest it charges
(`floor / (1 + rate × term/365)`), which for this put would have lent 4.595990 and
made principal + interest land exactly on 4.597700. **The new rule prevents the
next loan from having this problem. It does not fix this one, and this one is what
is on chain.**

---
## 6. Browser to chain — 31 Aug 2026

**The only transaction that proves the whole path works.** A quote requested from
the interface, confirmed by a person, filled on Base — with a human round trip in
the middle rather than a script doing both in one breath.

| | |
|---|---|
| **BaseScan** | https://basescan.org/tx/0x64e37010da92270f3ffea4148c50a1b5f57fa831f7a0fbeefcc72332aa07e7ce |
| Option | `0x110cfc45ed90f5c9e9264e286977ce8906c1de29` |
| Type | ETH put, buyer side |
| Floor | $2,340 |
| Expiry | 3 Sep 2026 |
| Block | 50707590 |

### Why the 140.7 seconds matter

```
quoted     2026-08-31T19:26:22.002Z
created    2026-08-31T19:26:22.398Z
broadcast  2026-08-31T19:28:42.743Z   <-- 140.7s after the quote
confirmed  2026-08-31T19:28:50.476Z
```

**The Thetanuts order book re-signs wholesale roughly every 60 seconds.** Measured
across 320 orders on 1 Sep, every signature lived exactly 35.645 seconds —
identical to three decimal places, which is one scheduled event rather than a
distribution of independent lifetimes.

So 140.7 seconds spans at least two full re-signings. The signature quoted to the
user no longer existed by the time the fill was broadcast. **This fill therefore
went through economic order matching — maker, strike, expiry, type and side, all
five or refuse — not through the signature fast path.**

That is the difference between a demo and a product. The three earlier fills
succeeded because `scripts/fill.js` quotes and broadcasts inside six seconds, so
the signature was still current; any flow with a person in the middle was a coin
flip on where in the refresh cycle it landed. Two integration attempts were
refused on exactly that before the matching was fixed.

### What was verified afterwards

The price guard is what makes the longer window safe. Measured across one refresh,
311 of 311 economically identical orders came back, 305 of them at a slightly
different price — median drift 0.515%. Pre-flight check 4 re-verifies the price
against `PRICE_TOLERANCE_PCT` at the moment of the fill, so a re-matched order that
moved too far is refused rather than filled.

**The fill window is only defensible because the price check is real. If check 4
were ever weakened, the clock would have to come back** — which is why BR-8 is two
rules: a 20-second display window for what the user is shown, and a 10-minute
authorisation window for what the operator may execute.

### What is real and what is not

```
the quote            real, from the live order book
the confirmation     real, a person clicking in the browser
the fill             real, on Base mainnet, buyer side
the 140.7 seconds    real, from the position event trail
the balance charged  SIMULATED. Seeded, not deposited (BR-50)
```

---
## 7. The vault, resized so maturity can be real — 1 Sep 2026

**The 100 USDC vault above cannot pay out.** Its maturity would transfer 100 USDC
to the user and the wallet holds 4.66. The figure was never reachable, so a
second, smaller call was bought at a size the wallet can actually return.

| | |
|---|---|
| **BaseScan** | https://basescan.org/tx/0xd7fec53c5595750aff0ed994b6ded292b93c93a12185d8856ce0ef4cc0be70ac |
| Option | `0x12520cfb58433ae7375d7c9371fdfc5a808c023b` |
| Type | Vanilla **call**, buyer side |
| Strike | $2,680 |
| Expiry | 3 Sep 2026 08:00 UTC (16:00 MYT) |
| Contracts | 284 raw (0.000284) |
| Premium | 0.001016 USDC — the real spend |
| Deposit modelled | 3 USDC |
| Participation | **23.5422%** |

### The participation rate is not a constant

Quoted three times over one afternoon at the same 3 USDC deposit:

```
24.17%   premium 3.50898166/contract
22.99%   premium 3.67154695/contract
23.54%   premium 3.57885579/contract   <-- what actually filled
```

Same size, same strike, same expiry. The rate moves because the premium moves,
which is what BR-38 requires — it is computed from what was really paid, never
configured. **A participation rate that stayed the same across those three quotes
would be evidence it was hardcoded.**

### The quote said 285 contracts, the chain says 284

Recorded as 284. A fill executes by USDC amount, so the contract count lands
within a hair of the quote; the row takes the chain's number, not the quote's,
through `pickRecordedContracts()`. Not a scale error — a 10^12-style difference
would have been refused outright.

### The 100 USDC vault is superseded, not deleted

Its call `0x7930bc42…` is real, is held, and will settle on 3 Sep like any other.
What it cannot do is pay its modelled principal. Both rows sit at `active`
because the schema has no `superseded` status yet — that arrives with the
maturity work. **The row stays.** Deleting the record of a real on-chain purchase
to tidy a demo would be exactly the kind of gap the database exists to prevent.
