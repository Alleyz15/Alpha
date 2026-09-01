// Vault maturity, operator side (IMPLEMENT.md 8.6).
//
//   node --env-file-if-exists=../.env scripts/mature.js <RECIPIENT>
//   node --env-file-if-exists=../.env scripts/mature.js <RECIPIENT> --confirm
//
// ---------------------------------------------------------------------------
// WITHOUT --confirm this runs the checklist and stops.
// WITH --confirm it SENDS REAL USDC. The transfer cannot be recalled.
// ---------------------------------------------------------------------------
//
// The runbook is docs/RUNBOOK.md. Read it first if you have not run this
// before - it says what a correct output looks like and what to do when a check
// fails.

import { db } from '../src/db/client.js';
import { runMaturityPreflight, formatMaturityPreflight, matureVault } from '../src/vault/maturity.js';
import { getWalletBalances } from '../src/thetanuts/wallet.js';
import { getWalletAddressChecksummed } from '../src/thetanuts/signer.js';

const recipient = process.argv[2];
const confirmed = process.argv.includes('--confirm');

if (!/^0x[0-9a-fA-F]{40}$/.test(recipient ?? '')) {
  console.error('usage: node scripts/mature.js <RECIPIENT_ADDRESS> [--confirm]');
  console.error('example: node scripts/mature.js 0xc169c7c000cAA28807Ab2585D707C7A6457d718E');
  process.exit(1);
}

// The one vault that can mature. If there is ever more than one, this refuses
// rather than guessing which - paying the wrong vault is not recoverable.
const { data: vaults, error } = await db.from('vaults').select('*').in('status', ['active', 'maturing']);
if (error) throw new Error(error.message);

if ((vaults ?? []).length !== 1) {
  console.error(`\n  ${(vaults ?? []).length} vaults are in a maturable state. Expected exactly 1.`);
  for (const v of vaults ?? []) console.error(`    ${v.id}  ${v.status}  ${v.principal} USDC`);
  console.error('\n  Refusing to guess which one to pay.\n');
  process.exit(1);
}

const vault = vaults[0];
const { data: position } = await db.from('positions').select('*').eq('id', vault.position_id).single();

const before = await getWalletBalances();

console.log('\n--- the deposit ---\n');
console.log(`  vault           ${vault.id}`);
console.log(`  deposit         ${vault.principal} USDC   <-- SIMULATED: seeded, never deposited (BR-50)`);
console.log(`  matures         ${new Date(vault.maturity).toISOString()}`);
console.log(`  participation   ${vault.participation_rate}%   <-- from the real premium paid (BR-38)`);
console.log(`  backing call    ${position?.option_address ?? '(none)'}`);
console.log(`  call strike     $${position?.strike}`);

console.log('\n--- wallet ---\n');
console.log(`  address         ${getWalletAddressChecksummed()}`);
console.log(`  USDC            ${before.usdc.toFixed(6)}`);
console.log(`  ETH             ${before.eth.toFixed(8)}`);

console.log('\n--- maturity checklist ---\n');
const preflight = await runMaturityPreflight({ vault, position, recipient });
console.log(formatMaturityPreflight(preflight));

if (preflight.owed) {
  console.log('\n--- what would be sent ---\n');
  console.log(`  principal       ${preflight.owed.principalUsdc.toFixed(6)} USDC   returned whole`);
  console.log(`  call payout     ${preflight.owed.payoutUsdc.toFixed(6)} USDC`);
  console.log(`  TOTAL           ${preflight.owed.totalUsdc.toFixed(6)} USDC`);
  console.log(`  to              ${recipient}`);
  if (preflight.owed.payoutUsdc === 0) {
    console.log('\n  A zero payout is the EXPECTED outcome. The call was bought above');
    console.log('  spot; if the price finished below it, it expires unused and the');
    console.log('  depositor still gets every cent of principal back. That is the');
    console.log('  promise working, not a failure.');
  }
}

if (!preflight.pass) {
  console.log('\n  Nothing was sent. See docs/RUNBOOK.md for what each failure means.\n');
  process.exit(1);
}

if (!confirmed) {
  console.log('\n  DRY RUN — every check passed but --confirm was not given.');
  console.log(`  Re-run with --confirm to send ${preflight.owed.totalUsdc.toFixed(6)} USDC. This cannot be undone.\n`);
  process.exit(0);
}

console.log('\n--- broadcasting ---\n');
console.log('  sending transfer... do not interrupt.');

let result;
try {
  result = await matureVault({ vaultId: vault.id, recipient, confirmed: true });
} catch (err) {
  console.error(`\n  ${err.message}\n`);
  process.exit(1);
}

console.log('\n  MATURED\n');
console.log(`  tx              ${result.txHash}`);
console.log(`  BaseScan        ${result.explorerUrl}`);
console.log(`  returned        ${result.totalUsdc.toFixed(6)} USDC`);

const after = await getWalletBalances();
console.log('\n--- wallet after (read from chain) ---\n');
console.log(`  USDC            ${after.usdc.toFixed(6)}   (was ${before.usdc.toFixed(6)})`);
console.log(`  ETH             ${after.eth.toFixed(8)}   (gas ${(before.eth - after.eth).toFixed(8)})`);
console.log();
