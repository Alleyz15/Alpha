# Live market context — API note

For the frontend developer. This is the contract; the backend follows it exactly.

**It is built and live.** Restart the backend if yours predates 1 September.

---

## Endpoint

```
GET /api/market-context
```

No parameters. No body. Prices and availability come from the live Thetanuts
order book on every request.

---

## Response

```json
{
  "assets": [
    {
      "symbol": "ETH",
      "name": "Ethereum",
      "spotUsdc": 2451.4,
      "holdingUnits": 0.4,
      "protectionAvailable": true,
      "longestProtectionDays": 2,
      "strikesBelowSpot": 10,
      "unavailableReason": null
    },
    {
      "symbol": "SOL",
      "name": "Solana",
      "spotUsdc": 102.3,
      "holdingUnits": 10,
      "protectionAvailable": false,
      "longestProtectionDays": null,
      "strikesBelowSpot": 0,
      "unavailableReason": "no protection is being offered on this asset right now"
    }
  ],
  "updatedAt": "2026-09-01T15:52:23.026Z",
  "reality": { "price": "live", "balance": "simulated" }
}
```

Always four assets: **ETH, BTC, SOL, BNB**. Never AVAX or XRP — they scored 2/6
and 0/6 in simulation and are deliberately excluded.

---

## Fields

| Field | Type | What it is |
|---|---|---|
| `symbol` | string | `ETH` \| `BTC` \| `SOL` \| `BNB` |
| `name` | string | Display name — "Ethereum", "Bitcoin", "Solana", "BNB" |
| `spotUsdc` | number \| **null** | Live price, 2dp. `null` if the feed failed |
| `holdingUnits` | number | Units the demo user holds. **Simulated** (BR-50) |
| `protectionAvailable` | boolean | Whether tiers can be produced at *some* expiry |
| `longestProtectionDays` | integer \| **null** | Cap the date picker on this. `null` when unavailable |
| `strikesBelowSpot` | integer | Distinct floors currently on the book |
| `unavailableReason` | string \| **null** | Plain English. `null` when available |
| `updatedAt` | ISO string | When these figures were true |
| `reality` | object | `{ price: "live", balance: "simulated" }` |

`spotUsdc` can be `null` while `holdingUnits` is non-zero — the user holds the
asset, we just cannot price it this second. Guard the formatter.

---

## Two things I'd ask you to do

### 1. Render `unavailableReason`. Don't hide the asset.

When an asset has nothing on the book, show it greyed with its reason rather than
dropping it from the list.

An asset that silently vanishes looks like a bug. An asset that says *"no
protection is being offered on this asset right now"* shows the product is
reading a real market and refusing to offer what it cannot deliver — which is a
better thing for a judge to see than a shorter list.

The reason is always a full sentence, never a code, so it can go straight on
screen.

### 2. Do not cache `longestProtectionDays`.

Call the endpoint when you need it. Do not store the value, and do not treat it
as a per-asset constant.

**The book's expiries roll every day.** Measured on 1 September:

```
ETH  2 days    BTC  2 days    SOL  1 day    BNB  1 day
```

Tomorrow those become 1, 1, 0 and 0. By the pitch on the 6th they will be
different again, and SOL and BNB may well be offering nothing at all.

If the date picker caps on a stale value, a user picks a date that was reachable
an hour ago and gets refused at the quote step — which is exactly the failure
BR-6 exists to prevent, arriving by a different route.

`"it barely changes, cache it for a minute"` is a reasonable-sounding
optimisation that would break this specific field.

---

## Notes on the numbers

**`longestProtectionDays` is rounded DOWN.** A book reaching 2.9 days reports
`2`. Rounding up would let the picker offer a date the book cannot reach.

**`0` is a valid value, not an error.** It means protection exists but only
expiring today. Worth rendering as "today only" rather than "0 days".

**`protectionAvailable` is not a per-asset property.** It is computed per request
from the live book. The same asset can be available in the morning and not in the
afternoon, and both answers are correct.

This one nearly went wrong: SOL and BNB first measured as unavailable against a
two-day target, but they carry *more* strikes below spot than ETH — they simply
had no expiry that far out. A stored per-asset flag would have removed two
working assets and looked verified while doing it.

---

## Checking it yourself

From `backend/`, with no wallet and no writes:

```bash
npm run market
```

Prints the same figures as a table, plus what is safe to say about them out loud.
