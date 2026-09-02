# Position detail and the extended list — API note

For the frontend developer. Built and live. Restart the backend if yours
predates 3 September.

Everything here is data we already held and simply weren't returning. Nothing is
calculated — see **Not built** at the end for what to render as `—`.

---

## `GET /api/positions` — five new fields

**Every existing field is unchanged.** These are added alongside.

| Field | Type | What it is |
|---|---|---|
| `orderId` | string \| **null** | The quote this came from. `null` for positions bought by script rather than through the app |
| `createdAt` | ISO string | When the user **asked** |
| `purchasedAt` | ISO string \| **null** | When it was **executed**. `null` until confirmed |
| `verifiedOnChain` | boolean | Confirmation is established |
| `executionState` | enum | `requested` \| `broadcast` \| `confirmed` \| `failed` |

### `executionState`, and why it isn't `fill`

The existing `fill` field says `onchain` whenever a transaction hash exists.
That conflates two different things, and between them sits the state that
matters:

```
requested   the row exists, nothing was sent
broadcast   a transaction exists, confirmation is NOT established
confirmed   we saw a receipt with status 1
failed      it will not happen
```

**Gate the BaseScan link on `verifiedOnChain`, not on `txHash`.** A hash proves
something was sent. Linking to it before confirmation invites someone to click
through to a transaction that may have reverted.

`fill` is still there and still means what it did — use `executionState` for
anything new.

### Execution is not settlement

A position that expired worthless still **executed**: `executionState` stays
`confirmed` and the outcome lives in `status`. Do not read `confirmed` as
"profitable" or `settled` as "the fill worked" — they answer different
questions.

### `createdAt` vs `purchasedAt`

One is when the user asked, the other when the operator executed. For this
product they are genuinely different — a real position has 5 seconds between
them, another has 140 seconds. Showing only one loses the fact that a person
executed it.

`purchasedAt` is the **first** `confirmed` event. Two positions carry a second
one from later corrections; using the last would report a correction as the
moment of purchase.

---

## `GET /api/positions/:positionId`

Every field from the list, plus:

```json
{
  "timeline": [
    { "event": "requested",          "at": "2026-08-30T22:38:17.000Z" },
    { "event": "operator_execution", "at": "2026-08-30T22:38:22.000Z" },
    { "event": "confirmed_onchain",  "at": "2026-08-30T22:38:24.000Z" },
    { "event": "needs_review",       "at": "2026-08-31T10:14:52.000Z" },
    { "event": "settled",            "at": "2026-09-02T09:52:48.000Z" }
  ],
  "buyer":   { "displayName": "Demo User A" },
  "account": { "walletAddress": "0x4fB77837…", "controlledBy": "operator" },
  "order": {
    "settlementType": "automatic_at_expiry",
    "settlementAsset": "USDC",
    "paymentMethod": "operator_no_user_payment"
  }
}
```

**`404` for an unknown id, and the same `404` for a position that isn't the
current user's.** A `403` would confirm the id exists. The user is resolved
server-side and never accepted from the client.

### The timeline

Oldest first. **Event name and timestamp only — never the payload.** The stored
payloads carry RPC error text, signed order fields, gas and block data. None of
it goes to a browser, and the `broadcast` payload in particular contains the raw
order the fill was built from.

Event names are mapped, so an internal rename is not a breaking API change:

| Stored | Returned |
|---|---|
| `created` | `requested` |
| `broadcast` | `operator_execution` |
| `confirmed` | `confirmed_onchain` |
| `settled` | `settled` |
| `failed` | `failed` |
| `flagged` | `needs_review` |

`confirmed_onchain` can appear **twice** — a later correction to the row. That's
real history, not a duplicate to filter.

### `account.walletAddress`

The user does not hold this position in their own wallet. `controlledBy` is
always `operator`, and the interface must not imply self-custody (BR-32).

**It is currently `null`** because `THETANUTS_WALLET_ADDRESS` isn't set in
`.env`. Handle the null; it will populate once that's added.

### `order.paymentMethod`

- `simulated_usdc_balance` — a debit exists against the seeded balance
- `operator_no_user_payment` — no debit; the operator bought it directly

The second is the honest answer for positions that predate the payment path.
Don't collapse them into "paid".

---

## Not built — render `—`

| Field | Why |
|---|---|
| `entryPriceUsdc` | Needs a quotes join for one field |
| `estimatedPayoutUsdc` | An estimate, and the real payout is known only at expiry. Showing a guess invites a question we gain nothing by answering |
| Portfolio totals, coverage %, active/pending counts, next expiry | Below |

**On coverage specifically:** the spec is right that overlapping protections must
be capped at the holding — two positions each covering 0.7 of 1 ETH is 1, not
1.4. But there is one user and eight positions with no overlap, so a correct
de-duplication would be built for a case that cannot currently occur. Sum the
list client-side if you need a headline number, and know it is only correct
while nothing overlaps.
