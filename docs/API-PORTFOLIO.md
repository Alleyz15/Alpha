# `GET /api/portfolio` — what the user holds, and how much of it is protected

Read-only. Prices nothing for trade, writes nothing, takes no parameters. The
user is resolved server-side; the client never sends an identifier.

---

## Response

```json
{
  "totalValueUsdc": 4703.200939,
  "totalValueComplete": true,
  "unpricedAssets": [],

  "activeProtectionCount": 2,
  "pendingProtectionCount": 0,
  "nextExpiry": "2026-09-03T08:00:00+00:00",

  "holdings": [
    {
      "asset": "ETH", "amount": 0.4, "priceUsdc": 2380.2, "valueUsdc": 952.08,
      "protectable": true,
      "hasActiveProtection": true,
      "protectionPositionId": "48104f22-..."
    },
    {
      "asset": "USDC", "amount": 249.923385, "priceUsdc": 1, "valueUsdc": 249.923385,
      "protectable": false,
      "hasActiveProtection": false,
      "protectionPositionId": null
    }
  ],

  "simulated": true
}
```

Live output, 2 Sep 2026. Hand-checked against every position row.

---

## The three fields that need care

### `totalValueComplete` — never show the total without it

`totalValueUsdc` is a sum over holdings. Any one of them can fail to price: the
feed times out, the oracle does not cover that asset, the request errors. When
that happens the total is **still returned**, because a partial figure is useful
— but `totalValueComplete` goes `false` and `unpricedAssets` names what is
missing.

```json
{
  "totalValueUsdc": 1000,
  "totalValueComplete": false,
  "unpricedAssets": ["AVAX", "XRP"]
}
```

**Do not render `totalValueUsdc` unqualified when `totalValueComplete` is
false.** A total that quietly omits a holding is not a smaller number, it is a
wrong one, and it is wrong in the direction that flatters us. Something like
*"$1,000 — AVAX and XRP could not be priced"* is fine. `$1,000` alone is not.

`unpricedAssets` names the assets rather than counting them, so the message can
say which ones without a second lookup.

A holding that cannot be priced has `priceUsdc: null` and `valueUsdc: null` —
never `0`. Zero is a value.

### `activeProtectionCount` vs `pendingProtectionCount` — never add them

| Field | Means |
|---|---|
| `activeProtectionCount` | Downside protection that is **filled and confirmed on chain** |
| `pendingProtectionCount` | Requested and paid for, **not yet filled** |

`activeProtectionCount` requires **status `active` and a confirmed event**,
exactly like `verifiedOnChain` on `/api/positions` — not a transaction hash, and
not a row existing. Fills are run by a person (`reality.fill === 'operator'`),
so a position can sit pending for hours. That is normal, not an error.

`pendingProtectionCount` is **status `pending` or `pending_verification`**, plus
the defensive case of an `active` row carrying no confirmed event. Neither
pending status occurs in the demo data, which is how they were briefly counted
nowhere at all; the tests now enumerate the schema's seven statuses rather than
the three the database happens to hold.

Everything else — `failed`, `settled`, `expired_worthless`, `needs_review` — is
in **neither** count. Those are over. `needs_review` in particular is past
expiry and merely unreconciled, so counting it as pending would suggest
something is still coming.

**Adding the two together would let the interface claim protection the user does
not have.** That is the one claim the whole product rests on. If both are
non-zero, show them as different things: *"2 protected, 1 being set up"*.

Calls (`role: 'upside'`) are in **neither** count. They are not protection.

### `nextExpiry` — active downside protection only

The earliest expiry among positions that are protection, active, **and**
confirmed. Three exclusions:

- **calls** — a vault call expiring Thursday is not protection ending Thursday
- **pending** — it may never be filled; a date the user plans around must
  correspond to protection that exists
- **settled / expired / failed** — already over

`null` means the user has no protection running. Render that as *"no protection
active"*, never as a blank or missing date.

> Right now the vault calls and the active puts happen to share an expiry, so
> including calls would give the same answer today and a wrong one tomorrow.

### `holdings[]` — one row, one action

Three fields decide what the row's button does, so every surface makes the same
choice rather than each picking "the first in the array":

