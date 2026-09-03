# Lending API

Borrow against protection you already hold, then repay from your own wallet.

**The put must exist first.** `POST /api/loans` takes a `positionId` — it never
buys the option. Buying a put and disbursing a loan are two irreversible acts of
different kinds: the first leaves you owning an asset, the second creates an
obligation. Fusing them would manufacture a state with no remedy — *"we bought
you an option you did not ask for"* — so the products chain instead: buy
protection, then borrow against it.

---

## `GET /api/loans/offer?positionId=...`

What could be borrowed against a position, with the equation shown and all
eight checks run. **Sends nothing, writes nothing.**

```json
{
  "positionId": "e619686f-...",

  "protectionFloorUsdc": 2360,
  "numContracts": 0.109011,
  "protectedValueUsdc": 257.26596,
  "interestReservedUsdc": 0.028205,
  "creditLimitUsdc": 257.237755,
  "annualRatePct": 5,
  "termDays": 0.8,
  "dueAt": "2026-09-04T08:00:00Z",

  "borrowableNowUsdc": 55.686223,
  "boundBy": "wallet",
  "walletUsdc": 55.686223,
  "walletShortfallUsdc": 201.551532,

  "checks": [ ... ],
  "sent": false
}
```

### The equation is the product's claim, so it ships as components

```
protectionFloorUsdc $2,360  x  numContracts 0.109011
  = protectedValueUsdc $257.26596
  - interestReservedUsdc $0.028205
  = creditLimitUsdc $257.237755
```

Render these; do not recompute them. Two implementations of one equation
eventually disagree, and the disagreement would be about money.

**The limit drifts slightly upward** as expiry approaches, because the interest
reserve shrinks with the term. Three calls seconds apart returned
`257.237754`, `257.237755`, `257.237756`.

> **The direction is load-bearing, not incidental.** Upward means a user shown a
> figure and clicking a moment later is always *within* the newer limit. If the
> reserve ever grew with time — a different rate model, compounding, a longer
> term — the identical code would start refusing clicks the user was entitled to
> make, and the refusal would look like a bug in the browser rather than a
> property of the formula.

So do not treat the drift as noise to be smoothed over by caching a figure. It
is safe only while it moves this way.

### `boundBy` — the two limits are not the same fact

| `boundBy` | Means |
|---|---|
| `credit_limit` | The protection is the constraint. **This is the product working.** |
| `wallet` | **Our** operator float cannot fund it today. Nothing to do with the user. |

Today the put guarantees **$257.24** and our wallet holds **$55.69**, so
`boundBy` is `wallet` and `walletShortfallUsdc` is $201.55.

**Never render a wallet shortfall as a credit decision.** *"You can only borrow
$55"* is false — their protection is worth $257 and their entitlement has not
changed; our float ran out. Say so: *"We can fund $55.69 of your $257.24 limit
right now."*

`walletShortfallUsdc` is `null` whenever the credit limit is binding, so the
field cannot be shown by accident.

---

## `POST /api/loans`   `{ positionId, principalUsdc }`

**Sends real USDC.** Held rather than 202 — eight checks and a one-block
transfer, seconds rather than the maturity check's 316.

The put must already exist. This endpoint never buys one: buying a put and
disbursing a loan are irreversible in different ways, and fusing them would
produce *"we bought you an option you did not ask for"*. The products chain —
buy protection, then borrow against it.

`principalUsdc` is the one number the client chooses, and **only downward**. The
limit is derived from the position; borrowing less than it is normal.

Success returns `{ loanId, loan, creditLimitUsdc, ...components, principalUsdc,
txHash, explorerUrl, recipientAddress, sent: true }`.

### Refusals, and which of them are about the user

| Status | Code | Whose limit | Means |
|---|---|---|---|
| 400 | `CREDIT_LIMIT_EXCEEDED` | **theirs** | More than the protection supports |
| 503 | `INSUFFICIENT_FLOAT` | **ours** | Our wallet cannot fund it. Their limit is unchanged |
| 412 | `PRECONDITION_FAILED` | — | Another check failed; `details.checks` says which |
| 409 | `CONFLICT` | — | The position cannot back a loan yet |
| 404 | `NOT_FOUND` | — | No such position, or not theirs |
| 502 | `TRANSFER_REVERTED` | — | Rejected on chain. Nothing sent |
| 409 | `OUTCOME_UNKNOWN` | — | **May have sent. `doNotRetry: true`** |

`INSUFFICIENT_FLOAT` is 503, not 400, deliberately: the request is valid and the
collateral sufficient. A 400 would blame the caller for our float.

Its message says so outright:

> We cannot fund 257.237754 USDC right now. This is our limit, not yours — your
> protection still supports 257.237755 USDC. The most we can send today is
> 55.686223 USDC.

---

## `GET /api/loans`

The user's loans, newest first. `{ "loans": [ ... ] }`, each shaped as below.

## `GET /api/loans/:loanId`

One loan. Also **what you poll while a disbursement is in flight** — the row is
written before the transfer is broadcast, so the resource exists before the
transaction does.

