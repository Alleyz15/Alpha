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
import { listExpiries, selectProtectionTiers } from '../src/thetanuts/selection.js';

const asset = (process.argv[2] || 'ETH').toUpperCase();

// Target tenor in days. 25 by default because the buyable book tops out around
// 26 days (BR-52) - a 30-day target has no answer under BR-6, which the run
// below demonstrates.
const TARGET_DAYS = Number(process.argv[3] ?? 25);

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

// --- Task 1.4: expiries and protection tiers --------------------------------

const { expiries } = await listExpiries(asset);

console.log(`\n--- 1.4 expiries with buyable puts below spot ---\n`);
for (const e of expiries) {
  const lo = e.strikes.at(-1).strike;
  const hi = e.strikes[0].strike;
  console.log(
    `${e.expiry.toISOString().slice(0, 10)}  (+${e.daysToExpiry.toFixed(1).padStart(5)} days)  ` +
    `${String(e.strikes.length).padStart(2)} strikes  ${usd(lo)} - ${usd(hi)}  ` +
    `(floors ${(((spot - hi) / spot) * 100).toFixed(1)}% - ${(((spot - lo) / spot) * 100).toFixed(1)}%)`,
  );
}

const showTiers = (result) => {
  const { selection } = result;

  if (!result.expiry) {
    console.log(`  no expiry available on or after ` +
      `${selection.requestedDate.toISOString().slice(0, 10)} — ${selection.reason}`);
    if (selection.longestAvailable) {
      console.log(`  longest available: ${selection.longestAvailable.expiry.toISOString().slice(0, 10)} ` +
        `(+${selection.longestAvailable.daysToExpiry.toFixed(1)} days), ` +
        `${selection.shortfallDays.toFixed(1)} days short of the target`);
    }
    return;
  }

  console.log(`  expiry ${result.expiry.expiry.toISOString().slice(0, 10)} ` +
    `(+${result.expiry.daysToExpiry.toFixed(1)} days), ` +
    `${result.availableStrikes} strikes below spot, ` +
    `${selection.gapDays.toFixed(1)} days after the target`);
  console.log();
  console.log(`    ${'tier'.padEnd(10)}${'floor'.padStart(12)}${'protection'.padStart(12)}` +
    `${'cost / unit'.padStart(14)}${'% of spot'.padStart(11)}`);
  console.log('    ' + '-'.repeat(59));
  for (const t of result.tiers) {
    console.log(
      `    ${(t.label + (t.recommended ? ' *' : '')).padEnd(10)}` +
      `${usd(t.floorUsd).padStart(12)}` +
      `${('-' + t.protectionPct.toFixed(1) + '%').padStart(12)}` +
      `${(t.costPerUnit.toFixed(4) + ' USDC').padStart(14)}` +
      `${(t.costPctOfSpot.toFixed(2) + '%').padStart(11)}`,
    );
  }
  console.log(`    * recommended (BR-41: middle tier preselected)`);
};

console.log(`\n--- 1.4 tiers for a ${TARGET_DAYS}-day target ---`);
showTiers(await selectProtectionTiers(asset, TARGET_DAYS));

// BR-6 is strict: an expiry is never earlier than the target date. The buyable
// book tops out around 26 days (BR-52), so anything longer has no answer at
// all - including the 30 days the product has been describing.
console.log(`\n--- 1.4 BR-6 check: a 30-day target ---`);
showTiers(await selectProtectionTiers(asset, 30));

console.log(`\n--- 1.4 BR-6 check: a 62-day target ---`);
showTiers(await selectProtectionTiers(asset, 62));
