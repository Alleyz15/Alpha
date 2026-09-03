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

## 3. Settlement — done, 2 and 3 Sep 2026

**This section is complete. The results are in [section 8](#8-maturity--the-deposit-returned-whole-3-sep-2026),
which records both afternoons together with the maturity transfer they led to.**

Summary, so this section stands alone:

| When | Positions | Settlement price | Outcome |
|---|---|---|---|
| 2 Sep | `ccdcbf28` | $2,421.92256872 | `expired_worthless`, payout 0 |
| 3 Sep | four | $2,403.45858228 | `expired_worthless`, payout 0 |

All five read the price from `getTWAP` and all five matched their recorded
contract counts. **Every payout was zero, and every one of them was correct** —
ETH finished above both put strikes and below both call strikes. See section 8
for why a zero is the promise working rather than a failure.

The original checklist for this section is kept below, because what it asked for
is what section 8 records:

- final status — `settled` or `expired_worthless`
- settlement price the protocol used, and which source reported it
- payout in USDC
- the full event trail: created → broadcast → confirmed → settled
- the option contract's state on BaseScan

**Why this mattered more than the purchase.** A position that completed the whole
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

---

## 8. Maturity — the deposit returned whole, 3 Sep 2026

**Transaction:** [`0x72cb94ba…`](https://basescan.org/tx/0x72cb94ba1260e0dab6576f05ef2bf0de672cbc2da4e0d597c5c8df16aa4ab6c5)

```
status       1 (success)
block        50819046, 2026-09-03T09:23:59Z
from         0x4fB77837bf2A0B86D167627Ded2E894f92F15127   operator wallet
to           0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913   USDC
Transfer     operator -> 0xc169c7c0…   3.000000 USDC
gasUsed      45047 of 54512
```

Balances at the block boundary, read from chain rather than from the script's
own report:

| | block 50819045 | block 50819046 | delta |
|---|---|---|---|
| operator | 9.257193 | 6.257193 | **−3.000000** |
| recipient | 0.000380 | 3.000380 | **+3.000000** |

**Principal returned: 3 USDC. Payout: 0. Total: 3 USDC — every cent.**

---

### A zero payout is the expected outcome

This is the sentence the whole section exists for, and it is the one the
maturity script printed before sending anything:

> **A zero payout is the EXPECTED outcome.** The call was bought above spot; if
> the price finished below it, it expires unused and the depositor still gets
> every cent of principal back. That is the promise working, not a failure.

The vault promise is *principal protection with upside participation*. Those are
two different things and only one of them is guaranteed. The deposit buys a call
above the current price with the yield; if the price rises through the strike the
call pays and the depositor shares the gain, and if it does not, the call expires
and costs nothing beyond the yield that bought it. **The principal was never at
risk in either branch.**

ETH settled at **$2,403.46**. The backing call was struck at **$2,680**. So:

```
settlement $2,403.46  <  strike $2,680   ->  call expires unused, payout 0
principal returned in full                ->  3.000000 USDC
```

Nothing failed. The insurance was not claimed on.

**This is the outcome most likely to be misread by a judge**, which is why it is
written down rather than left to the demo to explain. "Expired worthless" is
options vocabulary for "you did not need it", and a screen that shows a zero
without that sentence looks like a product that lost money. US-7 exists for this
exact reason, and so does BR-3.

---

### The four positions that settled the same afternoon

All four read the settled price from `getTWAP`, all four matched their recorded
contract counts, and all four came back **`expired_worthless` at $2,403.45858228**:

| Position | Type | Strike | Contracts | Outcome |
|---|---|---|---|---|
| `2ebf82f8` | call | $2,680 | 0.000284 | expired unused — the vault call above |
| `7a7d1153` | call | $2,660 | 0.009347 | expired unused |
| `48104f22` | put | $2,340 | 0.019409 | protection not needed |
| `efa8d071` | put | $2,300 | 0.001999 | protection not needed |

**Both directions expired worthless, and both are correct.** ETH finished at
$2,403.46 — *below* both call strikes and *above* both put strikes. The calls
found no upside to share; the puts found no floor to defend. One settlement
price, four positions, four different reasons for the same status.

That symmetry is worth pointing at in the pitch: the puts and the calls are the
same instrument read in opposite directions, and the product never says either
word to the user.

`ccdcbf28` settled the previous afternoon at **$2,421.92256872**, also
`expired_worthless`. Five positions have now completed the full lifecycle.

---

### Three products, three complete lifecycles

Nine transactions, all on Base mainnet, all verifiable by anyone with the hashes
in this file.

| Product | Lifecycle | Status |
|---|---|---|
| **Protection** | bought → held to expiry → settled by the protocol → recorded | complete |
| **Lending** | put bought → funds disbursed → loan repaid | complete |
| **Vault** | deposited → call bought → expired → principal returned whole | complete |

Section 3 asked for exactly this and said why:

> A position that completed the whole lifecycle is the strongest artefact this
> project will produce. It answers "does it work" with a chain of evidence
> rather than a claim.

It now exists three times, and the last of the three is the one that had to move
real money back out again to be true.

---

### What is real and what is not

**Real:** the transfer, the amount, the recipient, the settlement price, every
contract count, and the fact that the call expired unused.

**Not real:** the depositor. `0xc169c7c0…` is a second wallet the team controls,
not a user — there is no deposit path, so there was no external depositor to pay.
The maturity transfer is a genuine on-chain movement of USDC to an address that
is not ours to spend from, which is the closest honest analogue available. It is
recorded here as that and not as a customer withdrawal.

**Also not real:** the simulated yield that bought the call (BR-37). The
*participation* was real — it came from a premium actually paid for an option
actually held — but the yield that funded it was modelled, and the interface says
so.

---

### One thing the script got wrong, and it did not matter

The closing balance line printed `9.257193 (was 9.257193)` and gas as
`0.00000000`, after 3 USDC had left the wallet. The true post-transaction balance
is 6.257193, confirmed above at the block boundary.

The read is one block stale — the same defect this project has now hit **six
times, in every script that prints a closing balance**. It is recorded in
SETUP.md as a property of the shape of the code rather than as six separate
oversights.

**Nothing depended on that line.** The transfer had already succeeded, the hash
was already printed, and the figure it got wrong was cosmetic. It is written here
anyway, because a report that only records the parts that went well is not
evidence.

---

## 9. Lending, end to end — 31 Aug and 3 Sep 2026

Borrow against protection you already hold, then repay from your own wallet.
**Two loans, both closed. Five USDC transfers on chain — two out, three back —
and one of the three was refused.**

### The chain the product makes

The two products are not side by side, they are sequential: the put is bought
first and the loan is drawn against it. That ordering is a design decision, not
an accident of implementation.

> Buying a put is irreversible but **self-contained** — you end up owning an
> asset. Disbursing a loan is irreversible and **creates an obligation**. Fusing
> them into one action manufactures a state with no compensating move: *"we
> bought you an option you did not ask for."*

So `POST /api/loans` takes a `positionId` and never buys anything.

### Loan 1 — complete cycle, 31 Aug to 1 Sep

| | |
|---|---|
| Backing put | `efa8d071` — $2,300 floor, 0.001999 contracts, premium 0.022186 USDC |
| Put purchase | [`0x637242ca…`](https://basescan.org/tx/0x637242cabaf89a69cea5d240da3ef4ab78b380df1292f87b6df8a58a33a0fd94) |
| Disbursement | [`0x29165d16…`](https://basescan.org/tx/0x29165d16cb9ad2a38f7fa875c0d436464cd9a91090e3f6699074be134fa0201b) — 4.5977 USDC |
| Repayment | [`0x02c37705…`](https://basescan.org/tx/0x02c37705b14fd86072b76108f0181869680d1998684e5dcea57eb41e069a6a09) — 9.198822 USDC sent against 4.599411 owed |
| Status | `repaid` |

The put settled `expired_worthless` at **$2,403.46** on 3 Sep — the price
finished above the floor, so the protection was never needed and the collateral
was never called on. **That is the loan being safe rather than the loan being
lucky:** the credit limit is set so the guarantee covers the debt whatever the
price does, and the case where the price rises is the boring one.

This loan was written under the **old** credit rule, which is why its principal
equals its protected value exactly. BR-39 was revised the same day to reserve
the interest out of the limit.

### Loan 2 — complete cycle, 3 Sep

| | |
|---|---|
| Backing put | `e619686f` — $2,360 floor, 0.109011 contracts, premium 0.46096 USDC |
| Put purchase | [`0x2913c6e2…`](https://basescan.org/tx/0x2913c6e20389de6e56ff605db47396688561c2167ee765d51d56a680b1091847) |
| Disbursement | [`0x183fb463…`](https://basescan.org/tx/0x183fb4632d06b098d76e856aacf7e54220af80b655b4446d963cc3381ba74576) — 5 USDC, block 50825272, 12:51:31 UTC |
| Repayment refused | [`0xdf75182d…`](https://basescan.org/tx/0xdf75182d8c9bedac4996e1e72b88c49d94f3ddbe183451ca85fc441437963bf3) — block 50838174, 20:01:35 UTC |
| Repayment accepted | [`0xecdc6816…`](https://basescan.org/tx/0xecdc6816db88d82468c55332aa0df8acc312949766d777294af6d30fa22bd1f6) — 5.000547 USDC, block 50838315, 20:06:17 UTC |
| Loan | `d486ee11-02fe-479a-b239-4388c303f3f4`, **`repaid`** |

Read at the block boundary rather than from the API's own report:

```
disbursement 0x183fb463  0x4fB77837 -> 0xc169c7c0   5.000000 USDC
repayment    0xecdc6816  0xc169c7c0 -> 0x4fB77837   5.000547 USDC
```

Out and back, opposite directions, the same two addresses. The 0.000547 is the
interest, and it is the only difference between the two lines.

### The equation is the entire claim

```
protectionFloorUsdc $2,360  x  numContracts 0.109011
  = protectedValueUsdc  $257.26596
  - interestReservedUsdc    $0.028107
  = creditLimitUsdc     $257.237853
```

The borrower drew **5 of 257.24** — under 2% of the line. The API returns those
four numbers as separate fields rather than a total, because a total is a figure
the user has to trust and the components are one they can check. Nothing
recomputes them in the browser.

**The credit limit is derived, never configured.** A hardcoded loan-to-value
ratio would produce the same number with or without the option, which would make
the product's central claim false.

### Two limits, and only one of them is the borrower's

The wallet held 55.69 USDC against a 257.24 limit, so a full draw was impossible.
Asking for one returns **503, not 400**:

> We cannot fund 257.237754 USDC right now. **This is our limit, not yours** —
> your protection still supports 257.237755 USDC. The most we can send today is
> 55.686223 USDC.

A credit limit is a fact about the user's collateral. A wallet balance is a fact
about our float. Rendering the second as the first would tell someone their
protection is worth a fifth of what it is.

### What is owed, and what is *fixed*

Loan 2 owed **5.000547 USDC** — 5 principal plus 0.000547 interest — and for the
first seven hours of its life `repaymentExpectedUsdc` was `null`. That is the
point. The figure becomes binding only when the borrower asks for it:

```
disbursed          12:51:27 UTC   repayment_expected = null
repayment_requested 19:48:36 UTC  repayment_expected = 5.000547   <- fixed here
repaid              20:07:06 UTC  5.000547 accepted
```

> Interest accrues with the clock. A single-step repayment would show one number,
> accept that number, and call it short — with both figures correct at the moment
> each was computed, and the discrepancy invisible to everyone.

Eighteen minutes passed between fixing the figure and accepting it, and the
amount did not move. It could not: it was written down before it was paid, and
the check compares against the stored figure rather than recomputing one.

### The repayment is verified, not trusted

We sign nothing. The borrower transfers from their own wallet and hands us a
hash, and every conclusion comes from decoding that receipt. The real 1 Sep
repayment shows why the obvious check is the wrong one:

```
tx.to    = 0x833589fC...   the USDC contract, not the lender
tx.value = 0               no ETH moved

decoded from the logs:
  0xc169c7c0...  ->  0x4fB77837...   9.198822 USDC
```

A check written against `to` and `value` would accept **any** transaction sent
to USDC — including one that transferred nothing — and reject **every** real
repayment. Seven checks run against the *stored* expectation, and one
transaction can never close two loans.

### The fifth check earned its place on 3 Sep

The first repayment attempt on loan 2 was **refused**, and refusing it was the
correct answer:

```
0xdf75182d   status 1   block 50838174   20:01:35 UTC
  0x4fB77837 -> 0x4fB77837   5.000547 USDC
```

Right token. Right amount, to the last of six decimals. Confirmed on Base, a
mined transaction with `status 1`. It failed the fifth check:

> **sent by the borrower to the lender** — `expected 0xc169c7c0 -> 0x4fB77837,
> not found`

The transfer had gone out from the **operator** wallet rather than the borrower's
address — a self-transfer from `0x4fB77837` back to `0x4fB77837`. USDC moved. It
just did not move *from the borrower*, which is the one thing a repayment has to
do. `POST /api/loans/:id/repay` answered **`REPAYMENT_UNVERIFIED`** with the
seven-item checklist, and the loan stayed `repaying` — unchanged, still owing the
same fixed 5.000547, still repayable.

This is the failure worth having on the record, because it is the one a weaker
check would have waved through:

> Four of the five things a reviewer would look at were correct. A check on
> amount, token, destination and confirmation count — the obvious four — would
> have marked this loan repaid while the lender's balance was **exactly where it
> started**. The money had gone in a circle.

The borrower re-sent from the right address four and a half minutes later
(`0xecdc6816`), all seven checks passed, and the loan closed. Nothing had to be
undone in between, because nothing had been written: **a failed verification
writes no row.** The refusal cost one transaction fee and no reconciliation.

### The interface failed on the same run, and the backend did not

The live run also broke the browser, and the two failures are worth separating.

The repayment instruction — amount, token, and the two addresses — was held in
React state and nowhere else. Refreshing the page emptied it, and by then the
loan was `repaying` rather than `active`, which the row's button condition did
not accept: **the instruction disappeared and the control that could fetch it
back disappeared with it.** The panel had also never shown `from` at all, and its
copy said only *"send this from your own wallet"* — which has no direction when
the borrower controls more than one address. That is precisely how `0xdf75182d`
came to be sent from the wrong one.

Both were fixed the same day (`8d1701a`, merged as `0e0c284`): the button now
accepts `repaying` and re-fetches the instruction, the panel shows all four
fields with `from` second and addresses untruncated, and the copy states that a
transfer from any other address will not be accepted. Four regression tests were
added, each checked against the pre-change component to confirm it fails.

The distinction the incident draws is the useful one:

> The backend was never wrong. It refused a transfer it should have refused and
> left the loan exactly as it found it. **The interface's defect was that it made
> the mistake easy to make and then hid the way to correct it** — and no test
> caught either half, because both were about state the tests always supplied.

---

## 10. The vault, end to end — 31 Aug and 3 Sep 2026

Principal protection with a share of the upside. **Three deposits: one
superseded, one completed, one live.**

| Vault | Principal | Participation | Backing call | Outcome |
|---|---|---|---|---|
| `2dbc767a` | 100 USDC | 23.0965% | [`0x7930bc42…`](https://basescan.org/tx/0x7930bc428fbca01749f7d4afae3bceec44123107dd5049cbd075f44196cb47b0) $2,660 | `superseded` |
| `5026d7f8` | 3 USDC | 23.5422% | [`0xd7fec53c…`](https://basescan.org/tx/0xd7fec53c5595750aff0ed994b6ded292b93c93a12185d8856ce0ef4cc0be70ac) $2,680 | **matured, 3 USDC returned** |
| `caaddf96` | 3 USDC | 27.8451% | [`0x696a1004…`](https://basescan.org/tx/0x696a10049460813f11f018de203f898ae9fbcb8ae16c55ddf5a847719d4b10c1) $2,580 | `active`, matures 6 Sep |

The completed one returned its principal whole on 3 Sep via
[`0x72cb94ba…`](https://basescan.org/tx/0x72cb94ba1260e0dab6576f05ef2bf0de672cbc2da4e0d597c5c8df16aa4ab6c5)
— section 8 covers why a zero payout is the promise working rather than a
failure.

### Participation comes from a premium that was actually paid

The live deposit, priced against the book on 3 Sep:

```
principal        3.000000 USDC
  yield portion  2.998847   SIMULATED (BR-37) — no yield source exists
  option portion 0.001153   REAL — buys the call

premium          $3.67124551 per contract, from the live book
contracts        0.000345
exposure         $0.835352
PARTICIPATION    27.8451%   = exposure / principal
```

**27.8451% is not a setting.** It is a quotient of two measured numbers: the
exposure a real premium bought, over the deposit. Two deposits of the same size
on different days produce different participation — 23.5422% on 31 Aug against
27.8451% on 3 Sep — because the book moved. A configured rate would be identical
both times, and would be a claim rather than a result.

The chain took **0.001150** of the 0.001153 quoted: 0.001007 to the maker and
0.000143 in protocol fees.

---

### The four-second window

**This is the only place in the repository where a fixed ordering bug is
observable as a sequence rather than argued from code.**

The original deposit bought the call and inserted the vault row *afterwards*. A
process dying between those two steps left an option on chain that nothing in
the database recorded owning — the one place BR-14's rule had not been applied.
Worse, the insert's failure was handled with `if (vault.error) console.error(…)`,
so a failed row printed a wallet summary and exited zero.

The fix inverts the order. Polling `/api/vault` through a real deposit shows it
happening:

```
t+2s    no vault row yet
t+4s    vault caaddf96   status=pending      <- row exists, call NOT yet bought
t+12s   vault caaddf96   status=active       <- call confirmed on chain
```

**Under the old code, t+4s was empty.** That gap is the whole bug, and it is now
a state you can watch a deposit pass through rather than a paragraph asking you
to believe something. The `pending` status exists for exactly those eight
seconds.

A definitively refused fill sends the vault to `failed`. An **unknown** outcome
leaves it at `pending` with its position at `pending_verification` — never a
guess in either direction.

---

### Two premiums this document records because the database may not

`7a7d1153` and `2ebf82f8` — the two vault calls bought by the original script —
carry `premium_paid: null`, because that script never recorded it. Read back
from their receipts:

```
7a7d1153   0.036441 USDC
2ebf82f8   0.001016 USDC
```

**They were not written to the rows.** Both positions are `expired_worthless`,
which BR-19 makes terminal and immutable: *corrections are new rows, not edits.*
Recording them here is what that rule intends — the figures are preserved
without editing a settled position.

The third such row, `154d37f5`, was still `active` and was corrected in place
through `transitionPosition`, so it left an event.

Three further positions carry `premium_paid: null` with no transaction hash.
That null is correct: nothing was bought, so nothing was paid.
