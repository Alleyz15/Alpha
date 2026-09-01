// Pre-flight dry run (IMPLEMENT.md tasks 3.3-3.6).
//
//   node --env-file-if-exists=../.env scripts/preflight-check.js [UNITS] [TIER] [--keep]
//
//   UNITS   units of the asset to protect        default 0.02
//   TIER    highest | middle | lowest            default lowest
//   --keep  leave the test quote and position rows in the database
//
// ---------------------------------------------------------------------------
// BROADCASTS NOTHING. callStaticFillOrder simulates; everything else reads.
// ---------------------------------------------------------------------------
//
// Why 0.02 ETH at the lowest tier by default:
//
//   Phase 3 first fill            1-3 USDC
//   Phase 4 short-dated position  1-3 USDC   <- required to demo settlement at all
//   Two rehearsals                2-6 USDC
//   Demo day, live on stage       1-3 USDC
//   ----------------------------------------
//                                 5-15 USDC against a ~10 USDC wallet
//
// Every fill therefore sits at the BOTTOM of BR-15's 1-3 USDC range, not the
// middle. This is not "leaving room" - it is the only size that lets the
// schedule complete. The lowest tier gives the same verification value as the
// recommended one at about a third of the cost.
//
// Premiums moved fourfold in a single day, so units and tier are arguments: the
// right size tomorrow is not the right size today.

import { buildQuoteSet } from '../src/thetanuts/quote.js';
import { insertPurchasedTier } from '../src/db/quotes.js';
import { insertPendingPosition } from '../src/db/positions.js';
import { getDemoUser } from '../src/api/demoUser.js';
import { db } from '../src/db/client.js';
import { discardTestRows } from '../src/db/testCleanup.js';
import { getWalletBalances } from '../src/thetanuts/wallet.js';
import { readAllowance } from '../src/thetanuts/allowance.js';
import { getWalletAddressChecksummed } from '../src/thetanuts/signer.js';
import { prepareFill } from '../src/thetanuts/fill.js';
import { formatPreflight } from '../src/thetanuts/preflight.js';

const units = Number(process.argv[2] ?? 0.02);
const tierLabel = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'lowest';
const keep = process.argv.includes('--keep');

if (!Number.isFinite(units) || units <= 0) {
  console.error('usage: node scripts/preflight-check.js [UNITS] [TIER] [--keep]');
  process.exit(1);
}

const balances = await getWalletBalances();
const allowance = await readAllowance();

console.log('\n--- wallet ---\n');
console.log(`  address    ${getWalletAddressChecksummed()}`);
console.log(`  USDC       ${balances.usdc.toFixed(6)}`);
console.log(`  ETH        ${balances.eth.toFixed(8)}`);
console.log(`  allowance  ${(Number(allowance) / 1e6).toFixed(6)} USDC to OptionBook`);

const user = await getDemoUser();
console.log(`\n--- quoting ${units} ETH, ${tierLabel} tier, for ${user.display_name} ---`);

const set = await buildQuoteSet('ETH', {
  userId: user.id,
  units,
  mode: 'percentage',
  protectionPct: 20,
});

const tier = set.tiers.find((t) => t.actual.tier === tierLabel);
if (!tier) {
  console.error(`\n  no '${tierLabel}' tier available. Got: ${set.tiers.map((t) => t.actual.tier).join(', ')}`);
  process.exit(1);
}

console.log(`\n  floor      $${tier.actual.floorUsdc}  (-${tier.actual.protectionPct}%)`);
console.log(`  expiry     ${tier.actual.expiry.slice(0, 10)}  (${tier.actual.daysToExpiry} days)`);
console.log(`  premium    ${tier.cost.premiumUsdc.toFixed(6)} USDC`);
console.log(`  contracts  ${tier.size.contracts}  (raw ${tier.size.contractsRaw})`);
console.log(`  protects   ${tier.size.protectedUnits} ETH, floor value $${tier.payout.floorValueUsdc}`);

// BR-14: the row exists before anything could be broadcast. In the real flow
// the purchase endpoint writes it; here the script does, so the checklist has
// a genuine row to verify rather than a stub.
const quoteRow = await insertPurchasedTier({ userId: user.id, set, tier });
const position = await insertPendingPosition({
  userId: user.id,
  quoteId: quoteRow.id,
  asset: set.asset,
  strike: tier.actual.floorUsdc,
  strikeRaw: String(tier.order.order.strikePrice),
  expiry: tier.actual.expiry,
  numContractsRaw: tier.size.contractsRaw,
});

console.log(`\n  quote row     ${quoteRow.id}`);
console.log(`  position row  ${position.id}  (${position.status})`);

let exitCode = 0;

try {
  console.log('\n--- pre-flight checklist ---\n');
  const result = await prepareFill(position.id);

  if (!result.preflight) {
    console.log(`  BLOCKED before the checklist: ${result.reason}`);
    exitCode = 1;
  } else {
    console.log(formatPreflight(result.preflight));

    const f = result.preflight.funds;
    console.log('\n--- budget after this fill would settle ---\n');
    console.log(`  USDC now        ${f.usdc.toFixed(6)}`);
    console.log(`  premium         ${(Number(result.usdcAmountRaw) / 1e6).toFixed(6)}`);
    console.log(`  USDC remaining  ${f.usdcRemaining.toFixed(6)}`);
    console.log(`  fills of this size still affordable: ` +
      `${Math.floor(f.usdcRemaining / (Number(result.usdcAmountRaw) / 1e6))}`);

    if (!result.preflight.pass) exitCode = 1;
  }

  console.log(`\n  nothing was broadcast. Filling is task 3.7.\n`);
} finally {
  if (keep) {
    console.log(`  --keep: rows left in place (position ${position.id})\n`);
  } else {
  await discardTestRows({ positionId: position.id, quoteId: quoteRow.id });
    console.log('  test rows removed\n');
  }
}

process.exit(exitCode);
