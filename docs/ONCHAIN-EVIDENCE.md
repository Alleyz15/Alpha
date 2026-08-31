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
