// Disburse a loan against a filled put (IMPLEMENT.md 7.3).
//
//   node --env-file-if-exists=../.env scripts/disburse.js <POSITION_ID> <RECIPIENT>
//   node --env-file-if-exists=../.env scripts/disburse.js <POSITION_ID> <RECIPIENT> --confirm
//
// ---------------------------------------------------------------------------
// WITHOUT --confirm this derives the limit, runs the checklist and stops.
// WITH --confirm it SENDS REAL USDC. A transfer cannot be recalled.
// ---------------------------------------------------------------------------
//
// By default it disburses the FULL credit limit, so the amount on BaseScan is
// exactly strike x contracts - the derivation is visible rather than explained.
// Pass --principal <USDC> to draw less.

import { getPosition } from '../src/db/positions.js';
import { creditLimitFor, interestRateAnnualPct } from '../src/lending/credit.js';
import { runDisbursePreflight, formatDisbursePreflight, disburse } from '../src/lending/disburse.js';
import { getWalletBalances } from '../src/thetanuts/wallet.js';
import { getWalletAddressChecksummed } from '../src/thetanuts/signer.js';
import { db } from '../src/db/client.js';

const positionId = process.argv[2];
const recipient = process.argv[3];
const confirmed = process.argv.includes('--confirm');
const pIdx = process.argv.indexOf('--principal');
const principalArg = pIdx > -1 ? Number(process.argv[pIdx + 1]) : null;

if (!positionId || !recipient) {
  console.error('usage: node scripts/disburse.js <POSITION_ID> <RECIPIENT> [--principal USDC] [--confirm]');
  process.exit(1);
}

const position = await getPosition(positionId);
if (!position) {
  console.error(`position ${positionId} not found`);
  process.exit(1);
}

const limit = creditLimitFor(position);
const principalRaw = principalArg === null
  ? limit.creditLimitRaw
  : BigInt(Math.round(principalArg * 1e6));

const before = await getWalletBalances();

console.log('\n--- the loan ---\n');
console.log(`  backing put   ${position.id}`);
console.log(`  option        ${position.option_address}`);
console.log(`  status        ${position.status}`);
console.log(`  expiry        ${position.expiry}`);
console.log('');
console.log(`  strike        $${limit.strike}`);
console.log(`  contracts     ${limit.contracts}`);
console.log(`  CREDIT LIMIT  $${limit.creditLimitUsdc}   <-- strike x contracts (BR-39)`);
console.log(`  principal     $${Number(principalRaw) / 1e6}${principalArg === null ? '   (full limit)' : ''}`);
console.log(`  interest      ${interestRateAnnualPct()}% annual`);
console.log(`  due           ${position.expiry}   (= the put's expiry, BR-48)`);
console.log('');
console.log(`  from          ${getWalletAddressChecksummed()}   (${before.usdc.toFixed(6)} USDC)`);
console.log(`  to            ${recipient}`);

console.log('\n--- pre-flight ---\n');
const pre = await runDisbursePreflight({ position, recipient, principalRaw });
console.log(formatDisbursePreflight(pre));

if (!pre.pass) {
  console.log('\n  Nothing was sent.\n');
  process.exit(1);
}

if (!confirmed) {
  console.log('\n  DRY RUN — every check passed but --confirm was not given.');
  console.log(`  Re-run with --confirm to send $${Number(principalRaw) / 1e6} USDC. This cannot be recalled.\n`);
  process.exit(0);
}

console.log('\n--- sending ---\n');
console.log('  transferring USDC... do not interrupt.');

let result;
try {
  result = await disburse({ positionId, recipient, principalRaw, confirmed: true });
} catch (error) {
  console.error(`\n  ${error.message}\n`);
  process.exit(1);
}

console.log('\n  SENT');
console.log(`  loan          ${result.loanId}`);
console.log(`  tx            ${result.txHash}`);
console.log(`  BaseScan      ${result.explorerUrl}`);
console.log(`  principal     $${result.principalUsdc}`);
console.log(`  credit limit  $${result.creditLimitUsdc}   (equal — the derivation is the transfer)`);

const after = await getWalletBalances();
console.log('\n--- wallet after (read from chain) ---\n');
console.log(`  USDC  ${after.usdc.toFixed(6)}  (was ${before.usdc.toFixed(6)})`);
console.log(`  ETH   ${after.eth.toFixed(8)}  (was ${before.eth.toFixed(8)})`);

const { data: row } = await db.from('loans').select('*').eq('id', result.loanId).single();
console.log('\n--- loan row ---\n');
for (const k of ['id', 'user_id', 'position_id', 'status', 'principal', 'credit_limit',
  'interest_rate', 'collateral_amount', 'recipient_address', 'disbursement_tx', 'due_at']) {
  console.log(`  ${k.padEnd(18)} ${row[k]}`);
}
console.log();
