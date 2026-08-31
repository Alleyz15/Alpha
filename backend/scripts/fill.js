// Buy protection for real (IMPLEMENT.md tasks 3.7, 3.8, 3.9).
//
//   node --env-file-if-exists=../.env scripts/fill.js <UNITS> <TIER>
//   node --env-file-if-exists=../.env scripts/fill.js <UNITS> <TIER> --confirm
//
// ---------------------------------------------------------------------------
// WITHOUT --confirm this quotes, writes the pending row, runs the checklist
// and stops. WITH --confirm it SPENDS REAL USDC ON A TRANSACTION THAT CANNOT
// BE UNDONE.
// ---------------------------------------------------------------------------
//
// Strike, expiry, contract count and premium become permanent the moment it
// confirms. The only remedies for a wrong fill are waiting for expiry or
// buying a second, correct one.
//
// On a timeout the position is left at pending_verification and the script
// stops. It never retries: the transaction may have landed, and a retry would
// spend twice and create an option nobody asked for.

import { buildQuoteSet } from '../src/thetanuts/quote.js';
import { insertPurchasedTier } from '../src/db/quotes.js';
import { insertPendingPosition, getPosition, listPositionEvents } from '../src/db/positions.js';
import { getDemoUser } from '../src/api/demoUser.js';
import { db } from '../src/db/client.js';
import { getWalletBalances } from '../src/thetanuts/wallet.js';
import { readAllowance } from '../src/thetanuts/allowance.js';
import { getWalletAddressChecksummed } from '../src/thetanuts/signer.js';
import { prepareFill, executeFill } from '../src/thetanuts/fill.js';
import { formatPreflight } from '../src/thetanuts/preflight.js';

const units = Number(process.argv[2]);
const tierLabel = process.argv[3];
const confirmed = process.argv.includes('--confirm');

if (!Number.isFinite(units) || units <= 0 || !['highest', 'middle', 'lowest'].includes(tierLabel)) {
  console.error('usage: node scripts/fill.js <UNITS> <highest|middle|lowest> [--confirm]');
  console.error('example: node scripts/fill.js 0.15 lowest');
  process.exit(1);
}

const before = await getWalletBalances();
const allowance = await readAllowance();

console.log('\n--- wallet before ---\n');
console.log(`  address    ${getWalletAddressChecksummed()}`);
console.log(`  USDC       ${before.usdc.toFixed(6)}`);
console.log(`  ETH        ${before.eth.toFixed(8)}`);
console.log(`  allowance  ${(Number(allowance) / 1e6).toFixed(6)} USDC to OptionBook`);

const user = await getDemoUser();
const set = await buildQuoteSet('ETH', {
  userId: user.id, units, mode: 'percentage', protectionPct: 20,
});

const tier = set.tiers.find((t) => t.actual.tier === tierLabel);
if (!tier) {
  console.error(`\n  no '${tierLabel}' tier available right now.`);
  process.exit(1);
}

console.log(`\n--- what this buys ---\n`);
console.log(`  asset      ETH`);
console.log(`  floor      $${tier.actual.floorUsdc}   (-${tier.actual.protectionPct}% from $${set.spot})`);
console.log(`  expiry     ${tier.actual.expiry.slice(0, 10)}   (${tier.actual.daysToExpiry} days)`);
console.log(`  contracts  ${tier.size.contracts}   protecting ${tier.size.protectedUnits} ETH`);
console.log(`  premium    ${tier.cost.premiumUsdc.toFixed(6)} USDC   <-- what it spends`);
console.log(`  floor value $${tier.payout.floorValueUsdc}   max payout $${tier.payout.maxPayoutUsdc}`);

// BR-14: the row exists before anything can be broadcast.
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

