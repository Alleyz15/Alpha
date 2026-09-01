# Operations runbook — 2, 3 and 6 September 2026

Three separate days, in one file so nothing gets lost between two.

| When | What | Page |
|---|---|---|
| **Tue 2 Sep, after 16:00 MYT** | Settle one expiring put | Step 1 only |
| **Wed 3 Sep, after 16:00 MYT** | Settle four, then pay the matured deposit | Steps 1–3 |
| **Sat 6 Sep, morning** | Re-measure the book before presenting | Before the pitch |

**Steps 1 to 3 happen after 16:00 MYT (08:00 UTC)** on their day — that is when
the options expire, and before then every command will correctly refuse to run.
The pre-pitch check on the 6th can be run any time that morning.

Written for someone who has never run any of it. **Whoever runs this may not be
the person who wrote it**, so it assumes nothing.

---

## The one rule

> **If a check fails, stop and message someone. Do not improvise.**

Every failure mode on this page is recoverable — as long as nobody guesses. The
checks exist because the code refuses to act on something it cannot verify, and
working around one converts a safe stop into an unsafe outcome.

Specifically:

- **A failed check means nothing was sent.** Not that money is missing.
- **Never re-run a command that hung** after `--confirm`. The transfer may have
  landed; running it twice pays twice, and that cannot be undone.
- **Never edit the database by hand** to make a check pass.
- Waiting is always safe. There is no deadline today that is worse than a wrong
  transaction.

Nothing on this page is urgent. If you are unsure, stop — everything here can be
done later, and none of it degrades by waiting a few hours.

---

## Before you start

**You need:** the repository, a filled-in `.env` at the project root, and about
twenty minutes. You do **not** need to understand options.

```bash
cd backend
npm install
```

Confirm the wallet is reachable and nothing is broken. This spends nothing:

```bash
npm test
```

Expect `pass 90`, `fail 0`. **If any test fails, stop and message the backend
developer.** Do not continue — a failing test here means the code does not match
what this runbook assumes.

---

## What happens today, in order

| # | What | Spends money? | Reversible? |
|---|---|---|---|
| 1 | Settle the expired options | No — records what the protocol already did | Database only |
| 2 | Pay the matured deposit | **Yes, 3 USDC** | **No** |
| 3 | Record what happened | No | n/a |

Do them in that order. Step 2 depends on step 1 having run.

---

## Step 1 — Settle the expired options

**Four positions expire today** — two puts ($2,300 and $2,340) and two calls
($2,660 and $2,680). The protocol settles them automatically; this reads the
result and records it.

The call at $2,680 is the one backing the deposit in step 2, so step 1 must
happen first.

First look, without writing anything:

```bash
npm run settle
```

**What a correct run looks like:** each position reports either `settled` with a
payout figure, or `expired_worthless` with a payout of zero.

That was a report. To record the results in the database, run it again with
`--confirm`:

```bash
npm run settle -- --confirm
```

**This `--confirm` is not like the one in step 2.** Settlement sends no
transactions and needs no wallet — the protocol has already paid the buyer
automatically, and this only writes down what happened. It cannot spend money.

**`expired_worthless` is not a failure.** It means the price finished above the
protected floor, so the protection was never needed — like an insurance policy
you did not have to claim on. The user keeps their ETH and loses only the premium.
That is the product working.

### If EVERY position says `needs_review`

**This is a known issue, not a protocol fault. Do not escalate it as one.**

Settlement has never once run — these are the first options this project has
held to expiry, so the code that reads the settled price has never executed
against a settled option. Three sources are tried: the protocol's payout
event, its price oracle, and its indexer. If all three come back empty, every
position flags `needs_review`.

That is the code refusing to guess. It will not record a zero payout it cannot
verify, because a zero that means "did not pay" and a zero that means "could
not read" look identical afterwards.

**What to do:** note it, finish the runbook, and send the output. Nothing is
lost — the payout, if any, was paid automatically by the protocol into the
wallet whether or not we recorded it. It is a bookkeeping gap, not a money gap.

### If ONE position says `needs_review`

The option expired but the protocol has not settled it yet. Settlement is
automatic but not instantaneous.

**Wait fifteen minutes and run `npm run settle` again.** If it still says
`needs_review` after an hour, leave it. Do not force anything. Record which
position it was and move to step 2 — a position stuck here does not block the
deposit maturity.

### If the command fails to connect

```
Error: could not detect network
```

means the RPC endpoint in `.env` is unreachable. Check the internet connection and
re-run. Nothing was written, so re-running is safe.

---

## Step 2 — Pay the matured deposit

**This sends real USDC and cannot be undone.**

First run it WITHOUT `--confirm`. This checks everything and sends nothing:

```bash
npm run mature 0xc169c7c000cAA28807Ab2585D707C7A6457d718E
```

**What a correct output looks like:**

```
  PASS   1. vault is active or already maturing    status active
  PASS   2. maturity date has arrived              matures 2026-09-03T08:00:00.000Z
  PASS   3. the call has settled on chain          settled at $2431.55
  PASS   4. principal is returned whole            3 principal + 0 payout = 3 USDC
  PASS   5. wallet holds the full return           holds 9.257193, sending 3
  PASS   6. wallet holds gas                       holds 0.00422815 ETH
  PASS   7. recipient is valid and not ourselves   0xc169c7c0...
  PASS   8. not already matured                    no maturity transaction recorded
  PASS   9. callStaticTransfer succeeded           would succeed, gas estimate 45427

  ALL CHECKS PASSED — a maturity transfer would be allowed to broadcast.
```

