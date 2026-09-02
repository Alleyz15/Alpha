# Q&A prep

**This is a stub with two answers in it, not the finished Q&A.** The full set is
being written with the two people presenting. These two are here because they
came out of a live investigation on 2 September and the answers are verified —
drop them into whatever structure you settle on.

Both are answerable **without having run any of the backend**. That is the test
an answer has to pass: if it needs internals to say out loud, it is not ready.

---

## "Why only four assets? odette.fi offers six."

**Short answer, speakable as-is:**

> The orders for AVAX and XRP are on the book — single-leg, buy side, below spot,
> so it isn't a liquidity problem and it isn't our safety rules excluding them.
> When we try to fill, the Thetanuts contract raises `InvalidNumContracts`, and
> it's asking for one contract more than the contract will permit. It's a
> rounding round-trip: we round the premium down, the SDK rounds it back into a
> contract count, and the number reaching the chain lands one below what we
> sized. We know the error, we haven't closed the mechanism, and we didn't want
> to guess in the code that sizes four assets that work.

**If they push:**

- It is **size- and order-dependent**. Two AVAX orders with identical contract
  counts — one fills, one reverts. So it isn't "AVAX doesn't work".
- We identified the error by brute-forcing 18,450 candidate signatures against
  the selector `0xad4c3ef7`, because it appears in neither 4byte.directory nor
  openchain. It is specific to Thetanuts' OptionBook.
- We tried four explanations and disproved all four with our own measurements.
  The honest position is that we have the error and not yet the rule.

**What NOT to say:** "XRP doesn't work" or "the protocol won't fill it". Both are
false and a judge who has seen odette do it will know.

**Evidence:** `backend/test/sizingBaseline.test.js` — the header records all four
dead hypotheses and what killed each.

---

## "Why is your protection only two days? odette shows three."

**Short answer, speakable as-is:**

> The book carries expiries out to two months. We buy single-leg options only,
> and at three days and beyond the buy-side puts are spreads. A $2,440/$2,420
> spread stops protecting below $2,420 — so the floor we'd show wouldn't be a
> floor, and a user who thinks they're covered when they aren't is worse off than
> one who knows they aren't. We take the longest tenor available as a plain put.

**If they push:**

- The number moves through the day. Every expiry is at 08:00 UTC and the set
  rolls daily, so the longest single-leg tenor sweeps from just under three days
  right after a roll to about two before the next. **Read it off the screen** —
  the interface computes it live, per request.
- So "three days" and "two days" can both be true depending on the hour, and
  odette showing three is not a contradiction.
- This is the product's argument, not an apology: the whole thesis is that the
  user is always the buyer with a real floor. A capped payout is the thing we
  refuse to sell.

**What NOT to say:** any fixed number of days. Not "two-day protection", not
"about three days". Run `npm run market` on the morning of the pitch and use what
it prints.

**Evidence:** BR-52 in `docs/requirements.md`; the funnel in `docs/SETUP.md`.

---

## "What happens if nobody executes the purchase?"

**Short answer, speakable as-is:**

> The confirm button doesn't send a transaction — it records the request and
> holds the funds, and a person executes it. That's deliberate, because we won't
> have a browser click broadcast to mainnet. The gap is that nothing reclaims a
> purchase the operator never gets to: the funds stay held until someone notices.
> We know, it's written up, and the refund path that would close it already
> exists and is tested — it's wiring, not design.

**If they push:**

- We have a live example: a request from the browser yesterday afternoon, holding
  1.52 USDC, with no transaction behind it. The flow did exactly what it should.
  There was no operator.
- The fix is a timeout on the pending state that refunds through the same
  compensating path a refused fill already uses. We chose not to add it two days
  before the deadline.

**What NOT to say:** that it's handled, or that it can't happen. It happened
yesterday.

**Evidence:** `docs/SETUP.md`, "Known design gaps".

---

## The pattern behind both

Worth having ready, because it is the honest version of "why did you get this
wrong at first":

> Both of these started as measurements we'd taken through our own filters. We
> recorded "XRP fails" and "the book stops at two days", and both were really
> statements about our own code — one about our arithmetic, one about a rule we
> chose. We caught them by re-counting with the filters removed, one at a time.

That answers "how do you know the rest of your numbers are right?" better than
insisting they are.
