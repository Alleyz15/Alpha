// Buy a two-day principal-protected deposit (IMPLEMENT.md Phase 8).
//
//   node --env-file-if-exists=../.env scripts/vault.js <PRINCIPAL_USDC> [--confirm]
//
// WITHOUT --confirm this prices the deposit, runs the pre-flight and stops.
// WITH --confirm it BUYS A REAL CALL ON BASE MAINNET. Irreversible.
//
// ---------------------------------------------------------------------------
// THIS SCRIPT NO LONGER CONTAINS THE LOGIC. THAT IS THE POINT.
// ---------------------------------------------------------------------------
//
// The flow used to live here, inline, and it wrote the vaults row AFTER the
// fill - so a process that died in between left an option nobody had a record
// of owning. It now lives in src/vault/deposit.js and is called by both this
// script and POST /api/vault/deposit, so there is exactly one path to spending
// money. Two paths would mean two things that can be wrong, and only one of
// them would ever get the next fix.

import { depositToVault, runDepositPreflight, defaultDepositDeps } from '../src/vault/deposit.js';
import { yieldRateAnnualPct } from '../src/vault/vault.js';
import { getDemoUser } from '../src/api/demoUser.js';
import { getWalletBalances } from '../src/thetanuts/wallet.js';
import { getWalletAddressChecksummed } from '../src/thetanuts/signer.js';

const principalUsdc = Number(process.argv[2]);
const confirmed = process.argv.includes('--confirm');

if (!Number.isFinite(principalUsdc) || principalUsdc <= 0) {
  console.error('usage: node scripts/vault.js <PRINCIPAL_USDC> [--confirm]');
  console.error('example: node scripts/vault.js 3');
  process.exit(1);
}

const user = await getDemoUser();
const deps = await defaultDepositDeps();
const before = await getWalletBalances();

// The SAME pre-flight the buy runs. A dry run that exercises a different path
// is not a dry run.
const pre = await runDepositPreflight({ principalUsdc }, deps);
const q = pre.quote;

console.log('\n--- principal protection, with a small share of the upside ---\n');
console.log(`  deposit             ${q.principalUsdc} USDC`);
console.log(`  term                ${q.daysToExpiry.toFixed(2)} days  (matures ${q.expiry.toISOString().slice(0, 10)})`);
console.log('');
console.log(`  set aside           ${q.yieldPortion} USDC   <-- SIMULATED yield at ${yieldRateAnnualPct()}%/yr (BR-37)`);
console.log(`  spent on upside     ${q.optionPortion} USDC   <-- real, buys the call`);
console.log(`  returns at maturity ${q.principalUsdc} USDC guaranteed, plus any call payout`);
console.log('');
console.log(`  ${q.asset} spot            $${q.spot.toFixed(2)}`);
console.log(`  call strike         $${q.strike}`);
console.log(`  premium paid        $${q.premiumPerContract}/contract   <-- REAL, from the live book`);
console.log(`  contracts           ${q.contracts.toFixed(6)}`);
console.log(`  exposure            $${q.exposureUsdc}`);
console.log(`  PARTICIPATION       ${q.participationPct}%   <-- exposure / deposit, derived (BR-38)`);
console.log('');
console.log(`  You keep ${q.participationPct}% of any ${q.asset} rise above $${q.strike} over ${q.daysToExpiry.toFixed(1)} days.`);
console.log(`  The ${q.yieldPortion} USDC set aside is SIMULATED — no yield source exists (BR-37).`);

console.log('\n--- wallet ---\n');
console.log(`  ${getWalletAddressChecksummed()}`);
console.log(`  USDC ${before.usdc.toFixed(6)} | spending ${q.optionPortion} on the call`);

console.log('\n--- pre-flight ---\n');
for (const c of pre.checks) {
  console.log(`  ${c.pass ? 'PASS' : 'FAIL'}   ${c.label.padEnd(42)} ${c.detail}`);
}

if (!pre.pass) {
  console.log('\n  BLOCKED — a check failed. Nothing was written and nothing was sent.\n');
  process.exit(1);
}

if (!confirmed) {
  console.log(`\n  DRY RUN — every check passed but --confirm was not given.`);
  console.log(`  Re-run with --confirm to spend ${q.optionPortion} USDC on a real call.`);
  console.log('  This cannot be undone.\n');
  process.exit(0);
}

console.log('\n--- buying the call ---\n');

let result;
try {
  result = await depositToVault(
    { userId: user.id, asset: q.asset, principalUsdc, confirmed: true },
    deps,
  );
} catch (error) {
  // Three outcomes, and they are not interchangeable. The codes come from
  // depositToVault so this does not have to read prose to tell them apart.
  console.error(`\n  ${error.message}\n`);

  if (error.code === 'DEPOSIT_OUTCOME_UNKNOWN') {
    console.error('  The transaction MAY have landed. DO NOT RUN THIS AGAIN.');
    console.error(`  vault ${error.vaultId} stays 'pending', position ${error.positionId} stays`);
    console.error("  'pending_verification'. Check BaseScan and resolve by hand.\n");
  } else if (error.code === 'DEPOSIT_REVERTED') {
    console.error('  Nothing was bought and nothing was spent. Both rows are marked failed.\n');
  } else if (error.code === 'DEPOSIT_PREFLIGHT_FAILED') {
    console.error('  Nothing was written and nothing was sent.\n');
  }
  process.exit(1);
}

console.log('  CONFIRMED');
console.log(`  tx            ${result.txHash}`);
console.log(`  BaseScan      ${result.explorerUrl}`);
console.log(`  option        ${result.optionAddress ?? 'UNCONFIRMED — not found in receipt logs'}`);
console.log(`  vault         ${result.vault.id}`);
console.log(`  position      ${result.position.id}`);

if (!result.contractsConfirmed) {
  console.log('\n  NOTE: the on-chain contract count could not be confirmed. The row keeps the');
  console.log('  quoted count; run reconcile to correct it.');
}

console.log('\n--- vault row ---\n');
for (const k of ['id', 'status', 'principal', 'yield_portion', 'option_portion',
  'yield_rate_annual', 'participation_rate', 'exposure_usdc', 'maturity']) {
  console.log(`  ${k.padEnd(20)} ${result.vault[k]}`);
}

const after = await getWalletBalances();
console.log('\n--- wallet after ---\n');
console.log(`  USDC  ${after.usdc.toFixed(6)}  (was ${before.usdc.toFixed(6)})`);
console.log();
