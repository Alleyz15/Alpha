# Alpha

**Downside protection for people who don't know what an option is.**

Built for MUBA Hacks 2026 · Thetanuts Track 01 · Live on Base mainnet

---

## The problem

If you hold crypto and the price falls, you have two bad choices: sell and give up the recovery, or hold and absorb the loss.

A financial instrument that solves this exactly has existed for decades. A put option gives you the right to sell at a fixed price — your downside gets a floor while your upside stays open. Your maximum loss is the premium you paid, known before you commit. It is insurance, not speculation.

Almost nobody uses it, and not because it doesn't work. Every interface that offers it asks you to pick a strike price and an expiry, and to understand implied volatility and theta decay before you can do either. Most people close the tab.

**The instrument isn't the barrier. The interface is.**

## What Alpha does

You describe what you're worried about, in your own words:

> "Protect my ETH from falling more than 20%"

> "I need at least $2,000 by 1 November — that's my rent"

Alpha works out the rest and buys the protection on-chain. The interface never shows a strike, an expiry, or a Greek letter. It shows what it costs, where your floor is, and the most you can lose.

Alpha takes the request and buys the closest protection the market actually
offers. Right now that means a floor around 6% below spot over two to three days
— the order book carries nothing deeper or longer. **The interface shows the real
floor, never the requested one.**

Two ways in, one mechanism underneath:

| What you tell us | What we derive |
|---|---|
| A percentage you can tolerate losing | Strike, from today's price |
| An amount you need by a date | Strike from your target, expiry from your date |

Both buy a put on Thetanuts and hold it to expiry. Settlement is automatic; the result appears on your dashboard.

### Two things the same put makes possible

**Borrow without the risk of being sold out.** A conventional lender discounts your
collateral and liquidates you when the price falls, because it has no floor. We
have one, so the credit limit *is* the floor — `strike × contracts`, derived from
the option, minus the interest the loan charges over its term. Not a
loan-to-value ratio, and not configurable. Remove the option and we would lend
less and keep the right to liquidate.

**Keep your deposit, share the upside.** The yield a deposit would earn buys a
call instead of being paid out. The deposit is returned in full at maturity, plus
a share of any rise. The share is computed from the premium actually paid, never
set by us. Quoted three times in one afternoon during development, at the same
deposit size, it came out at 24.17%, 22.99% and 23.54% — because the market
moved between quotes. Those are three readings from 31 August, not a rate we
offer: live deposits since have ranged from 7% to 35%.

Both are built and both have run on chain. See transactions 3–5 and 8 below.

## Why it's on-chain

The protection is a real position on a live protocol — not a database entry backed by a promise. Every position is fully collateralised on-chain, and every purchase produces a transaction anyone can verify.

**One design rule shapes everything: the user is always the buyer, never the seller.**

Option buyers have capped losses and open-ended upside. Sellers have capped gains and losses that run to the size of the position. For a decade, retail users have been quietly steered onto the seller side by products advertising stable yield. Alpha does not offer that trade, at any price.

---

## Live on Base mainnet

