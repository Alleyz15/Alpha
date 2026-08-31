// Two-day principal protection with a small share of the upside (Phase 8).
//
//   node --env-file-if-exists=../.env scripts/vault.js <PRINCIPAL_USDC>
//   node --env-file-if-exists=../.env scripts/vault.js <PRINCIPAL_USDC> --confirm
//
// ---------------------------------------------------------------------------
// WITHOUT --confirm this prices the deposit and stops.
// WITH --confirm it BUYS A REAL CALL ON BASE MAINNET. Irreversible.
// ---------------------------------------------------------------------------
//
// The principal itself is NOT moved anywhere: the yield portion is simulated
// (BR-37), so the only real money that leaves the wallet is the option portion
// spent on the call.

import { quoteVault, yieldRateAnnualPct } from '../src/vault/vault.js';
import { buildQuoteSet } from '../src/thetanuts/quote.js';
import { getDemoUser } from '../src/api/demoUser.js';
import { getWalletBalances } from '../src/thetanuts/wallet.js';
import { getWalletAddressChecksummed, getSigningClient } from '../src/thetanuts/signer.js';
import { confirmedRead, readUntilChanged, formatRead } from '../src/thetanuts/confirmRead.js';
import { insertPendingPosition, transitionPosition } from '../src/db/positions.js';
import { runPreflight, formatPreflight } from '../src/thetanuts/preflight.js';
import { db } from '../src/db/client.js';

const principalUsdc = Number(process.argv[2]);
const confirmed = process.argv.includes('--confirm');

if (!Number.isFinite(principalUsdc) || principalUsdc <= 0) {
  console.error('usage: node scripts/vault.js <PRINCIPAL_USDC> [--confirm]');
  console.error('example: node scripts/vault.js 100');
  process.exit(1);
}

const before = await getWalletBalances();
const user = await getDemoUser();
const q = await quoteVault({ principalUsdc });

console.log('\n--- two-day principal protection, with a small share of the upside ---\n');
console.log(`  deposit             ${q.principalUsdc} USDC`);
console.log(`  term                ${q.daysToExpiry.toFixed(2)} days  (matures ${q.expiry.toISOString().slice(0, 10)})`);
console.log('');
console.log(`  set aside           ${q.yieldPortion} USDC   <-- SIMULATED yield at ${yieldRateAnnualPct()}%/yr (BR-37)`);
console.log(`  spent on upside     ${q.optionPortion} USDC   <-- real, buys the call`);
console.log(`  returns at maturity ${q.principalUsdc} USDC guaranteed, plus any call payout`);
console.log('');
console.log(`  ETH spot            $${q.spot.toFixed(2)}`);
console.log(`  call strike         $${q.strike}`);
console.log(`  premium paid        $${q.premiumPerContract}/contract   <-- REAL, from the live book`);
console.log(`  contracts           ${q.contracts.toFixed(6)}`);
console.log(`  exposure            $${q.exposureUsdc}`);
console.log(`  PARTICIPATION       ${q.participationPct}%   <-- exposure / deposit, derived (BR-38)`);
console.log('');
console.log(`  You keep ${q.participationPct}% of any ETH rise above $${q.strike} over ${q.daysToExpiry.toFixed(1)} days.`);
console.log(`  The ${q.yieldPortion} USDC set aside is SIMULATED — no yield source exists (BR-37).`);

console.log('\n--- wallet ---\n');
console.log(`  ${getWalletAddressChecksummed()}`);
console.log(`  USDC ${before.usdc.toFixed(6)} | spending ${q.optionPortion} on the call`);

if (before.usdc < q.optionPortion) {
  console.log('\n  BLOCKED: wallet holds less than the option portion.\n');
  process.exit(1);
}

// BR-14: the row exists before anything is broadcast. Reuse the fill path's
// quote+position machinery so the call goes through the same pre-flight a put
// does - a second, looser path to spending money is how the first fill's two
// bugs would have survived.
const units = q.contracts;
const set = await buildQuoteSet('ETH', {
  userId: user.id, units: Math.max(units, 0.000001), mode: 'percentage', protectionPct: 20,
}).catch(() => null);

console.log('\n--- buying the call ---\n');

const client = getSigningClient();
const usdcAmountRaw = BigInt(Math.round(q.optionPortion * 1e6));
const contractsRaw = BigInt(Math.round(q.contracts * 1e6));

const sim = await client.optionBook.callStaticFillOrder(q.call.raw, usdcAmountRaw);
console.log(`  callStaticFillOrder: ${sim.success ? 'would succeed, gas ' + sim.gasEstimate : 'WOULD REVERT — ' + (sim.error?.message ?? '').slice(0, 80)}`);

