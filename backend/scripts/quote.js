// Quote engine exercise script (IMPLEMENT.md Phase 1).
//
// Read-only: no wallet, no signing, no transactions.
// Covers tasks 1.1, 1.2 and 1.3 so far. Grows as 1.4-1.8 land.
//
//   node --env-file-if-exists=../.env scripts/quote.js [ASSET]
//
// This is an internal dev tool, so options terminology is fine here.
// BR-3 forbids it in user-facing output only.

import { client } from '../src/thetanuts/client.js';
import { listSupportedAssets } from '../src/thetanuts/assets.js';
import { getSpotPrice } from '../src/thetanuts/market.js';
import { getBuyablePutOrders } from '../src/thetanuts/orders.js';
import { toHumanOrder, toPayoutContracts, payoutToUsdc } from '../src/thetanuts/decimals.js';

const asset = (process.argv[2] || 'ETH').toUpperCase();

// Default protection level, BR-4. Deriving the target strike properly is task
// 1.4 - this is here only to show how far the book's real strikes sit from
// what a user would ask for (BR-6).
const PROTECTION_PCT = Number(process.env.DEFAULT_PROTECTION_PCT ?? 20);

const usd = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

// --- Supported assets -------------------------------------------------------

const supported = await listSupportedAssets();
console.log('supported assets:', supported.join(', '));

if (!supported.includes(asset)) {
  console.log(`\n${asset} has no live price feed. Nothing to quote.`);
  process.exit(1);
}

// --- Task 1.1: spot price ---------------------------------------------------

const spot = await getSpotPrice(asset);
console.log(`\n--- 1.1 spot price ---`);
console.log(`${asset}: ${usd(spot)}  (typeof ${typeof spot})`);

// --- Task 1.2: buyable puts on this asset -----------------------------------

const totalOrders = (await client.api.fetchOrders()).length;
const puts = await getBuyablePutOrders(asset);

console.log(`\n--- 1.2 buyable puts ---`);
console.log(`whole book:            ${totalOrders} orders`);
console.log(`${asset} puts we can buy:  ${puts.length}`);

if (puts.length === 0) {
  console.log(`\nNo fillable ${asset} puts. Every put on this asset is one where the`);
  console.log(`maker is the buyer, so filling it would put us on the seller side (BR-1).`);
  process.exit(0);
}

// --- Task 1.3: raw vs converted, on one real order --------------------------
//
// Printed side by side with the arithmetic spelled out, so a strike can be
// checked by hand. This is where a silent 100x error would live.

const sample = puts[0];
const human = toHumanOrder(sample);
const r = sample.order;

const row = (field, raw, helper, converted) =>
  console.log(`${field.padEnd(13)}${String(raw).padStart(15)}  ${helper.padEnd(22)}  ${converted}`);

console.log(`\n--- 1.3 raw -> human, one real ${asset} order ---\n`);
console.log(`${'field'.padEnd(13)}${'raw (bigint)'.padStart(15)}  ${'helper'.padEnd(22)}  converted`);
console.log('-'.repeat(78));

row('strike', r.strikePrice, 'fromStrikeDecimals', usd(human.strike));
console.log(`             hand check: ${r.strikePrice} / 1e8 = ${Number(r.strikePrice) / 1e8}`);

row('premium', r.price, 'fromPriceDecimals', `${human.premiumPerContract} USDC per contract`);
console.log(`             hand check: ${r.price} / 1e8 = ${Number(r.price) / 1e8}`);
console.log(`             WRONG (6dp): ${r.price} / 1e6 = ${Number(r.price) / 1e6}   <-- the 100x error`);

row('numContracts', r.numContracts, 'fromBigInt(_, 6)', `${human.numContracts} contracts`);
console.log(`             hand check: ${r.numContracts} / 1e6 = ${Number(r.numContracts) / 1e6}`);

