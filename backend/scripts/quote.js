// Quote engine exercise script (IMPLEMENT.md Phase 1).
//
// Read-only: no wallet, no signing, no transactions.
// Covers tasks 1.1 to 1.6 so far. Grows as 1.7-1.8 land.
//
//   node --env-file-if-exists=../.env scripts/quote.js [ASSET] [TARGET_DAYS]
//
// This is an internal dev tool, so options terminology is fine here.
// BR-3 forbids it in user-facing output only.

import { client } from '../src/thetanuts/client.js';
import { listSupportedAssets } from '../src/thetanuts/assets.js';
import { getSpotPrice } from '../src/thetanuts/market.js';
import { getBuyablePutOrders } from '../src/thetanuts/orders.js';
import { toHumanOrder, toPayoutContracts, payoutToUsdc } from '../src/thetanuts/decimals.js';
import { listExpiries, selectProtectionTiers } from '../src/thetanuts/selection.js';
import { sizePosition, maxContractsFor } from '../src/thetanuts/sizing.js';
import { buildQuote, isQuoteFresh, QuoteRefusedError } from '../src/thetanuts/quote.js';

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

row('available', sample.availableAmount, 'fromBigInt(_, 6)', `${usd(human.availableCollateralUsdc)} USDC`);
console.log(`             hand check: ${sample.availableAmount} / 1e6 = ${Number(sample.availableAmount) / 1e6}`);

row('expiry', r.expiry, 'new Date(_ * 1000)', human.expiry.toISOString());
console.log(`             ${human.daysToExpiry.toFixed(1)} days out`);

// Cross-check: the maker's collateral must cover the maximum payout, so
// maxContracts x strike should equal availableAmount.
const maxC = Number(maxContractsFor(sample)) / 1e6;
console.log(`\ncross-check: maxContracts ${maxC.toFixed(6)} x strike ${usd(human.strike)} = ` +
  `${usd(maxC * human.strike)} vs available ${usd(human.availableCollateralUsdc)}  ` +
  `${Math.abs(maxC * human.strike - human.availableCollateralUsdc) < 1 ? 'ok' : 'MISMATCH'}`);
console.log(`note: order.numContracts is ${Number(r.numContracts) / 1e6} — NOT a size limit, ` +
  `it is availableAmount/price. The real cap is ${maxC.toFixed(6)}.`);

// --- The numContracts scale trap --------------------------------------------
//
// Verified empirically: the Order struct carries 6dp, but the payout helpers
// want 18dp. Passing the order's own value straight in is a 10^12 error that
// returns a plausible-looking tiny number instead of throwing.

const settleAt = human.strike - 250;
const settle8 = BigInt(Math.round(settleAt * 1e8));

// One whole contract, as the Order struct scales it (6dp).
const oneContract6 = 10n ** 6n;
const wrong = client.utils.calculatePayoutAtPrice(sample.order, oneContract6, settle8);
const right = client.utils.calculatePayoutAtPrice(sample.order, toPayoutContracts(oneContract6), settle8);

console.log(`\n--- numContracts scale: Order struct 6dp vs payout helpers 18dp ---\n`);
console.log(`payout on 1 contract if ${asset} settles at ${usd(settleAt)} ` +
  `(strike ${usd(human.strike)}, $250 in the money):`);
console.log(`  hand:               1 contract x $250 = ${usd(250)}`);
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

// --- Task 1.5: size the position --------------------------------------------
//
// Every limit is passed in. The premium cap comes from the environment (BR-33)
// so it can be tightened without a code review; the minimum fillable size is
// still unknown, so it is reported rather than enforced.

const MAX_PREMIUM = Number(process.env.MAX_PREMIUM_PER_FILL_USDC ?? 5);

const sized = await selectProtectionTiers(asset, TARGET_DAYS);

if (sized.tiers.length > 0) {
  const tier = sized.tiers.find((t) => t.recommended) ?? sized.tiers[0];

  console.log(`\n--- 1.5 sizing the ${tier.label} tier ` +
    `(floor ${usd(tier.floorUsd)}, ${usd(tier.costPerUnit)} per unit) ---`);
  console.log(`premium cap ${usd(MAX_PREMIUM)} (BR-33, from the environment)\n`);

  console.log(`  ${'holding'.padStart(9)}${'contracts'.padStart(12)}${'premium'.padStart(11)}` +
    `${'protected'.padStart(12)}${'max payout'.padStart(13)}   bound by`);
  console.log('  ' + '-'.repeat(72));

  for (const units of [0.1, 0.5, 1, 5, 100]) {
    const s = sizePosition(tier.order, { units, maxPremiumUsdc: MAX_PREMIUM });
    console.log(
      `  ${(units + ' ' + asset).padStart(9)}` +
      `${s.contracts.toFixed(6).padStart(12)}` +
      `${usd(s.premiumUsdc).padStart(11)}` +
      `${(s.protectedUnits.toFixed(4) + ' ' + asset).padStart(12)}` +
      `${usd(s.maxPayoutUsdc).padStart(13)}   ${s.boundBy}`,
    );
  }

  console.log(`\n  limits on this order: collateral backs ` +
    `${sizePosition(tier.order, { units: 1e9, maxPremiumUsdc: MAX_PREMIUM }).limits.byCollateral.toFixed(6)} contracts, ` +
    `the ${usd(MAX_PREMIUM)} cap allows ` +
    `${sizePosition(tier.order, { units: 1e9, maxPremiumUsdc: MAX_PREMIUM }).limits.byPremiumCap.toFixed(6)}`);

  // BR-15 keeps trades at 1-3 USDC. What does that actually buy here?
  console.log(`\n  BR-15 check — what 1-3 USDC buys at this tier:`);
  for (const budget of [1, 2, 3]) {
    const s = sizePosition(tier.order, { units: 1e9, maxPremiumUsdc: budget });
    console.log(`    ${usd(budget).padStart(6)} -> ${s.contracts.toFixed(6)} contracts, ` +
      `protecting ${s.protectedUnits.toFixed(4)} ${asset} ` +
      `(${usd(s.protectedUnits * spot)} of holdings) with a ${usd(s.maxPayoutUsdc)} floor`);
  }
}

