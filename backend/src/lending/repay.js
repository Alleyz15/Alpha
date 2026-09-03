// Loan repayment (IMPLEMENT.md 7.4).
//
// ---------------------------------------------------------------------------
// THIS BROADCASTS NOTHING. It records what is owed, and verifies what arrived.
// ---------------------------------------------------------------------------
//
// The repayment is sent by the borrower, not by us. We hold one private key -
// the burner's - and deliberately do not hold a second: BR-18 says never commit
// or log a private key, and the surest way to honour that is not to have one to
// protect. A borrower who signs their own repayment is also a more honest
// demonstration than a lender who signs it for them.
//
// So the discipline that governs a broadcast is kept, with the broadcast step
// belonging to a human:
//
//   1. compute what is owed from the STORED terms
//   2. write the row BEFORE anything moves        <- 'repaying' (BR-14's logic)
//   3. the operator sends the transfer
//   4. verify it on chain against the stored figure
//   5. only then mark it repaid
//
// Never assume. A verification that cannot find the transaction leaves the loan
// at 'repaying' and says so; it does not guess, and it never marks a loan repaid
// on anything but a confirmed transfer of the right token, amount, sender and
// recipient.

import { ethers } from 'ethers';

// The database client, the token address and the signer are imported INSIDE the
// functions that use them. Each throws at module load without credentials, and
// amountOwed() is pure arithmetic that needs none of them - a static import
// would make the money calculation untestable without a live database and a
// private key, which is how the part most worth testing ends up untested.

const USDC_SCALE = 1_000_000n;
const usdc = (raw) => Number(raw) / Number(USDC_SCALE);

/** ERC-20 Transfer(address,address,uint256). */
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

/**
 * The ERC-20 Transfer events in a receipt, for one token.
 *
 * ---------------------------------------------------------------------------
 * A RECEIPT'S `to` AND `value` SAY NOTHING ABOUT AN ERC-20 TRANSFER.
 * ---------------------------------------------------------------------------
 *
 * `value` is the ETH sent, which for a token transfer is zero. `to` is the
 * TOKEN CONTRACT, not the recipient. A check written against those two fields
 * accepts any transaction sent to USDC - one that transferred nothing, one that
 * transferred to somebody else, one that failed for a reason the status alone
 * would catch but the amount would not.
 *
 * The truth is in the logs. `from` and `to` are indexed, so they arrive as
 * topics 1 and 2, left-padded to 32 bytes; the amount is the unindexed data
 * word. This function decodes exactly that and nothing else.
 *
 * Note that it takes LOGS, not a receipt. There is deliberately no way to pass
 * it a transaction's own `to` and `value`, because there is no correct use for
 * them here.
 *
 * @param {Array<{address:string, topics:string[], data:string}>} logs
 * @param {string} token - the token contract whose transfers count
 * @returns {Array<{from:string, to:string, value:bigint}>} lowercased addresses
 */
export function usdcTransfersIn(logs, token) {
  const want = String(token).toLowerCase();

  return (logs ?? [])
    .filter((l) => String(l.address).toLowerCase() === want && l.topics?.[0] === TRANSFER_TOPIC)
    .map((l) => ({
      from: ethers.getAddress('0x' + l.topics[1].slice(26)).toLowerCase(),
      to: ethers.getAddress('0x' + l.topics[2].slice(26)).toLowerCase(),
      value: BigInt(l.data),
    }));
}

/**
 * What a loan owes, from its STORED terms.
 *
 * Principal, rate and due date all come off the row, never from the
 * environment. The loan was written at a particular rate; editing .env later
 * must not change what a borrower owes, and that kind of bug would not surface
 * until it mattered.
 *
 * The term runs from disbursement to due_at - the whole life of the loan, not
 * the part of it that has elapsed. Interest is simple, matching how the credit
 * limit reserves it (BR-39).
 *
 * @param {object} loan - a loans row
 * @returns {{principalUsdc:number, interestUsdc:number, totalUsdc:number, totalRaw:bigint, termDays:number, annualRatePct:number}}
 */
