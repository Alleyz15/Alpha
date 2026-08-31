// Loan repayment, operator side (IMPLEMENT.md 7.4).
//
//   node --env-file-if-exists=../.env scripts/repay.js request [LOAN_ID]
//   node --env-file-if-exists=../.env scripts/repay.js confirm <TX_HASH> [LOAN_ID]
//
// ---------------------------------------------------------------------------
// THIS SCRIPT BROADCASTS NOTHING. It cannot: we do not hold the borrower's key.
// ---------------------------------------------------------------------------
//
//   request   fixes what is owed, records it, and prints the transfer to make
//   confirm   verifies a transaction on chain and marks the loan repaid
//
// Between the two, a human sends the USDC from the borrower's own wallet. That
// is the point rather than a limitation: a borrower who signs their own
// repayment is a more honest demonstration than a lender who signs it for them,
// and it means there is no second private key to keep out of a public repo.
//
// If `confirm` fails any check the loan stays at 'repaying' and nothing is
// written. Never assume a payment landed because a hash exists.

import { db } from '../src/db/client.js';
import { requestRepayment, confirmRepayment, formatChecks, amountOwed } from '../src/lending/repay.js';
import { getWalletAddressChecksummed } from '../src/thetanuts/signer.js';

const command = process.argv[2];

if (!['request', 'confirm'].includes(command)) {
  console.error('usage: node scripts/repay.js request [LOAN_ID]');
  console.error('       node scripts/repay.js confirm <TX_HASH> [LOAN_ID]');
  process.exit(1);
}

/** Default to the only repayable loan, so the common case needs no id. */
async function resolveLoan(explicitId) {
  if (explicitId) {
    const { data, error } = await db.from('loans').select('*').eq('id', explicitId).single();
    if (error) throw new Error(`no loan ${explicitId}: ${error.message}`);
    return data;
  }
  const { data, error } = await db.from('loans').select('*').in('status', ['active', 'repaying']);
  if (error) throw new Error(error.message);
  if ((data ?? []).length !== 1) {
    console.error(`\n  ${(data ?? []).length} repayable loans — name one explicitly:`);
    for (const l of data ?? []) console.error(`    ${l.id}  ${l.status}  ${l.principal} USDC`);
    process.exit(1);
  }
  return data[0];
}

if (command === 'request') {
  const loan = await resolveLoan(process.argv[3]);
  const result = await requestRepayment(loan.id);
  const { owed, transfer } = result;

  console.log('\n--- what this loan owes ---\n');
  console.log(`  loan            ${loan.id}`);
  console.log(`  principal       ${owed.principalUsdc.toFixed(6)} USDC`);
  console.log(`  interest        ${owed.interestUsdc.toFixed(6)} USDC` +
    `   (${owed.annualRatePct}%/yr over ${owed.termDays.toFixed(4)} days, from the stored rate)`);
  console.log(`  TOTAL OWED      ${owed.totalUsdc.toFixed(6)} USDC`);

  if (result.alreadyFixed) {
    console.log(`\n  NOTE: a figure was already recorded for this loan and has not been changed.`);
    console.log(`        Owed stands at ${transfer.amountUsdc.toFixed(6)} USDC.`);
  }

  console.log('\n--- the transfer to make ---\n');
  console.log(`  token           ${transfer.token}   (USDC)`);
  console.log(`  from            ${transfer.from}`);
  console.log(`  to              ${getWalletAddressChecksummed()}`);
  console.log(`  amount          ${transfer.amountUsdc.toFixed(6)} USDC`);
  console.log(`  amount (raw)    ${transfer.amountRaw}   <-- exact, 6 decimals`);

  console.log('\n  The loan row now reads \'repaying\'. That is the record that a');
  console.log('  repayment was requested and its outcome is not yet known.');
  console.log('\n  Send it from the borrower\'s wallet, then:');
  console.log(`\n    npm run repay:confirm -- <TX_HASH>\n`);
  process.exit(0);
}

// --- confirm ---------------------------------------------------------------
const txHash = process.argv[3];
if (!/^0x[0-9a-fA-F]{64}$/.test(txHash ?? '')) {
  console.error('usage: node scripts/repay.js confirm <TX_HASH> [LOAN_ID]');
  process.exit(1);
}

const loan = await resolveLoan(process.argv[4]);

console.log(`\n--- verifying ${txHash} ---\n`);
const result = await confirmRepayment(loan.id, txHash);
console.log(formatChecks(result.checks));

if (!result.ok) {
  console.log(`\n  NOT CONFIRMED. Loan ${loan.id} stays '${loan.status}' and nothing was written.`);
  console.log('  Check the hash on BaseScan before re-running. A failed check here');
  console.log('  means the transaction is not the repayment, not that money is lost.\n');
  process.exit(1);
}

console.log('\n  REPAID\n');
console.log(`  loan            ${result.loan.id}`);
console.log(`  status          ${result.loan.status}`);
console.log(`  repayment_tx    ${result.loan.repayment_tx}`);
console.log(`  BaseScan        https://basescan.org/tx/${result.loan.repayment_tx}`);
console.log(`  amount          ${Number(result.loan.repayment_expected).toFixed(6)} USDC\n`);
