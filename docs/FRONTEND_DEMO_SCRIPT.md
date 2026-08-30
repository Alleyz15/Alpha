# Frontend Live Demo Script (2:30)

## Before going on stage

- Set `VITE_USE_MOCK_API=false` and restart the frontend.
- Confirm the backend health check passes and the demo context has no positions.
- Confirm the app-controlled wallet has enough funds for one purchase.
- Open the welcome page at 100% browser zoom and close unrelated tabs.
- Keep a second tab ready with the backend health endpoint, but do not show it unless needed.
- Request the quote only during the demo so its 60-second timer is fresh.

## Spoken walkthrough

### 0:00–0:15 — Welcome and empty dashboard

**Action:** Enter the demo, then show the empty dashboard.

**Say:**

> This is a first-time user with a simulated ETH balance and no existing protection. They never deposit crypto into this demo. We use live market quotes, and when they confirm, the app's wallet sends the real transaction on Base.

### 0:15–0:35 — Describe what the user wants

**Action:** Open **Explore**, select ETH, enter the amount to protect, choose percentage mode, enter 20%, and choose an end date.

**Say:**

> The user describes the outcome they want in familiar terms: how much ETH to protect, roughly how much downside protection they prefer, and the date they need it until. They do not need to understand trading terminology.

### 0:35–0:55 — Compare the available choices

**Action:** Request a quote and pause on the tier cards. Point to the recommended tier, protection floor, cost, and protected amount. Select the recommended tier.

**Say:**

> The backend turns that request into the choices actually available in the market. These are discrete real choices, not numbers invented by the interface. The recommended one is closest to the user's preference, but the user stays in control and can compare cost against protection.

### 0:55–1:25 — Make the protection line understandable

**Action:** Continue to confirmation. Replay the protection-line animation and let it finish. Point to the illuminated floor line, maximum loss, and any unprotected-value warning.

**Say:**

> Before money moves, we show what this protection means. If ETH finishes below this line at the end date, the protection pays in USDC. Notice that nothing is triggered merely when the moving price crosses the line. We also separate the maximum loss on the protected portion from any value the user chose not to protect.

### 1:25–1:45 — Confirm custody and purchase

**Action:** Point to the disclosure immediately above the confirmation button, then confirm while the quote is still valid.

**Say:**

> The custody model is explicit here: the app controls the wallet that buys the protection, while the ETH balance shown to this user is simulated. The frontend submits only the quote ID and the selected tier ID; the backend looks up every price and amount itself before purchasing.

### 1:45–2:10 — Show the real transaction

**Action:** Show the success state. Point to **Purchased by the app's wallet**, then open the BaseScan link if time and network conditions allow.

**Say:**

> The purchase is now active. This transaction was sent by the app's wallet on Base, and the user can verify it independently on BaseScan. The interface never represents the simulated holding as an on-chain deposit.

### 2:10–2:30 — Close the loop

**Action:** Return to **Dashboard** and show the new position.

**Say:**

> Back on the dashboard, the empty state has become an active position with the protected amount, floor, end date, amount paid, and verification link. That is the complete first-time journey: state the risk, compare real choices, understand the outcome, confirm transparently, and verify the result.

## Recovery lines

- **Quote expired:** “The quote is deliberately short-lived so a stale market price cannot be purchased. I’ll refresh it and confirm the new terms.”
- **No suitable end date:** “The market cannot cover the requested date. We show the longest available date instead of silently shortening the protection.”
- **Backend or market provider unavailable:** “The interface fails closed: it explains that live pricing is unavailable and does not pretend sample data is real.”
- **Transaction is slow:** “The request has been submitted by the app's wallet. We can verify its status through the returned BaseScan transaction.”
- **BaseScan is slow:** Stay on the success screen and point to the transaction hash; do not spend demo time waiting on another site.

## Language guardrails

- Say **protection floor**, **amount paid**, **end date**, and **pays in USDC**.
- Do not say strike, option, IV, premium, put, call, or imply continuous/instant protection.
- Always say the outcome is evaluated **at the end date**.
- Never describe the simulated ETH balance as deposited, held on-chain, or purchased.