row('available', sample.availableAmount, 'fromBigInt(_, 6)', `${usd(human.availableCollateralUsdc)} USDC`);
console.log(`             hand check: ${sample.availableAmount} / 1e6 = ${Number(sample.availableAmount) / 1e6}`);

row('expiry', r.expiry, 'new Date(_ * 1000)', human.expiry.toISOString());
console.log(`             ${human.daysToExpiry.toFixed(1)} days out`);

// Cross-check: premium x contracts should equal the collateral on the order.
const implied = human.premiumPerContract * human.numContracts;
console.log(`\ncross-check: premium ${human.premiumPerContract} x ${human.numContracts} contracts = ` +
  `${usd(implied)} vs available ${usd(human.availableCollateralUsdc)}  ` +
  `${Math.abs(implied - human.availableCollateralUsdc) < 1 ? 'ok' : 'MISMATCH'}`);

// --- The numContracts scale trap --------------------------------------------
//
// Verified empirically: the Order struct carries 6dp, but the payout helpers
// want 18dp. Passing the order's own value straight in is a 10^12 error that
// returns a plausible-looking tiny number instead of throwing.

const settleAt = human.strike - 250;
const settle8 = BigInt(Math.round(settleAt * 1e8));

const wrong = client.utils.calculatePayoutAtPrice(sample.order, r.numContracts, settle8);
const right = client.utils.calculatePayoutAtPrice(sample.order, toPayoutContracts(r.numContracts), settle8);

console.log(`\n--- numContracts scale: Order struct 6dp vs payout helpers 18dp ---\n`);
console.log(`payout if ${asset} settles at ${usd(settleAt)} (strike ${usd(human.strike)}, $250 in the money):`);
console.log(`  hand:               ${human.numContracts} contracts x $250 = ${usd(human.numContracts * 250)}`);
console.log(`  passed as-is (6dp):  raw ${String(wrong).padStart(13)} = ${payoutToUsdc(wrong)} USDC` +
  `   <-- 10^12 too small, and it does not throw`);
console.log(`  rescaled to 18dp:    raw ${String(right).padStart(13)} = ${payoutToUsdc(right)} USDC` +
  `   <-- correct`);

// --- Strike depth per expiry ------------------------------------------------
//
// How thin is the book? If an expiry offers only a couple of strikes, BR-6's
// "closest available" can land a long way from what the user asked for, and
// the UI has to say so.

const targetStrike = spot * (1 - PROTECTION_PCT / 100);
console.log(`\n--- strike depth by expiry ---`);
console.log(`a ${PROTECTION_PCT}% floor on ${asset} at ${usd(spot)} wants a strike near ${usd(targetStrike)}\n`);

const byExpiry = new Map();
for (const o of puts.map(toHumanOrder)) {
  if (!byExpiry.has(o.expiryUnix)) byExpiry.set(o.expiryUnix, []);
  byExpiry.get(o.expiryUnix).push(o.strike);
}

for (const expiryUnix of [...byExpiry.keys()].sort((a, b) => a - b)) {
  const strikes = [...new Set(byExpiry.get(expiryUnix))].sort((a, b) => a - b);
  const days = ((expiryUnix * 1000 - Date.now()) / 86_400_000).toFixed(1);

  // Closest available strike to the target, and how far off it lands.
  const closest = strikes.reduce((best, s) =>
    Math.abs(s - targetStrike) < Math.abs(best - targetStrike) ? s : best);
  const gapPct = ((closest - targetStrike) / targetStrike) * 100;
  const realFloorPct = ((spot - closest) / spot) * 100;

  console.log(
    `${new Date(expiryUnix * 1000).toISOString().slice(0, 10)}  (+${days.padStart(5)} days)  ` +
    `${String(strikes.length).padStart(2)} strikes  ` +
    `${usd(strikes[0])} - ${usd(strikes.at(-1))}`,
  );
  console.log(
    `    closest to target: ${usd(closest)}  ` +
    `(${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(1)}% off target, ` +
    `a real floor of ${realFloorPct.toFixed(1)}% down)`,
  );
}