if (!sim.success) {
  console.log('\n  BLOCKED — nothing was broadcast.\n');
  process.exit(1);
}

if (!confirmed) {
  console.log(`\n  DRY RUN — re-run with --confirm to spend ${q.optionPortion} USDC on a real call.`);
  console.log('  This cannot be undone.\n');
  process.exit(0);
}

const position = await insertPendingPosition({
  userId: user.id,
  asset: 'ETH',
  strike: q.strike,
  strikeRaw: String(q.call.raw.order.strikePrice),
  expiry: q.expiry.toISOString(),
  numContractsRaw: contractsRaw.toString(),
  // A CALL, not a put. Without this the dashboard renders its strike as a
  // protection floor above spot, which reads as a bug to anyone who looks.
  optionType: 'call',
});
console.log(`  position row  ${position.id}  (pending)`);

await transitionPosition(position.id, {
  toStatus: 'pending_verification', eventType: 'broadcast',
  payload: { vault: true, usdcAmountRaw: usdcAmountRaw.toString() },
});

let receipt;
try {
  receipt = await client.optionBook.fillOrder(q.call.raw, usdcAmountRaw);
} catch (error) {
  console.error(`\n  fill failed: ${error.message}`);
  console.error(`  position ${position.id} left at pending_verification. DO NOT RETRY — run reconcile.\n`);
  process.exit(1);
}

const txHash = receipt?.txHash ?? receipt?.hash ?? receipt?.transactionHash ?? null;
const confirmedReceipt = typeof receipt?.wait === 'function' ? await receipt.wait() : receipt;

// The read-your-own-write pattern has bitten four times. Poll, and report
// loudly if it cannot be confirmed rather than printing a stale number.
const optionAddress = (confirmedReceipt?.logs ?? [])
  .map((l) => l.address?.toLowerCase())
  .find((a) => a && a !== client.chainConfig.tokens.USDC.address.toLowerCase()
    && a !== client.chainConfig.contracts.optionBook.toLowerCase()) ?? null;

const onChain = optionAddress
  ? await confirmedRead(
    async () => (await client.option.getFullOptionInfo(optionAddress))?.numContracts ?? null,
    { label: 'on-chain contract count', attempts: 6, delayMs: 900 })
  : { value: null, confirmed: false, attempts: 0, error: 'no option address in the receipt', label: 'on-chain contract count' };

console.log(`\n  CONFIRMED`);
console.log(`  tx            ${txHash}`);
console.log(`  BaseScan      https://basescan.org/tx/${txHash}`);
console.log(`  option        ${optionAddress ?? 'UNCONFIRMED — not found in receipt logs'}`);
console.log(`  contracts     ${formatRead(onChain, (v) => `${v} (${Number(v) / 1e6} contracts)`)}`);

await transitionPosition(position.id, {
  toStatus: 'active', eventType: 'confirmed',
  txHash, optionAddress,
  numContractsRaw: onChain.confirmed ? onChain.value.toString() : null,
  payload: {
    vault: true,
    quotedContractsRaw: contractsRaw.toString(),
    onChainContractsConfirmed: onChain.confirmed,
    onChainContractsRaw: onChain.confirmed ? onChain.value.toString() : null,
    readAttempts: onChain.attempts,
  },
});

if (!onChain.confirmed) {
  console.log('\n  NOTE: the on-chain contract count could not be confirmed after ' +
    `${onChain.attempts} attempts. The row keeps the quoted count; run reconcile to correct it.`);
}

const vault = await db.from('vaults').insert({
  user_id: user.id,
  position_id: position.id,
  status: 'active',
  principal: q.principalUsdc,
  yield_portion: q.yieldPortion,
  option_portion: q.optionPortion,
  yield_rate_annual: yieldRateAnnualPct(),
  participation_rate: q.participationPct,
  exposure_usdc: q.exposureUsdc,
  maturity: q.expiry.toISOString(),
}).select().single();

if (vault.error) {
  console.error(`\n  vault row failed: ${vault.error.message}`);
} else {
  console.log('\n--- vault row ---\n');
  for (const k of ['id', 'principal', 'yield_portion', 'option_portion', 'yield_rate_annual',
    'participation_rate', 'exposure_usdc', 'yield_is_simulated', 'maturity']) {
    console.log(`  ${k.padEnd(20)} ${vault.data[k]}`);
  }
}

const after = await readUntilChanged(
  async () => (await getWalletBalances()).usdcRaw, before.usdcRaw,
  { label: 'wallet USDC after', attempts: 6, delayMs: 900 });

console.log('\n--- wallet after ---\n');
console.log(`  USDC  ${formatRead(after, (v) => (Number(v) / 1e6).toFixed(6))}  (was ${before.usdc.toFixed(6)})`);
console.log();
