# On-chain evidence

Permanent record of transactions this project has sent on Base mainnet.
**Do not edit an entry once written.** Add new ones below.

Wallet (burner, custodial — BR-13, BR-30):
`0x4fB77837bf2A0B86D167627Ded2E894f92F15127`

---

## 1. First protection purchased — 30 Aug 2026

**This is the single strongest piece of evidence in the submission.** It is what
"does it work" is answered with.

| | |
|---|---|
| **BaseScan** | https://basescan.org/tx/0x6420c71c0ec21eec902df711086c33a23559102d2fd1ead17a9436865be10de0 |
| Transaction | `0x6420c71c0ec21eec902df711086c33a23559102d2fd1ead17a9436865be10de0` |
| Block | 50670079 |
| Option contract | `0xa609b6fbcf89dfb9bc671cfaa519d4ad63404329` |
| Asset | ETH |
| Type | Vanilla put — **we hold the buyer side** |
| Strike (floor) | $2,320 |
| Expiry | 2026-09-02 08:00 UTC |
| Contracts | 0.139999 (protecting ~0.14 ETH) |
| Total paid | 0.495926 USDC — 0.433936 premium + 0.061990 protocol fee |
| Gas used | 646,060 |
| Position row | `ccdcbf28-125b-4d38-9a28-353ef1b9ed43` |

**Proof we are the buyer, not the seller (BR-1).** USDC movements in the fill:

```
0.433936 USDC   our wallet -> 0xEcda1D00…  the maker      (premium)
0.061990 USDC   our wallet -> 0x1bDff855…  OptionBook     (fee)
324.797680 USDC 0xEcda1D00… -> 0x1bDff855… -> the option  (the MAKER's collateral)
```

`324.797680 = 0.14 × 2320`. The counterparty posted the collateral; we paid a
premium. The indexer agrees: `"side": "buyer"`, `"buyer": 0x4fB77837…`,
`"seller": 0xEcda1D00…`.

## 2. USDC approval — 30 Aug 2026

| | |
|---|---|
| BaseScan | https://basescan.org/tx/0xec836267a62d5699eaf9ce382252bb8efcdad41d9680b4462ce0ddc4171c75d2 |
| Block | 50669494 |
| What | Approved exactly 3 USDC to the OptionBook. Never MaxUint256 (BR-12) |
