// Quote engine exercise script (IMPLEMENT.md Phase 1).
//
// Read-only: no wallet, no signing, no transactions.
// Covers tasks 1.1 and 1.2 so far. Grows as 1.3-1.8 land.
//
//   node --env-file-if-exists=../.env scripts/quote.js [ASSET]
//
// This is an internal dev tool, so options terminology is fine here.
// BR-3 forbids it in user-facing output only.

import { client } from '../src/thetanuts/client.js';
import { listSupportedAssets } from '../src/thetanuts/assets.js';
import { getSpotPrice } from '../src/thetanuts/market.js';
import { getBuyablePutOrders } from '../src/thetanuts/orders.js';

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

// --- Strike depth per expiry ------------------------------------------------
//
// How thin is the book? If an expiry offers only a couple of strikes, BR-6's
// "closest available" can land a long way from what the user asked for, and
// the UI has to say so.

const targetStrike = spot * (1 - PROTECTION_PCT / 100);
console.log(`\n--- strike depth by expiry ---`);
console.log(`a ${PROTECTION_PCT}% floor on ${asset} at ${usd(spot)} wants a strike near ${usd(targetStrike)}\n`);

const byExpiry = new Map();
for (const o of puts) {
  const expiry = Number(o.order.expiry);
  if (!byExpiry.has(expiry)) byExpiry.set(expiry, []);
  // fromStrikeDecimals is the SDK's own 8-decimal helper (BR-7).
  byExpiry.set(expiry, [
    ...byExpiry.get(expiry),
    Number(client.utils.fromStrikeDecimals(o.order.strikePrice)),
  ]);
}

for (const expiry of [...byExpiry.keys()].sort((a, b) => a - b)) {
  const strikes = [...new Set(byExpiry.get(expiry))].sort((a, b) => a - b);
  const days = ((expiry * 1000 - Date.now()) / 86_400_000).toFixed(1);

  // Closest available strike to the target, and how far off it lands.
  const closest = strikes.reduce((best, s) =>
    Math.abs(s - targetStrike) < Math.abs(best - targetStrike) ? s : best);
  const gapPct = ((closest - targetStrike) / targetStrike) * 100;
  const realFloorPct = ((spot - closest) / spot) * 100;

  console.log(
    `${new Date(expiry * 1000).toISOString().slice(0, 10)}  (+${days.padStart(5)} days)  ` +
    `${String(strikes.length).padStart(2)} strikes  ` +
    `${usd(strikes[0])} - ${usd(strikes.at(-1))}`,
  );
  console.log(
    `    closest to target: ${usd(closest)}  ` +
    `(${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(1)}% off target, ` +
    `a real floor of ${realFloorPct.toFixed(1)}% down)`,
  );
}
