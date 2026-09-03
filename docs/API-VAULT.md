# Vault API

A deposit that returns your principal whole and shares any upside.

**Two claims, and only one is a guarantee:**

| | |
|---|---|
| principal protection | **guaranteed** — the deposit comes back whole |
| upside participation | **not guaranteed** — the call may expire unused |

On 3 Sep the call expired unused and the depositor got every cent back. That is
the promise working. An interface that had promised upside would have rendered
it as a failure.

---

## `GET /api/vault` · `GET /api/vault/:vaultId`

```json
{
  "vaultId": "5026d7f8-...",
  "positionId": "2ebf82f8-...",
  "status": "matured",

  "principalUsdc": 3,
  "yieldPortionUsdc": 2.9878,
  "optionPortionUsdc": 0.0122,
  "yieldRateAnnualPct": 5,
  "yieldIsSimulated": true,

  "participationPct": 23.5422,
  "exposureUsdc": 0.0693,

  "maturity": "2026-09-03T08:00:00Z",
  "payoutUsdc": null,
  "returnedUsdc": 3,
  "maturityTx": "0x72cb94ba...",
  "maturityUrl": "https://basescan.org/tx/0x72cb94ba...",

  "call": {
    "positionId": "2ebf82f8-...",
    "asset": "ETH",
    "upsideThresholdUsdc": 2680,
    "expiry": "2026-09-03T08:00:00Z",
    "status": "expired_worthless",
    "settlementPriceUsdc": 2403.45858228
  },

  "maturable": false,
  "reason": "This deposit has already been returned.",
  "maturityJob": null
}
```

### Things that will mislead if rendered carelessly

**`payoutUsdc: null` is not zero.** Null means the call has not settled — we do
not know yet. Zero means it settled and paid nothing, which is a real and
expected result. Rendering null as `$0.00` tells the depositor their upside is
gone before it has been decided.

**`call.upsideThresholdUsdc` is a threshold, never a floor.** It is the price
*above* which the depositor shares the gain. The dashboard once rendered this
call as "Protection floor $2,680" — a floor above spot. There is deliberately no
`protectionFloorUsdc` field on a vault call.

**`yieldIsSimulated` is always true and the interface must say so** (BR-37). It
is pinned by a CHECK constraint an `UPDATE` cannot flip. The *participation* is
real — it comes from a premium actually paid for an option actually held
(BR-38) — but the yield that funded it is modelled.

**`maturable` / `reason`** decide the button. Every refusal carries a reason;
`maturable: false` with nothing to show is how a dead button appears.

---

## `GET /api/vault/:vaultId/maturity-preflight`

Runs all nine checks for real and **sends nothing**. Returns `pass`, the full
`checks[]`, `owed`, and `wouldSend`.

**Slow: about 320 seconds.** See the timing note below. Use it to show what will
be checked, not as a gate before every render.

**It is not a permission slip.** `POST /mature` runs the whole pre-flight again
against state at that moment — between a passing dry run and a transfer, the
call can settle, the balance can move, and a second maturity can land. A check
that ran a minute ago is not a check.

---

## `POST /api/vault/:vaultId/mature`

No body. **Returns `202 Accepted`, not a result.**

```json
{
  "accepted": true,
  "started": true,
  "sent": null,
  "vaultId": "...",
  "maturityJob": { "state": "running", "startedAt": "...", "elapsedSeconds": 0, "error": null },
  "pollUrl": "/api/vault/<vaultId>",
  "expectedSeconds": 330
}
```

Then poll `pollUrl` and watch `maturityJob.state`: `running` → `done` or
`failed`. **The authoritative answer is the vault row itself** — `status`,
`returnedUsdc`, `maturityTx` — not the job.

### Why 202 and not a held request

The transfer is one block, about two seconds. The **pre-flight** is not:

```
readSettlementState    222.0s
runMaturityPreflight   316.4s     measured 3 Sep 2026
```

Check 3 reads settlement from chain, and the event scan walks 40 nine-block
windows before falling back to the oracle, which answers in one call. A
five-minute held request exceeds client and proxy timeouts, and a timed-out POST
that may or may not have moved money is the exact ambiguity this product avoids.

**`sent: null` on the 202 is deliberate.** At that instant nothing has been sent
*and* nothing has been ruled out — the pre-flight has not finished. `false`
would be a claim we cannot make.

### Clicking twice does not send twice

The job is keyed by vault id, so a second POST while the first is running
returns `started: false` and the same job. The row and the pre-flight are still
the real defences; this closes the window before either is reached.

### `maturityJob.error` — three outcomes, and they are not interchangeable

| `code` | `sent` | Means |
|---|---|---|
| `PRECONDITION_FAILED` | `false` | A check failed. Nothing was sent. Safe to fix and retry |
| `TRANSFER_REVERTED` | `false` | The chain rejected it. Nothing moved. Safe to retry |
| `OUTCOME_UNKNOWN` | **`null`** | **We lost contact. It may have been sent.** `doNotRetry: true` |

**Never offer a retry button when `doNotRetry` is true.** A retry there pays
twice and cannot be undone. Show the message and tell the user to contact the
team.

`sent: null` means unknown. It is not a smaller kind of `false`.

---

## Errors

| Status | Code | Means |
|---|---|---|
| 400 | `INVALID_REQUEST` | Malformed id |
| 404 | `NOT_FOUND` | No such vault, **or not this user's** — the same answer on purpose |
| 409 | `CONFLICT` | Already matured, superseded, or the term has not finished |
| 409 | `OUTCOME_UNKNOWN` | May have sent. Do not retry |
| 412 | `PRECONDITION_FAILED` | A check failed; nothing sent |
| 502 | `TRANSFER_REVERTED` | Rejected on chain; nothing sent |

---

## The recipient is never yours to choose

Loan disbursements and vault maturities pay a **server-side constant**
(`0xc169c7c0…`, the team's second wallet). There is no body field for it — not a
validated one, none at all. If a browser could name the destination, the API
would be a faucet.

That address is a team wallet, not a customer. The interface must not call it
"your wallet".
