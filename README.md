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

Two ways in, one mechanism underneath:

| What you tell us | What we derive |
|---|---|
| A percentage you can tolerate losing | Strike, from today's price |
| An amount you need by a date | Strike from your target, expiry from your date |

Both buy a put on Thetanuts and hold it to expiry. Settlement is automatic; the result appears on your dashboard.

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
| Example transaction | [transaction link] |
| Option contract | [address] |

Thetanuts exists only on mainnet — there is no testnet. Every transaction here is real, executed in small amounts from a dedicated wallet.

## Demo

[video link]

1. Requesting protection in plain language
2. A live quote from the real order book
3. An on-chain purchase, verifiable on BaseScan
4. The dashboard, including a settled position

---

## Running it locally

Requires Node 24+, a Base mainnet RPC endpoint, and a Supabase project.

```bash
git clone https://github.com/Alleyz15/Alpha.git
cd Alpha
```

**Backend**

```bash
cd backend
npm install
cp .env.example .env      # add your RPC endpoint and Supabase credentials
npm run dev               # http://localhost:3000
```

**Frontend** — in a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev               # http://localhost:5173
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
| Settlement status | `option.getOptionInfo().settled` |
| Settlement amount | `option.calculatePayout()` |

Built with Node 24, the Thetanuts SDK, ethers v6, Supabase, Vite and anime.js.

---

## Limitations

Stated plainly, because they're real:

**Custodial.** Alpha operates a single wallet so anyone can try it without installing one. Production would be non-custodial — the options logic is identical; only the signer changes.

**OptionBook only.** We fill orders already resting on the book, so the protection level is the closest available rather than the exact number requested. The interface always shows the real figure, never the requested one. Supporting request-for-quote would remove this constraint.

**Settlement can fail.** The protocol emits settlement-failure events, so positions that don't settle are flagged rather than assumed successful.

---

## Team

| Name | Role | LinkedIn |
|---|---|---|
| [Alvin Wong] | Backend — SDK integration, database, settlement | [url] |
| [name] | Frontend | [url] |
| [name] | [role] | [url] |
