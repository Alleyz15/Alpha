// Grant the OptionBook an exact USDC allowance (IMPLEMENT.md task 3.4).
//
//   node --env-file-if-exists=../.env scripts/approve.js <USDC_AMOUNT>
//   node --env-file-if-exists=../.env scripts/approve.js <USDC_AMOUNT> --confirm
//
// ---------------------------------------------------------------------------
// WITHOUT --confirm this reports what it would do and sends nothing.
// WITH --confirm it SENDS A TRANSACTION.
// ---------------------------------------------------------------------------
//
// What it spends: gas only, a fraction of a cent on Base.
// What it moves:  no USDC. An approval authorises a later transfer of at most
//                 the amount given; it does not transfer anything itself.
// Reversible:     yes - approve 0 to revoke.
//
// It is a separate script from the pre-flight check on purpose. A check that
// silently sends a transaction is a check nobody can run freely.

import { ethers } from 'ethers';
import { getWalletAddressChecksummed } from '../src/thetanuts/signer.js';
import { ensureExactAllowance, readAllowance } from '../src/thetanuts/allowance.js';
import { getWalletBalances, optionBookAddress, usdcAddress } from '../src/thetanuts/wallet.js';

const amountArg = process.argv[2];
const confirmed = process.argv.includes('--confirm');

if (!amountArg || !Number.isFinite(Number(amountArg)) || Number(amountArg) <= 0) {
  console.error('usage: node scripts/approve.js <USDC_AMOUNT> [--confirm]');
  console.error('example: node scripts/approve.js 3');
  process.exit(1);
}

const amountRaw = BigInt(Math.round(Number(amountArg) * 1e6));

const balances = await getWalletBalances();
const current = await readAllowance();

console.log('\n--- USDC approval ---\n');
console.log(`  wallet        ${getWalletAddressChecksummed()}`);
console.log(`  USDC held     ${balances.usdc.toFixed(6)}`);
console.log(`  ETH held      ${balances.eth.toFixed(8)}`);
console.log(`  token         ${usdcAddress()}`);
console.log(`  spender       ${optionBookAddress()}  (OptionBook)`);
console.log(`  allowance now ${(Number(current) / 1e6).toFixed(6)} USDC`);
console.log(`  requested     ${Number(amountArg).toFixed(6)} USDC`);

if (current === ethers.MaxUint256) {
  console.log('\n  WARNING: the existing allowance is UNBOUNDED (MaxUint256).');
  console.log('  Revoke it with `node scripts/approve.js 0.000001 --confirm` and re-approve (BR-12).');
}

if (!confirmed) {
  const result = await ensureExactAllowance(amountRaw, { dryRun: true });
  console.log(`\n  DRY RUN — nothing sent. ${result.reason}.`);
  if (result.before < amountRaw) {
    console.log('\n  This would send ONE transaction:');
    console.log(`    approve(${optionBookAddress()}, ${Number(amountArg).toFixed(6)} USDC)`);
    console.log('    Spends gas only. Moves no USDC. Reversible by approving 0.');
    console.log('\n  Re-run with --confirm to send it.');
  }
  process.exit(0);
}

console.log('\n  sending approval...');
const result = await ensureExactAllowance(amountRaw);

console.log(`  ${result.reason}`);
console.log(`  allowance ${(Number(result.before) / 1e6).toFixed(6)} -> ${(Number(result.after) / 1e6).toFixed(6)} USDC`);
if (result.txHash) {
  console.log(`  tx        ${result.txHash}`);
  console.log(`  BaseScan  https://basescan.org/tx/${result.txHash}`);
}
console.log();
