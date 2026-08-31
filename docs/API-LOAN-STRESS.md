# The no-liquidation comparison — API note (7.5)

For the frontend developer. This is the contract you can build against; the
backend follows it exactly.

**What the screen shows:** two positions side by side, a price fed in, and the
unprotected one flagging for liquidation while the protected one does not.

---

## Endpoint

```
GET /api/loans/:loanId/stress?price=1800
GET /api/loans/:loanId/stress?price=1800&rule=current
```

`price` is the hypothetical ETH price to test, in dollars.

`rule` is `as-disbursed` (the default) or `current`, and it matters — see
**Which credit rule** below. Everything else is read from the loan and the put.

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

  "ruleApplied": "current",
  "note": "This loan was disbursed under the previous credit rule, which lent the full floor. Shown here under the current rule, which reserves interest.",

  "asDisbursed": {
    "principal": 4.5977,
    "underCurrentRule": 4.59599,
    "writtenUnderCurrentRule": false
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

## Which credit rule — and why the label is not optional

The first real loan was disbursed under the ORIGINAL credit rule, which lent the
whole floor and then charged interest on top. Its debt therefore exceeds the
guarantee, and **both sides liquidate** — the screen shows our own product
failing.

That is the honest picture of that loan, and `rule=as-disbursed` shows it,
unflattering and all. Keep that view. A judge asking "what does the real loan
look like?" should get the real answer.

`rule=current` re-derives what the same put would support under the revised rule,
where the limit reserves the interest it charges. Under that rule the
demonstration works: the protected side survives, the unprotected one does not.

**It is a hypothetical, and the payload says so.** `ruleApplied` names the rule
and `note` explains the difference in plain language. **Display the note whenever
it is non-null.** Do not decide whether to — same principle as `isRealProtocol`.
Showing a loan under a rule it was not written under, without saying so, is the
thing this field exists to prevent.

`note` is `null` when nothing is being re-derived, including for any loan written
under the current rule — so "render it if present" is the whole logic.

`asDisbursed` is always present, so both figures can be compared without a second
call.

**The default is `as-disbursed`.** A default that quietly shows a hypothetical is
exactly the kind of thing that stops being noticed.

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

## Status

**Built and live.** Restart the backend (`npm run api`) if yours predates 1 Sep —
the route did not exist before then and an old process will return 404.

Errors follow the usual envelope: `404 NOT_FOUND` for an unknown loan,
`400 INVALID_REQUEST` for a missing or non-positive `price`, or an unknown
`rule`.