// --- Task 1.6: the quote object ---------------------------------------------

const HOLDING = 1;
const BALANCE = 2;   // seeded, simulated (UC-0, BR-51)

console.log(`\n--- 1.6 quote object ---`);
console.log(`holding ${HOLDING} ${asset}, recorded balance ${BALANCE} ${asset}, ` +
  `${TARGET_DAYS}-day target`);
console.log(`the premium cap is NOT applied when quoting — it guards broadcasting,`);
console.log(`not pricing (BR-33, Phase 3.5b)\n`);

try {
  const q = await buildQuote(asset, {
    units: HOLDING,
    balance: BALANCE,
    targetDate: TARGET_DAYS,
    maxPremiumUsdc: MAX_PREMIUM,
    validitySeconds: Number(process.env.QUOTE_VALIDITY_SECONDS ?? 60),
  });

  console.log(`  quote ${q.quoteId}`);
  console.log(`  valid for ${q.validForSeconds}s, until ${q.expiresAt}   fresh: ${isQuoteFresh(q)}`);
  console.log(`\n  protection`);
  console.log(`    floor              ${usd(q.actual.floorUsdc)}  (-${q.actual.protectionPct}%)`);
  console.log(`    expires            ${q.actual.expiry.slice(0, 10)}  ` +
    `(${q.actual.daysToExpiry} days, ${q.actual.expiryGapDays} after the target)`);
  console.log(`    covers             ${q.size.protectedUnits} of ${q.requested.units} ${asset}` +
    `   (limited by: ${q.size.boundBy})`);
  console.log(`\n  cost`);
  console.log(`    premium            ${usd(q.cost.premiumUsdc)}  ` +
    `(${usd(q.cost.premiumPerContractUsdc)}/contract, ${q.cost.premiumPctOfSpot}% of spot)`);
  console.log(`\n  maximum loss (BR-2 — three different questions)`);
  console.log(`    on the protection  ${usd(q.maxLoss.onProtection).padStart(10)}   the premium, and nothing more`);
  console.log(`    on this purchase   ${usd(q.maxLoss.onProtectedPortion).padStart(10)}   <-- forConfirmation`);
  console.log(`    on the holding     ${usd(q.maxLoss.onWholeHolding).padStart(10)}   includes pre-existing exposure`);
  console.log(`\n  disclosure`);
  console.log(`    size reduced       ${q.disclosure.sizeReduced}`);
  console.log(`    unprotected        ${q.disclosure.unprotectedUnits} ${asset} = ` +
    `${usd(q.disclosure.unprotectedValueUsdc)}`);
  console.log(`    expiry later       ${q.disclosure.expiryLaterThanRequested}`);
  console.log(`\n  if ${asset} goes to zero, the floor pays ${usd(q.payout.maxPayoutUsdc)}`);

  // The frontend consumes JSON. Nothing here may be a BigInt or a Date.
  const json = JSON.stringify(q);
  console.log(`\n  JSON-safe: ${json.length} bytes, ` +
    `raw order excluded: ${!('order' in JSON.parse(json))}, ` +
    `order still reachable server-side: ${q.order !== undefined}`);
} catch (e) {
  if (e instanceof QuoteRefusedError) {
    console.log(`  refused [${e.code}]: ${e.message}`);
  } else throw e;
}

// The three limits behave differently on purpose.
console.log(`\n--- 1.6 refuse vs clamp ---`);
for (const [label, opts] of [
  ['balance exceeded (refuse)', { units: 5, balance: 2 }],
  ['collateral depth (clamp)', { units: 1e6, balance: 1e9 }],
  ['unreachable expiry (refuse)', { units: 1, balance: 2, targetDate: 62 }],
]) {
  try {
    const q = await buildQuote(asset, { targetDate: TARGET_DAYS, ...opts });
    console.log(`  ${label.padEnd(30)} -> quoted ${q.size.protectedUnits} ${asset}, ` +
      `premium ${usd(q.cost.premiumUsdc)}, boundBy ${q.size.boundBy}`);
  } catch (e) {
    if (!(e instanceof QuoteRefusedError)) throw e;
    console.log(`  ${label.padEnd(30)} -> refused [${e.code}]`);
  }
}