```json
{
  "loanId": "740a417d-...",
  "positionId": "efa8d071-...",
  "status": "repaid",

  "principalUsdc": 4.5977,
  "creditLimitUsdc": 4.5977,
  "annualRatePct": 5,
  "collateralContracts": 0.001999,

  "recipientAddress": "0xc169c7c0...",
  "createdAt": "2026-08-31T10:00:00Z",
  "dueAt": "2026-09-03T08:00:00Z",

  "disbursementTx": "0x...",
  "disbursementUrl": "https://basescan.org/tx/0x...",

  "repaymentExpectedUsdc": 4.599411,
  "repaymentRequestedAt": "2026-09-01T...",
  "repaymentTx": "0x02c37705...",
  "repaymentUrl": "https://basescan.org/tx/0x02c37705...",

  "owed": {
    "principalUsdc": 4.5977,
    "interestUsdc": 0.00171,
    "totalUsdc": 4.599411,
    "termDays": 2.715,
    "annualRatePct": 5
  }
}
```

### `repaymentExpectedUsdc` and `owed.totalUsdc` are different numbers

`owed` is what the stored terms say **right now**. `repaymentExpectedUsdc` is
the figure that was **fixed when the repayment was requested** and does not move
afterwards.

Interest accrues with the clock. Without the fixed figure a borrower could be
shown one number, send exactly that, and be told it was short — with both
numbers correct at the moment each was computed and the discrepancy invisible.

**Show `repaymentExpectedUsdc` once it is set.** Fall back to `owed.totalUsdc`
only before a repayment has been requested.

`owed` is `null` when it cannot be computed. Null, not zero — zero would say the
loan is settled.

---

## Repaying: two steps, and the order matters

### 1. `POST /api/loans/:loanId/repayment-request`

No body. Fixes the amount and returns the exact transfer to make. **Sends
nothing, signs nothing, spends nothing.**

```json
{
  "loan": { ... },
  "transfer": {
    "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "tokenSymbol": "USDC",
    "from": "0xc169c7c0...",
    "to": "0x4fB77837...",
    "amountUsdc": 4.599411,
    "amountRaw": "4599411"
  },
  "alreadyFixed": false
}
```

**Do not round `amountUsdc` and send the rounded figure.** A borrower who sends
a rounded-down amount is short, and verification will correctly refuse it. Round
for display only; send `amountRaw`.

`alreadyFixed: true` means this figure was set by an earlier request and is
being repeated rather than recomputed. That is correct behaviour, not a stale
response.

### 2. `POST /api/loans/:loanId/repay` — `{ "txHash": "0x..." }`

The borrower signs the transfer from their own wallet; this endpoint **verifies
and records**. We sign nothing.

Success returns `{ loan, checks, repaid: true }`.

#### What is actually checked

The transfer is read from the **receipt logs**, never from the transaction's
`to` and `value`. Those two fields are meaningless for a token transfer, and
this is not theoretical — the real 1 Sep repayment:

```
tx.to    = 0x833589fC...   the USDC contract, not the lender
tx.value = 0               no ETH moved

decoded from logs:
  0xc169c7c0...  ->  0x4fB77837...   9.198822 USDC
```

A check written against `to` and `value` would accept any transaction sent to
USDC — including one that transferred nothing — and reject every real
repayment.

Seven checks, all of which must pass:

| Check | |
|---|---|
| transaction exists on chain | not yet mined is not a failure, just not yet |
| transaction succeeded | status 1 |
| at least 2 confirmations | |
| carries a USDC transfer | decoded from the logs |
| sent by the borrower to the lender | from and to, both matched |
| amount covers what is owed | against the **fixed** expectation; overpaying is allowed |
| not already used for another loan | one transaction cannot close two |

**A failure records nothing.** The loan stays at `repaying` — it never
downgrades a real payment, and never promotes an unrelated transaction to a
repayment.

---

## Errors

| Status | Code | Means |
|---|---|---|
| 400 | `INVALID_REQUEST` | Malformed body or a `txHash` that is not 32 bytes |
| 400 | `REPAYMENT_UNVERIFIED` | The transaction did not hold up. **`details.checks` says which check failed** |
| 404 | `NOT_FOUND` | No such loan, **or it is not this user's** — deliberately the same answer |
| 409 | `CONFLICT` | Already repaid, not repayable, or no figure requested yet |

`REPAYMENT_UNVERIFIED` carries the full checklist:

```json
{
  "error": {
    "code": "REPAYMENT_UNVERIFIED",
    "message": "That transaction does not settle this loan. Nothing was recorded.",
    "details": {
      "loanId": "...",
      "checks": [
        { "label": "sent by the borrower to the lender", "pass": false,
          "detail": "expected 0xc169c7c0 -> 0x4fB77837, not found" }
      ]
    }
  }
}
```

Show the failing check's `detail`. *"You sent 4.59 and owe 4.60"* is actionable;
"verification failed" is not.

A `CONFLICT` on repay with `details.next` means the two steps were done out of
order — call `repayment-request` first.
