// Lending endpoints.
//
// Split from routes.js rather than appended to it: that file is already 677
// lines covering quotes, positions, portfolio and market data, and lending plus
// vault would take it past the point where anyone reads the whole thing before
// changing part of it.
//
// ---------------------------------------------------------------------------
// NOTHING HERE REIMPLEMENTS ANYTHING.
// ---------------------------------------------------------------------------
//
// requestRepayment and confirmRepayment live in src/lending/repay.js and have
// been run against real money. They are called here unchanged. A second
// implementation is a second thing that can be wrong, and the two would drift
// in the direction of whichever was easier to reach.
//
// Every endpoint resolves the user server-side and answers NOT_FOUND for a loan
// that is not theirs - the same rule and the same status as getPositionDetail.
// "Does not exist" and "is not yours" must be indistinguishable, or the 403
// becomes a way to enumerate other people's rows.

import { getLoan, listLoansByUser } from '../db/loans.js';
import { amountOwed, requestRepayment, confirmRepayment } from '../lending/repay.js';
import { getDemoUser } from './demoUser.js';
import { ApiError } from './errors.js';
import { loanView, checksView } from './loanView.js';

/**
 * Resolve a loan the demo user owns, or refuse.
 *
 * @param {string} loanId
 * @returns {Promise<object>} the loans row
 */
async function ownedLoan(loanId) {
  if (typeof loanId !== 'string' || loanId.trim() === '') {
    throw new ApiError('INVALID_REQUEST', 'A loan id is required.', { field: 'loanId' });
  }

  const user = await getDemoUser();
  const loan = await getLoan(loanId);

  if (!loan || loan.user_id !== user.id) {
    throw new ApiError('NOT_FOUND', `No loan ${loanId}.`);
  }

  return loan;
}

/**
 * `amountOwed` for a loan, or null when its terms cannot support the sum.
 *
 * A malformed row must not take the endpoint down: the rest of the loan is
 * still worth showing, and "we cannot compute what you owe" is information the
 * interface can render. Null, not zero.
 */
function owedOrNull(loan) {
  try {
    return amountOwed(loan);
  } catch {
    return null;
  }
}

/**
 * GET /api/loans
 *
 * The user's loans, newest first.
 */
export async function getLoans() {
  const user = await getDemoUser();
  const loans = await listLoansByUser(user.id);

  return { loans: loans.map((l) => loanView(l, owedOrNull(l))) };
}

/**
 * GET /api/loans/:loanId
 *
 * One loan. Also what the interface polls while a disbursement is in flight:
 * the row is written before the transfer is broadcast, so the resource exists
 * before the transaction does and there is always something to poll.
 */
export async function getLoanDetail(loanId) {
  const loan = await ownedLoan(loanId);
  return loanView(loan, owedOrNull(loan));
}

/**
 * POST /api/loans/:loanId/repayment-request
 *
 * Fix what is owed and return the exact transfer to make. Sends nothing, signs
 * nothing, spends nothing - the BORROWER signs from their own wallet.
 *
 * ---------------------------------------------------------------------------
 * THIS STEP EXISTS SO THE FIGURE CANNOT MOVE UNDER THE BORROWER.
 * ---------------------------------------------------------------------------
 *
 * The amount is written to the row here, and every later check runs against
 * THAT figure rather than one derived at verification time. Interest accrues
 * with the clock, so without this step a borrower could be shown one number,
 * send exactly that, and be told it was short - with both numbers correct at
 * the moment each was computed, and the discrepancy invisible.
 *
 * Re-requesting returns the figure already fixed rather than a fresh one.
 */
export async function postRepaymentRequest(loanId) {
  const loan = await ownedLoan(loanId);

  if (loan.status === 'repaid') {
    throw new ApiError('CONFLICT', 'This loan is already repaid.', {
      loanId: loan.id,
      repaymentTx: loan.repayment_tx,
    });
  }
  if (!['active', 'repaying'].includes(loan.status)) {
    throw new ApiError('CONFLICT', `This loan is ${loan.status} and cannot be repaid.`, {
      loanId: loan.id,
      status: loan.status,
    });
  }

  const result = await requestRepayment(loan.id);

  return {
    loan: loanView(result.loan, result.owed),

    // What to send, to the micro-unit. The interface must NOT round this for
    // display and then send the rounded figure: a borrower who sends a
    // rounded-down amount is short, and verification will correctly refuse it.
    transfer: {
      token: result.transfer.token,
      tokenSymbol: result.transfer.tokenSymbol,
      from: result.transfer.from,
      to: result.transfer.to,
      amountUsdc: result.transfer.amountUsdc,
      amountRaw: result.transfer.amountRaw,
    },

    // True when this figure was fixed by an earlier request and is being
    // repeated rather than recomputed.
    alreadyFixed: result.alreadyFixed,
  };
}

/**
 * POST /api/loans/:loanId/repay   { txHash }
 *
 * Verify-and-record. WE SIGN NOTHING HERE.
 *
 * ---------------------------------------------------------------------------
 * THE TRANSFER IS READ FROM THE LOGS, NEVER FROM `to` AND `value`.
 * ---------------------------------------------------------------------------
 *
 * An ERC-20 transfer moves nothing in the transaction's `value`, and its `to`
 * is the token contract rather than the recipient. Checking those two fields
 * would accept any transaction sent to USDC - including one that transferred
 * nothing at all, or transferred to somebody else entirely.
 *
 * confirmRepayment decodes the Transfer event from the receipt logs, filters to
 * the USDC contract, and matches borrower -> lender with an amount at least the
 * stored expectation. It also refuses a transaction already used to close
 * another loan.
 *
 * Seven checks, every one of which must pass. A failure leaves the loan at
 * 'repaying': it never downgrades a real payment, and never promotes an
 * unrelated transaction to a repayment.
 */
export async function postRepay(loanId, body) {
  const loan = await ownedLoan(loanId);

  if (!body || typeof body !== 'object') {
    throw new ApiError('INVALID_REQUEST', 'A JSON body is required.');
  }

  const { txHash } = body;
  if (typeof txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())) {
    throw new ApiError('INVALID_REQUEST',
      'txHash must be a 0x-prefixed 32-byte transaction hash.', { field: 'txHash' });
  }

  if (loan.status === 'repaid') {
    throw new ApiError('CONFLICT', 'This loan is already repaid.', {
      loanId: loan.id,
      repaymentTx: loan.repayment_tx,
    });
  }

  // Refused rather than quietly requesting on the caller's behalf. The
  // expectation has to be fixed BEFORE the borrower sends, or the figure being
  // verified is not the figure they were shown - which is the whole point of
  // the request step above.
  if (loan.repayment_expected == null) {
    throw new ApiError('CONFLICT',
      'Request a repayment figure before submitting a transaction.', {
        loanId: loan.id,
        next: `POST /api/loans/${loan.id}/repayment-request`,
      });
  }

  const result = await confirmRepayment(loan.id, txHash.trim());

  if (!result.ok) {
    throw new ApiError('REPAYMENT_UNVERIFIED',
      'That transaction does not settle this loan. Nothing was recorded.', {
        loanId: loan.id,
        // The checklist, so the interface can say WHICH check failed rather
        // than "verification failed" - the difference between "you sent 4.59
        // and owe 4.60" and a shrug.
        checks: checksView(result.checks),
      });
  }

  return {
    loan: loanView(result.loan, owedOrNull(result.loan)),
    checks: checksView(result.checks),
    repaid: true,
  };
}