export function amountOwed(loan) {
  const principalUsdc = Number(loan.principal);
  const annualRatePct = Number(loan.interest_rate);

  if (!(principalUsdc > 0)) {
    throw new Error(`amountOwed: loan ${loan.id} has a non-positive principal`);
  }
  if (!Number.isFinite(annualRatePct) || annualRatePct < 0) {
    throw new Error(`amountOwed: loan ${loan.id} has no usable interest_rate`);
  }

  const start = new Date(loan.created_at);
  const due = new Date(loan.due_at);
  const termDays = Math.max(0, (due - start) / 86_400_000);

  const interestUsdc = principalUsdc * (annualRatePct / 100) * (termDays / 365);
  const totalUsdc = principalUsdc + interestUsdc;

  // Round UP to the micro-unit. A borrower who sends the rounded-down figure is
  // a fraction short, and "close enough" is not a property a ledger should have.
  const totalRaw = BigInt(Math.ceil(totalUsdc * 1e6));

  return {
    principalUsdc,
    interestUsdc,
    totalUsdc: Number(totalRaw) / 1e6,
    totalRaw,
    termDays,
    annualRatePct,
  };
}

/**
 * Record that a repayment is expected, and return the exact transfer to make.
 *
 * Writes the row BEFORE the money moves. A loan left at 'repaying' is the trace
 * that a repayment was requested and its outcome is unknown - which is a
 * different and more useful thing than a gap.
 *
 * @param {string} loanId
 * @returns {Promise<object>} the loan row and the transfer instruction
 */
export async function requestRepayment(loanId) {
  const { db, unwrap } = await import('../db/client.js');
  const { usdcAddress } = await import('../thetanuts/wallet.js');
  const { getWalletAddress } = await import('../thetanuts/signer.js');

  const loan = unwrap(
    await db.from('loans').select('*').eq('id', loanId).single(),
    'requestRepayment: reading the loan',
  );

  if (loan.status === 'repaid') {
    throw new Error(`requestRepayment: loan ${loanId} is already repaid (tx ${loan.repayment_tx})`);
  }
  if (!['active', 'repaying'].includes(loan.status)) {
    throw new Error(`requestRepayment: loan ${loanId} is '${loan.status}', not repayable`);
  }

  const owed = amountOwed(loan);

  // Re-requesting must not move the goalposts. If a figure was already fixed,
  // that is the figure - otherwise a borrower could be told one number, send
  // it, and be judged against another.
  const alreadyFixed = loan.repayment_expected != null;
  const expectedRaw = alreadyFixed
    ? BigInt(Math.round(Number(loan.repayment_expected) * 1e6))
    : owed.totalRaw;

  const updated = unwrap(
    await db.from('loans').update({
      status: 'repaying',
      repayment_expected: Number(expectedRaw) / 1e6,
      repayment_requested_at: alreadyFixed ? loan.repayment_requested_at : new Date().toISOString(),
    }).eq('id', loan.id).select().single(),
    'requestRepayment: recording the expected repayment',
  );

  return {
    loan: updated,
    owed,
    alreadyFixed,
    transfer: {
      token: usdcAddress(),
      tokenSymbol: 'USDC',
      from: loan.recipient_address,
      to: getWalletAddress(),
      amountRaw: expectedRaw.toString(),
      amountUsdc: Number(expectedRaw) / 1e6,
    },
  };
}

/**
 * Verify a repayment transaction and, only if it holds up, mark the loan repaid.
 *
 * Everything is checked against the STORED expectation rather than a freshly
 * derived one, and every check must pass. A failure leaves the loan at
 * 'repaying' - it never downgrades a real payment, and never upgrades an
 * unrelated transaction to a repayment.
 *
 * @param {string} loanId
 * @param {string} txHash
 * @param {object} [opts]
 * @param {number} [opts.minConfirmations]
 * @returns {Promise<{ok:boolean, checks:object[], loan:object|null}>}
 */
