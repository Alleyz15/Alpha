// Fill an EXISTING pending position by id (IMPLEMENT.md tasks 3.7-3.9, 5.7).
//
//   node --env-file-if-exists=../.env scripts/fill-position.js
//       -> list the demo user's pending positions to choose from
//   node --env-file-if-exists=../.env scripts/fill-position.js <positionId>
//       -> dry run: verify + pre-flight checklist, broadcast nothing
//   node --env-file-if-exists=../.env scripts/fill-position.js <positionId> --confirm
//       -> SPENDS REAL USDC on a transaction that cannot be undone
//
// ---------------------------------------------------------------------------
// Why this script exists, and how it differs from fill.js
// ---------------------------------------------------------------------------
// POST /api/purchase writes a `pending` position and returns its id, but never
// broadcasts (REALITY.fill = 'operator'). fill.js builds its OWN quote and row,
// so it cannot complete a position the API already created. This script fills
// an EXISTING pending position by id, over the same prepareFill/executeFill
// path fill.js uses. It is the operator half of the frontend purchase flow.
//
// The one deliberate difference: this NEVER deletes the row. fill.js discards
// its own throwaway rows on a dry run or a blocked checklist. Here the row is a
// real user's purchase intent, written by the API before anything is broadcast
// (BR-14); deleting it on a failed pre-flight would erase the pending position
// and punch a hole in the audit trail. On any non-broadcast outcome the row is
// left `pending`, and the operator re-runs or the user re-quotes.

import { getPosition, listPositionsByUser, listPositionEvents } from '../src/db/positions.js';
import { getQuote } from '../src/db/quotes.js';
import { getDemoUser } from '../src/api/demoUser.js';
import { getWalletBalances } from '../src/thetanuts/wallet.js';
import { readAllowance } from '../src/thetanuts/allowance.js';
import { getWalletAddressChecksummed } from '../src/thetanuts/signer.js';
import { prepareFill, executeFill } from '../src/thetanuts/fill.js';
import { formatPreflight } from '../src/thetanuts/preflight.js';

const args = process.argv.slice(2);
const confirmed = args.includes('--confirm');
const positionId = args.find((a) => !a.startsWith('--')) ?? null;

// --- no id: list pending positions to choose from ---------------------------
// Read-only. A pending position is created by POST /api/purchase; this shows
// the operator which ones are waiting to be filled and how to fill them.

if (!positionId) {
  const user = await getDemoUser();
  const pending = (await listPositionsByUser(user.id)).filter((p) => p.status === 'pending');

  console.log(`\n--- ${user.display_name}'s pending positions ---\n`);
  if (pending.length === 0) {
    console.log('  none. A pending position is created by POST /api/purchase.\n');
    process.exit(0);
  }

  for (const p of pending) {
    const quote = p.quote_id ? await getQuote(p.quote_id) : null;
    console.log(`  ${p.id}`);
    console.log(`    $${p.strike} floor | expires ${p.expiry.slice(0, 16).replace('T', ' ')} UTC` +
      ` | ${Number(p.num_contracts_raw) / 1e6} contracts` +
      (quote ? ` | premium ${Number(quote.premium).toFixed(6)} USDC` : ''));
  }

  console.log(`\n  Dry run:   node scripts/fill-position.js <positionId>`);
  console.log(`  Broadcast: node scripts/fill-position.js <positionId> --confirm\n`);
  process.exit(0);
}

// --- an id was given: verify it is fillable ---------------------------------

const position = await getPosition(positionId);

if (!position) {
  console.error(`\n  position ${positionId} not found.\n`);
  process.exit(1);
}

if (position.status !== 'pending') {
  console.error(`\n  position ${positionId} is '${position.status}', not 'pending'.`);
  console.error('  Only a pending position may be filled. Nothing was done.\n');
  process.exit(1);
}

const before = await getWalletBalances();
const allowance = await readAllowance();

console.log('\n--- wallet before ---\n');
console.log(`  address    ${getWalletAddressChecksummed()}`);
console.log(`  USDC       ${before.usdc.toFixed(6)}`);
console.log(`  ETH        ${before.eth.toFixed(8)}`);
console.log(`  allowance  ${(Number(allowance) / 1e6).toFixed(6)} USDC to OptionBook`);

const quote = position.quote_id ? await getQuote(position.quote_id) : null;

console.log(`\n--- what this fills ---\n`);
console.log(`  position   ${position.id}`);
console.log(`  asset      ${position.asset}`);
console.log(`  floor      $${position.strike}`);
console.log(`  expiry     ${position.expiry.slice(0, 10)}`);
console.log(`  contracts  ${Number(position.num_contracts_raw) / 1e6}`);
if (quote) console.log(`  premium    ${Number(quote.premium).toFixed(6)} USDC   <-- what it spends`);

// --- pre-flight (BR-28); broadcasts nothing ---------------------------------

console.log('\n--- pre-flight checklist ---\n');
const prepared = await prepareFill(position.id);

if (!prepared.preflight) {
  // The quoted order has left the book, so there is nothing to simulate (BR-44).
  console.log(`  BLOCKED: ${prepared.reason}`);
  console.log('\n  Nothing was broadcast. The row is left pending (BR-14) — re-quote if needed.\n');
  process.exit(1);
}

console.log(formatPreflight(prepared.preflight));

if (!prepared.ready) {
  console.log('\n  Nothing was broadcast. The row is left pending (BR-14).\n');
  process.exit(1);
}

if (!confirmed) {
  const spend = (Number(prepared.usdcAmountRaw) / 1e6).toFixed(6);
  console.log('\n  DRY RUN — every check passed but --confirm was not given.');
  console.log(`  Re-run with --confirm to spend ${spend} USDC. This cannot be undone.`);
  console.log('  The row is left pending until then.\n');
  process.exit(0);
}

// --- broadcast (BR-14: the row already exists and stays, whatever happens) --

console.log('\n--- broadcasting ---\n');
console.log('  sending fillOrder... do not interrupt.');

let result;
try {
  result = await executeFill(position.id, { confirmed: true });
} catch (error) {
  // executeFill has already moved the row to failed or pending_verification and
  // raised guidance; it never retries. Surface the resulting status and stop.
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