**A zero payout is the expected result**, and the script says so. The call was
bought above the current price; if the price finished below it, the call expires
unused and the depositor still gets every cent of their 3 USDC back. That is the
promise being kept, not a fault.

If every check passes, send it:

```bash
npm run mature 0xc169c7c000cAA28807Ab2585D707C7A6457d718E -- --confirm
```

Expect `MATURED`, a transaction hash, and a BaseScan link. **Save that link.**

### If a check fails

| Check | What it means | What to do |
|---|---|---|
| 2. maturity date has arrived | You are running it too early | Wait until after 16:00 MYT |
| 3. the call has settled | The option expired but the protocol has not settled it | Run step 1 again, wait 15 min, retry. **Do not proceed** — the payout is unknown, not zero |
| 5. wallet holds the full return | Not enough USDC in the wallet | **Stop. Message the backend developer.** Do not send a partial amount |
| 7. recipient is valid | The address was typed wrong | Copy it again from this page |
| 8. not already matured | It has already been paid | **Stop.** Check BaseScan. Do not send twice |
| 9. callStaticTransfer succeeded | The transfer would fail on chain | **Stop. Message the backend developer.** |

**The rule for every failure: nothing was sent.** A failed check means the
transfer did not happen, not that money is missing.

### If it hangs after you press enter on `--confirm`

**Do not run it again.** The transfer may have landed. Running it twice would pay
twice, and that cannot be undone.

The vault row will be sitting at `maturing`, which is the record that a transfer
was started and its outcome is unknown. Check
[the wallet on BaseScan](https://basescan.org/address/0x4fB77837bf2A0B86D167627Ded2E894f92F15127)
for a recent USDC transfer of 3 USDC. Then message the backend developer with what
you see. This is exactly the situation the `maturing` status exists for.

---

## Step 3 — Record what happened

```bash
npm run reconcile
```

This compares every database row against the chain and reports differences. Expect
no drift.

Then paste the results into `docs/ONCHAIN-EVIDENCE.md`:

- **Section 3** is a dated placeholder for the settlement results
- **Section 7** is the deposit — add the maturity transaction hash there

If you are not comfortable editing the file, paste the output into the team chat
instead. The transaction hashes are the part that matters; the prose can be
written later.

---

## Things that need a human decision

**Named here so they are not discovered at 16:00.**

**1. Who receives the maturity payment.** The address in this runbook,
`0xc169c7c0…`, is a second wallet the team controls — the same one the loan was
disbursed to. There is no user deposit path, so there is no real depositor to pay.
**If that address is wrong, the payment goes somewhere unrecoverable.** Confirm it
before running step 2.

**2. Whether to pay at all if the call settled in the money.** If the price
finished above $2,680 the call pays out and the total will be more than 3 USDC.
The wallet holds 9.26 USDC, so a payout up to about 6 USDC is affordable and check
5 will catch anything larger. If check 5 fails for this reason, that is a judgement
call about the demo budget, not a bug — message the backend developer.

**3. A position stuck at `needs_review`.** The code deliberately refuses to guess
whether an unsettled option paid out. Someone has to decide whether to wait or to
present it as unsettled. It does not block anything else.

**4. The superseded 100 USDC deposit will not mature, by design.** Its principal
was never returnable from this wallet. It stays in the database marked
`superseded` with its real call still held, and settles like any other option. If
anyone asks why there are two deposits, that is the answer.

---

## Before the pitch — Saturday 6 September

**Five minutes, and it stops a presenter contradicting their own screen.**

Run this on the demo machine on the morning of the pitch:

```bash
cd backend
npm run market
```

It reads only — no wallet, no writes, nothing broadcast.

### Why this matters more than it sounds

The order book's expiries roll every day. Measured on 1 September:

```
ETH  2 day(s)   BTC  2 day(s)   SOL  1 day(s)   BNB  1 day(s)
```

**By the 6th those numbers will be different, and may be zero.** ETH and BTC
will likely be shorter; SOL and BNB may offer nothing at all. That is the market,
not a fault.

### What to tell the presenters

**Never state a fixed tenor.** Not "two-day protection", not "protection for a
few days" — the script prints the phrase to use instead:

> "the longest the book offers today"

and the actual number is read off the screen during the demo, where it is
computed live for that request.

A presenter who says "two days" while the screen shows one has contradicted
themselves in front of a judge, and the screen is right.

### If an asset shows NONE

It will display in the interface with a plain-English reason rather than
disappearing. **That is correct behaviour and a good thing to point at** — it
shows the product reads a real market rather than a fixture, and refuses to
offer what it cannot deliver.

### If NOTHING is available on any asset

The script says so explicitly. Do not claim protection can be bought. Show the
positions already held instead — eight real transactions, all verifiable, none
of which depend on today's book.

---

## What is safe to run at any time

These read only and cannot spend anything:

```bash
npm test                # 90 tests, no credentials needed
npm run market          # what the book offers today, per asset
npm run db:check        # database connectivity
npm run reconcile       # database vs chain
npm run preflight       # the full purchase checklist, broadcasts nothing
npm run mature <ADDR>   # without --confirm
```

**Only two commands in this repository can spend money**, and both require an
explicit flag: `scripts/fill.js --confirm` and `scripts/mature.js --confirm`.
Neither should be run on 3 September except step 2 above.
