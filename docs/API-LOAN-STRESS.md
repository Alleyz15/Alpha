# The no-liquidation comparison — API note (7.5)

For the frontend developer. This is the contract you can build against; the
backend follows it exactly.

**What the screen shows:** two positions side by side, a price fed in, and the
unprotected one flagging for liquidation while the protected one does not.

---

## Endpoint

```
GET /api/loans/:loanId/stress?price=1800
```

`price` is the hypothetical ETH price to test, in dollars. That is the only
input — everything else is read from the loan and the put backing it.

---

## Response

```json
{
  "asset": "ETH",
  "hypotheticalPrice": 1800,
  "spotNow": 2412.55,
  "units": 0.001999,

  "debt": {
    "principal": 4.59599,
    "interest": 0.00171,
    "total": 4.5977
  },

  "rule": {
    "name": "conventional collateralised loan",
    "isRealProtocol": false,
    "statement": "No lending protocol is integrated. This compares our position against a conventional collateral rule, applied identically to both sides."
  },

  "unprotected": {
    "collateralValueUsdc": 3.5982,
    "coverageRatio": 0.7827,
    "wouldLiquidate": true,
    "shortfallUsdc": 0.9995
  },

  "protected": {
    "floorUsdc": 4.5977,
    "floorSource": {
      "strike": 2300,
      "numContractsRaw": "1999",
      "positionId": "ccdcbf28-..."
    },
    "collateralValueUsdc": 4.5977,
    "coverageRatio": 1.0,
    "wouldLiquidate": false
  }
}
```

Money values are USDC to 6 decimals. `numContractsRaw` is a **string** — it is a
raw on-chain integer and does not survive a JS number.

---

## Two things this must never do

**1. Never imply a real lending protocol is integrated.**

There is no Aave, no Compound, no protocol of any kind behind this. It is a
calculation against a conventional collateral rule, applied identically to both
sides so the comparison is fair.

`isRealProtocol: false` and `rule.statement` are in the payload for exactly that
reason. **Render the statement.** Same principle as the reality block you already
have: the disclosure lives in the API so that styling, a layout change, or a
future refactor cannot quietly drop it.

**2. The protected floor comes from the put, never from a constant.**

`floorUsdc` is `strike × contracts` read off the actual filled position.
`floorSource` carries the three values it came from so the screen can show
provenance — hover, tooltip, small print, your call, but it should be reachable.

Do not hardcode the floor, and do not recompute it in the frontend. A hardcoded
number would produce the same credit limit with or without the option, which
makes the product's central claim false.

---

## The one subtlety worth knowing

`debt.total` is measured against **`floorUsdc`**, not against the credit limit.

They are different claims. The floor is what the option *guarantees*; the credit
limit is what we *chose to lend* against it. Comparing debt to the limit would
overstate our own prudence — it would measure our decision rather than the
guarantee. Compare to the floor.

Since 1 Sep the credit limit reserves the interest the loan charges
(`limit = floor / (1 + rate × term/365)`), so a healthy loan has
`debt.total == floorUsdc` exactly, and `protected.coverageRatio` is `1.0`. That
is the design, not a coincidence: principal plus interest lands **on** the floor.

---

## Copy constraints (BR-3)

No options jargon anywhere on this screen. Not *strike*, *put*, *call*, *option*,
*delta*, *IV*. The floor is "the protected value" or "the price floor". The
comparison is "with protection" and "without protection".

`wouldLiquidate: true` in plain language is something like "this position would
be sold to repay the loan" — not "liquidated", which is jargon of a different
kind and frightening without being informative.

---

## Not yet built

The endpoint does not exist at the time of writing — this is the agreed shape so
you can build against it. If you need it stubbed sooner than the backend lands,
say so and it can return a fixed response behind the same URL.