| | |
|---|---|
| Chain | Base mainnet · chainId **8453** |
| Protocol | Thetanuts OptionBook |
| Collateral | USDC |
| Wallet | [`0x4fB77837…`](https://basescan.org/address/0x4fB77837bf2A0B86D167627Ded2E894f92F15127) |

Thetanuts exists only on mainnet — there is no testnet. Every transaction below is real, executed in small amounts from a dedicated wallet.

**A transaction for each thing the product claims:**

| # | Transaction | What it proves |
|---|---|---|
| 1 | [`0x6420c71c`](https://basescan.org/tx/0x6420c71c0ec21eec902df711086c33a23559102d2fd1ead17a9436865be10de0) | Protection bought. ETH put, $2,320 floor, we hold the buyer side |
| 2 | [`0xec836267`](https://basescan.org/tx/0xec836267a62d5699eaf9ce382252bb8efcdad41d9680b4462ce0ddc4171c75d2) | USDC approved for an exact amount, never `MaxUint256` |
| 3 | [`0x637242ca`](https://basescan.org/tx/0x637242cabaf89a69cea5d240da3ef4ab78b380df1292f87b6df8a58a33a0fd94) | The put that backs the loan. $2,300 floor |
| 4 | [`0x29165d16`](https://basescan.org/tx/0x29165d16cb9ad2a38f7fa875c0d436464cd9a91090e3f6699074be134fa0201b) | 4.5977 USDC lent — a credit limit derived from that strike, not from a ratio |
| 5 | [`0x7930bc42`](https://basescan.org/tx/0x7930bc428fbca01749f7d4afae3bceec44123107dd5049cbd075f44196cb47b0) | A real **call**, funding the upside share of a principal-protected deposit |
| 6 | [`0x64e37010`](https://basescan.org/tx/0x64e37010da92270f3ffea4148c50a1b5f57fa831f7a0fbeefcc72332aa07e7ce) | Browser to chain. 140.7s from quote to broadcast, through the order-matching path |
| 7 | [`0xd7fec53c`](https://basescan.org/tx/0xd7fec53c5595750aff0ed994b6ded292b93c93a12185d8856ce0ef4cc0be70ac) | The deposit resized so its maturity can actually be paid |
| 8 | [`0x02c37705`](https://basescan.org/tx/0x02c37705b14fd86072b76108f0181869680d1998684e5dcea57eb41e069a6a09) | Loan repaid. Put → lend → repay, complete on chain |

**Option contracts we currently hold.** Each address is the option itself; each
hash is the fill that bought it. Five of the eighteen open positions, chosen so
every product has one you can check:

| Contract | Position | Bought by |
|---|---|---|
| [`0xf6a01636`](https://basescan.org/address/0xf6a01636db9f6f988bb1bec3e0b2318d91cb61b2) | ETH put, $2,400 floor, expires 7 Sep — protection, unencumbered | [`0x66091813`](https://basescan.org/tx/0x6609181328137fa8492b96fcd1ae5ed86329b587116043b2a968254f5777d7ea) |
| [`0xb3caad4c`](https://basescan.org/address/0xb3caad4c676cdacd59cb112cf0e3e26b527f5b39) | BTC put, $79,500 floor, expires 6 Sep — protection on a second asset | [`0x100e9e2a`](https://basescan.org/tx/0x100e9e2ac545d3f30734b818e586f34e5e5be2aa4ca2d58d83867328a97d32d6) |
| [`0x0ff693e8`](https://basescan.org/address/0x0ff693e8c690cb7cf5794e96eda014d68caf0786) | ETH put, $2,420 floor, expires 7 Sep — **backs an open loan** | [`0x83d3e8de`](https://basescan.org/tx/0x83d3e8debeb7b810b626f00615a279936430c4e41c0139214dec5c86d212fa6d) |
| [`0x5b31aebe`](https://basescan.org/address/0x5b31aebe87c0e7a40a1ce6bcfd6c78c9fb01ca42) | BTC call, $86,000, expires 7 Sep — **funds a 20 USDC protected deposit** | [`0x38d991f5`](https://basescan.org/tx/0x38d991f540dd18057ec2e4e7b1368695c05e5478427ddefd0d098f275ccb4a55) |
| [`0x346dccd6`](https://basescan.org/address/0x346dccd6e15c02a0f9c2535df477ccc04e45d34a) | XRP call, $1.50, expires 6 Sep — funds a deposit, third asset | [`0x554b1de8`](https://basescan.org/tx/0x554b1de8f08c24ec6848b9c3f59f6db1b2d7ca2c0850bf342d61303e1c52cd08) |

Full detail, including two failed attempts and what they taught us:
[`docs/ONCHAIN-EVIDENCE.md`](docs/ONCHAIN-EVIDENCE.md)

## Demo

[video link]

1. Requesting protection in plain language
2. **A live quote from the real order book** — priced when you ask, every time
3. The confirmation, showing the real floor and the maximum you can lose
4. The dashboard, with the positions we hold and their transactions on BaseScan

**The video buys protection for real.** The position in step 3 is an ETH put
with a $2,420 floor, bought for 0.572088 USDC and
[live on chain](https://basescan.org/tx/0x57bf47f6882489ed37edfcb60065d37bb9d9ce725378ae7f9ee7354df64ca4a0).
Recording makes that possible: a fill has to clear an eleven-item pre-flight
checklist, and someone has to read the output and judge whether the premium is
sane. On a recording there is time to do that properly, and to stop if a check
fails.

The video also shows where the boundary sits. Confirming in the interface
records a request; the fill itself is run by an operator from a terminal. That
split is the product being honest about its custody model, not a shortcut — one
of those fills went from browser to chain in 140.7 seconds through the
order-matching logic rather than a script.

**The three-minute pitch does not broadcast, and that is deliberate.** The same
checklist that fits comfortably into a recording does not fit into a live slot:
a fill takes 9–30 seconds once submitted, the book re-signs its orders every
minute so a quote can go stale mid-sentence, and nobody in the room is reading
pre-flight output while presenting. Broadcasting to mainnet in front of an
audience, with no one able to read the result, is a worse risk than showing work
already done.

So the pitch shows purchases that are already on chain — **every purchase, loan
and settlement listed above is verifiable independently.** The quote generated
on stage is live; the fill it would produce has been performed before, by the
same code path.

---

## Running it locally

Requires Node 24+, a Base mainnet RPC endpoint, and a Supabase project.

```bash
git clone https://github.com/Alleyz15/Alpha.git
cd Alpha
cp .env.example .env      # one file for the whole project — fill in the values
```

**Backend**

```bash
cd backend
npm install
npm run inspect:orders    # read-only check against the live order book
```

**Frontend** — in a second terminal:

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

The frontend reads the same root `.env` through `envDir` in `vite.config.js`.

**`.env.example` ships with `VITE_USE_MOCK_API=true`**, so a fresh clone runs
against fixtures and needs no database or RPC endpoint. To drive the real
backend, set it to `false` and start the API in a third terminal:

```bash
cd backend
npm run api               # http://localhost:3000
```

Verify the backend without spending anything:

```bash
npm test                  # the backend suite, no credentials needed
npm run db:check          # database connectivity and schema
npm run preflight         # the full purchase checklist — broadcasts nothing
```

Environment details and troubleshooting: [`docs/SETUP.md`](docs/SETUP.md)

---

## How it works

```
User input
    ↓
Quote engine   reads the live order book, selects the closest available
               strike and expiry, prices the position
    ↓
Purchase       simulated first, then filled on-chain
    ↓
Database       records ownership — the chain sees only one wallet
    ↓
Scheduler      reads settlement results after expiry
```

Thetanuts SDK surface used:

| Purpose | Method |
|---|---|
| Live order book | `api.fetchOrders()` |
| Spot prices | `api.getMarketData()` |
| Outcome scenarios | `utils.calculatePayoutAtPrice()` |
| Simulate before broadcasting | `optionBook.callStaticFillOrder()` |
| Execute | `optionBook.fillOrder()` |
| Settlement status | `option.getFullOptionInfo()` |
| Settlement amount | `option.calculatePayout(address, price)` |
| Settlement price | `option.getFullOptionInfo()`, then TWAP as a fallback |

Built with Node 24, the Thetanuts SDK, ethers v6, Supabase, Vite and anime.js.

---

## What is real, and what is simulated

Stated in one place so nobody has to infer it.

| | |
|---|---|
| Quotes | **Real.** Priced from the live Thetanuts order book, every time |
| Option purchases | **Real.** Every fill is a transaction on Base mainnet, verifiable above |
| Settlement | **Real.** Read from chain after expiry |
| Credit limit | **Real.** Derived from the strike of a put we actually hold |
| Loan disbursement and repayment | **Real.** USDC moved on chain, both directions |
| The call funding the deposit | **Real.** Bought on the book |
| **Your balance** | **Simulated.** Seeded in the database. Nothing is deposited |
| **The deposit yield** | **Simulated.** No yield source exists |

**There is no deposit path, and that is deliberate.** Taking custody of a
stranger's money needs regulatory standing a hackathon project does not have, so
balances are seeded rather than funded. The consequence is that every real
transaction above was paid for by us, from a wallet we control — the premium, the
loan principal, and the interest alike.

The interface says which is which at the point each number appears, rather than
in a disclaimer nobody reads.

## Limitations

Stated plainly, because they're real:

**Custodial.** Alpha operates a single wallet so anyone can try it without installing one. Production would be non-custodial — the options logic is identical; only the signer changes.

**OptionBook only.** We fill orders already resting on the book, so the protection level is the closest available rather than the exact number requested. The interface always shows the real figure, never the requested one. Supporting request-for-quote would remove this constraint.

**Runs locally.** There is no hosted deployment; the demo runs on a laptop.

**Settlement can fail.** The protocol emits settlement-failure events, so positions that don't settle are flagged rather than assumed successful.

## What's next

- Non-custodial signing
- Request-for-quote, for arbitrary strikes and expiries
- Rolling protection forward before it expires
- Recurring protection for people paid in crypto on a schedule

---

## Team

| Name | Role | LinkedIn |
|---|---|---|
| Alvin Wong Feng Tian | Backend | https://www.linkedin.com/in/alvin-wong-feng-tian-a89bba225/ |
| Ho Qi Yuan | Frontend | https://www.linkedin.com/in/ho-qi-yuan-447100400/ |
| Damian Heng Yong An | Backend | https://www.linkedin.com/in/damian-heng-3a1314281/ |
| Tan Tee Khai | Frontend | https://www.linkedin.com/in/tan-tee-khai-b7187a39a/ |

## AI tools used

| Tool | Purpose |
|---|---|
| Claude | Backend implementation |

Every line of AI-assisted work was reviewed by the developer named beside it
before it was merged. No code reached `main` without a pull request.

## Documentation

Design decisions, business rules and schema are documented in [`docs/`](docs/).