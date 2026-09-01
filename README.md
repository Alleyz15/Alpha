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
set by us — quoted three times in one afternoon at the same size it came out at
24.17%, 22.99% and 23.54%, because the market moved.

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

**Eight transactions, and what each one proves:**

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

**Option contracts we hold:**

| Contract | Position |
|---|---|
| [`0xa609b6fb`](https://basescan.org/address/0xa609b6fbcf89dfb9bc671cfaa519d4ad63404329) | ETH put, $2,320 floor, expires 2 Sep |
| [`0xaa773723`](https://basescan.org/address/0xaa77372360c2414198080dc837df680674b6e7e1) | ETH put, $2,300 floor, expires 3 Sep — backs the loan |
| [`0x110cfc45`](https://basescan.org/address/0x110cfc45ed90f5c9e9264e286977ce8906c1de29) | ETH put, $2,340 floor, expires 3 Sep |
| [`0x46348380`](https://basescan.org/address/0x4634838086ed31e432db1cefa4e3ab19ef60159f) | ETH call, $2,660, expires 3 Sep |
| [`0x12520cfb`](https://basescan.org/address/0x12520cfb58433ae7375d7c9371fdfc5a808c023b) | ETH call, $2,680, expires 3 Sep |

Full detail, including two failed attempts and what they taught us:
[`docs/ONCHAIN-EVIDENCE.md`](docs/ONCHAIN-EVIDENCE.md)

## Demo

[video link]

1. Requesting protection in plain language
2. **A live quote from the real order book** — priced when you ask, every time
3. The confirmation, showing the real floor and the maximum you can lose
4. The dashboard, with the positions we hold and their transactions on BaseScan

**No transaction is broadcast during the demo, and that is deliberate.** A live
fill needs someone who can read an eleven-item pre-flight checklist and judge
whether a premium is sane; on the day, nobody with that context is in the room.
Broadcasting to mainnet in front of an audience, with no one able to read the
output, is a worse risk than showing work already done.

So the purchases are real and already on chain — **eight transactions, listed
above, each verifiable independently.** The quote you watch being generated is
live; the fill it would produce has been performed before, by the same code path,
and one of those fills went from browser to chain in 140.7 seconds through the
order-matching logic rather than a script shortcut.

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
npm test                  # 81 tests, no credentials needed
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
| Option purchases | **Real.** Eight transactions on Base mainnet, verifiable above |
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