// ---------------------------------------------------------------------------
// Cleanup for runs that never broadcast
// ---------------------------------------------------------------------------
// A row is written before every attempt (BR-14), including attempts the
// checklist then rejects and dry runs that were never going to send anything.
// Those rows would sit at `pending` forever: the dashboard shows them as
// "Processing", which is wrong - they are not in progress, they will never
// resolve - and Phase 4's scheduler would have to handle expired positions
// with no option address, a case that should not exist.
//
// The guard that matters: this only ever runs while nothing has been
// broadcast. Once a transaction is in flight the row must survive whatever
// happens next, because it is the only trace of an attempt that may have
// landed. Deleting it then would be the exact silent gap BR-14 exists to
// prevent.
let broadcastAttempted = false;

async function discardUnbroadcastRows(why) {
  if (broadcastAttempted) {
    console.log('\n  Rows KEPT: a transaction was already in flight and the record must survive.');
    return;
  }
  await db.from('position_events').delete().eq('position_id', position.id);
  await db.from('positions').delete().eq('id', position.id);
  await db.from('quotes').delete().eq('id', quoteRow.id);
  console.log(`  rows discarded (${why}) — nothing was broadcast`);
}

console.log('\n--- pre-flight checklist ---\n');
const prepared = await prepareFill(position.id);

if (!prepared.preflight) {
  console.log(`  BLOCKED: ${prepared.reason}`);
  await discardUnbroadcastRows('blocked before the checklist');
  process.exit(1);
}

console.log(formatPreflight(prepared.preflight));

if (!prepared.ready) {
  console.log('\n  Nothing was broadcast.');
  await discardUnbroadcastRows('pre-flight failed');
  process.exit(1);
}

if (!confirmed) {
  console.log('\n  DRY RUN — every check passed but --confirm was not given.');
  console.log(`  Re-run with --confirm to spend ${tier.cost.premiumUsdc.toFixed(6)} USDC. This cannot be undone.`);
  await discardUnbroadcastRows('dry run');
  console.log();
  process.exit(0);
}

console.log('\n--- broadcasting ---\n');
console.log('  sending fillOrder... do not interrupt.');

// From this line on the row is permanent, whatever happens.
broadcastAttempted = true;

let result;
try {
  result = await executeFill(position.id, { confirmed: true });
} catch (error) {
  console.error(`\n  ${error.message}\n`);
  const after = await getPosition(position.id);
  console.error(`  position ${position.id} is now '${after?.status}'`);
  process.exit(1);
}

console.log(`\n  CONFIRMED`);
console.log(`  tx            ${result.txHash}`);
console.log(`  BaseScan      ${result.explorerUrl}`);
console.log(`  option        ${result.optionAddress ?? '(not parsed from logs)'}`);
console.log(`  premium paid  ${result.premiumPaid} USDC`);

// Read the balance from chain rather than subtracting - the point is to know
// what the wallet holds, not what we think it should hold.
const after = await getWalletBalances();
console.log('\n--- wallet after (read from chain) ---\n');
console.log(`  USDC       ${after.usdc.toFixed(6)}   (was ${before.usdc.toFixed(6)}, spent ${(before.usdc - after.usdc).toFixed(6)})`);
console.log(`  ETH        ${after.eth.toFixed(8)}   (was ${before.eth.toFixed(8)}, gas ${(before.eth - after.eth).toFixed(8)})`);
console.log(`  allowance  ${(Number(await readAllowance()) / 1e6).toFixed(6)} USDC remaining`);

const row = await getPosition(position.id);
console.log('\n--- position row ---\n');
for (const key of ['id', 'user_id', 'status', 'asset', 'strike', 'strike_raw', 'expiry',
  'num_contracts_raw', 'premium_paid', 'tx_hash', 'option_address']) {
  console.log(`  ${key.padEnd(18)} ${row[key]}`);
}

console.log('\n--- event trail ---\n');
for (const e of await listPositionEvents(position.id)) {
  console.log(`  ${e.created_at}  ${(e.from_status ?? '-').padEnd(20)} -> ${(e.to_status ?? '-').padEnd(20)} ${e.event_type}`);
}
console.log();