| Field | Use |
|---|---|
| `protectable` | Show **Buy Protection**. False for USDC and for anything we cannot quote |
| `hasActiveProtection` | There is confirmed, live downside protection on this asset |
| `protectionPositionId` | The position **View** opens, or `null` |

`protectionPositionId` is the **soonest-expiring** active protection on that
asset — the one the user most needs to look at, and often the one `nextExpiry`
is already reporting. Ties break on id, so the answer never depends on the order
rows came back in.

**It is `null` whenever `hasActiveProtection` is false, including when
protection is merely pending.** A View button opening an unfilled position
invites the user to read it as cover they have. Pending is surfaced by
`pendingProtectionCount`, which is a count and not a promise.

`protectable: false` on USDC also keeps "Buy Protection" off a stablecoin — it
is the spending balance, not an exposure.

Every asset with a non-zero balance, including USDC. USDC is priced at exactly
1 — it is part of what the portfolio is worth, and it can never be the reason a
total is incomplete.

`simulated: true` is BR-50/51: the balances are seeded, never deposited. The
positions they relate to are real.

---

## Not built, and why

**The 7-day change in portfolio value.** We do not store price history — only a
live feed — so any 7-day figure would be computed from numbers we never
recorded. It would look like a measurement and be a reconstruction. If this is
wanted later it needs a daily snapshot table first, and then it is honest.

**`protectionCoveragePct`** and **`estimatedPayoutUsdc`** were also left out of
this pass; neither is blocked, they are just not built.

---

## Changed: `premiumPaidUsdc` is now `null`, not `0`

On both `GET /api/positions` and `GET /api/positions/:positionId`.

A missing premium rendered as `$0.00` says the protection was free. Take the
copy from `paymentStatus` instead:

| `paymentStatus` | Reasonable copy |
|---|---|
| `none` | nothing was charged |
| `held` | charged, not yet bought |
| `paid` | show the premium |
| `refunded` | charged and returned |

**A real `0` is still `0`.** Only absence became null — a recorded zero payout
on an expired position is a fact, not a gap.

Live today, five of eight positions return `null` here; all five previously read
as `$0.00`.

---

## Also new: `entryPriceUsdc` on `GET /api/positions/:positionId`

What the asset was worth **when the position was bought**, taken from the quote
the user was actually shown (`quotes.spot_price`).

```
fc08e2e3  BTC  protection  entryPriceUsdc 77445.04413
2ebf82f8  ETH  upside      entryPriceUsdc null
48104f22  ETH  protection  entryPriceUsdc 2485.31
```

**`null` is normal, not an error.** The two vault calls were bought by script and
have no quote row. It is not recomputed from anything, because a recomputed
entry price would look identical to a recorded one and be a different number.
Render the absence as an absence.

---

## Also new, and it needs handling: `size.confirmed` on quotes

`POST /api/quote` tiers now carry two extra fields:

```json
"size": {
  "contracts": 0.4,
  "confirmed": false,
  "unconfirmedReason": "operator_spend_capacity",
  "adjusted": null
}
```

Quoted sizes are now **confirmed against the chain before the user sees them** —
the size is simulated, and only a size the chain accepts is offered. Where that
simulation could not be run, `confirmed` is `false`.

**Nothing may report an unconfirmed size as confirmed.** Same shape as gating
the BaseScan link on `verifiedOnChain` rather than on `txHash`: the presence of
a number is not evidence that it was checked.

| `unconfirmedReason` | Means |
|---|---|
| `operator_spend_capacity` | The premium exceeds our wallet's USDC allowance or balance, so we could not simulate paying it |
| `capacity_unreadable` | We could not read those limits at all |

Both are **our** limits, never the market's. The size shown is still the correct
computed size and the user can still buy it — the pre-flight check refuses the
fill before anything is broadcast if the money is not there.

Today the deepest protection tier on ETH, BTC, SOL and BNB comes back
unconfirmed, because the demo wallet holds 9.257 USDC and those premiums exceed
it. That is a budget limit, not a fault.

`adjusted` is unchanged and is the separate case: it is set when the market
genuinely would not fill the requested size, and it carries a plain-English
`statement` to show.