export async function confirmRepayment(loanId, txHash, { minConfirmations = 2 } = {}) {
  const { db, unwrap } = await import('../db/client.js');
  const { usdcAddress } = await import('../thetanuts/wallet.js');
  const { getWalletAddress } = await import('../thetanuts/signer.js');

  const loan = unwrap(
    await db.from('loans').select('*').eq('id', loanId).single(),
    'confirmRepayment: reading the loan',
  );

  if (loan.repayment_expected == null) {
    throw new Error(
      `confirmRepayment: loan ${loanId} has no recorded expectation. ` +
      'Run the request step first - verifying against a figure derived now would ' +
      'check a different number from the one that was quoted.',
    );
  }
  if (loan.status === 'repaid') {
    throw new Error(`confirmRepayment: loan ${loanId} is already repaid (tx ${loan.repayment_tx})`);
  }

  const checks = [];
  const item = (label, pass, detail) => { checks.push({ label, pass, detail }); return pass; };

  const provider = new ethers.JsonRpcProvider(process.env.THETANUTS_RPC_URL);
  const expectedRaw = BigInt(Math.round(Number(loan.repayment_expected) * 1e6));
  const token = usdcAddress().toLowerCase();
  const from = loan.recipient_address.toLowerCase();
  const to = getWalletAddress().toLowerCase();

  const receipt = await provider.getTransactionReceipt(txHash);

  if (!item('transaction exists on chain', Boolean(receipt),
    receipt ? `block ${receipt.blockNumber}` : 'not found - it may not be mined yet')) {
    return { ok: false, checks, loan: null };
  }

  item('transaction succeeded', receipt.status === 1,
    receipt.status === 1 ? 'status 1' : 'REVERTED - nothing moved');

  const confirmations = (await provider.getBlockNumber()) - receipt.blockNumber + 1;
  item(`at least ${minConfirmations} confirmations`, confirmations >= minConfirmations,
    `${confirmations} confirmation(s)`);

  // The transfer is read from the logs, not from the transaction's `to` and
  // `value`. An ERC-20 transfer moves nothing in `value`, and the recipient is
  // an argument, not the transaction target.
  const transfers = usdcTransfersIn(receipt.logs, token);

  item('carries a USDC transfer', transfers.length > 0,
    `${transfers.length} USDC Transfer log(s)`);

  const match = transfers.find((t) => t.from === from && t.to === to);
  item('sent by the borrower to the lender', Boolean(match),
    match ? `${from.slice(0, 10)} -> ${to.slice(0, 10)}`
      : `expected ${from.slice(0, 10)} -> ${to.slice(0, 10)}, not found`);

  if (match) {
    item('amount covers what is owed', match.value >= expectedRaw,
      `sent ${usdc(match.value).toFixed(6)}, owed ${usdc(expectedRaw).toFixed(6)}` +
      (match.value > expectedRaw ? ` (overpaid ${usdc(match.value - expectedRaw).toFixed(6)})` : ''));
  }

  // Two loans must never be closed by one transaction.
  const { data: reused } = await db.from('loans')
    .select('id').eq('repayment_tx', txHash.toLowerCase()).neq('id', loan.id);
  item('transaction not already used for another loan', (reused ?? []).length === 0,
    (reused ?? []).length === 0 ? 'unused' : `already closes ${reused.map((l) => l.id).join(', ')}`);

  const ok = checks.every((c) => c.pass);
  if (!ok) return { ok: false, checks, loan: null };

  const updated = unwrap(
    await db.from('loans').update({
      status: 'repaid',
      repayment_tx: txHash.toLowerCase(),
    }).eq('id', loan.id).select().single(),
    'confirmRepayment: recording the repayment',
  );

  return { ok: true, checks, loan: updated };
}

/** Render a verification result for a terminal. */
export function formatChecks(checks) {
  return checks
    .map((c) => `  ${c.pass ? 'PASS' : 'FAIL'}  ${c.label.padEnd(44)} ${c.detail}`)
    .join('\n');
}
