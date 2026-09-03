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
import { getPosition } from '../db/positions.js';
import { amountOwed, requestRepayment, confirmRepayment } from '../lending/repay.js';
import { creditLimitFor } from '../lending/credit.js';
import { runDisbursePreflight, disburse } from '../lending/disburse.js';
import { getDemoUser } from './demoUser.js';
import { ApiError } from './errors.js';
import { payoutRecipient } from './recipient.js';
import { loanView, creditLimitView, checksView } from './loanView.js';

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
 * Resolve a position the demo user owns, or refuse.
 */
async function ownedPosition(positionId) {
  const user = await getDemoUser();
  const position = await getPosition(positionId);

  if (!position || position.user_id !== user.id) {
    throw new ApiError('NOT_FOUND', `No position ${positionId}.`);
  }
  return position;
}

/**
 * How much could ACTUALLY be borrowed, and which limit is binding.
 *
 * ===========================================================================
 * A CREDIT LIMIT AND A WALLET BALANCE ARE DIFFERENT FACTS. ONE OF THEM IS OURS.
 * ===========================================================================
 *
 *   creditLimitUsdc   what the protection guarantees, less this loan's
 *                     interest. A property of the option the user owns.
 *   walletUsdc        what our operator wallet can actually send today.
 *
 * Today they disagree by a lot: the put backing this endpoint guarantees about
 * $257, and the wallet holds about $55. So a full-limit draw is impossible -
 * and that is an operations fact, not a statement about the user's collateral.
 *
 * Telling someone "you can only borrow $55 against this" would be false. Their
 * protection is worth $257 and their entitlement has not changed; OUR float is
 * what ran out. The interface has to be able to say which, so `boundBy` names
 * it and both figures travel together.
 *
 * @param {object} limit - a creditLimitFor() result
 * @param {object} preflight - a runDisbursePreflight() result
 */
function borrowableView(limit, preflight) {
  const walletUsdc = preflight?.funds?.usdc ?? null;

  const borrowableUsdc = walletUsdc === null
    ? limit.creditLimitUsdc
    : Math.min(limit.creditLimitUsdc, walletUsdc);

  const boundBy = walletUsdc !== null && walletUsdc < limit.creditLimitUsdc
    ? 'wallet'
    : 'credit_limit';

  return {
    borrowableNowUsdc: Math.round(borrowableUsdc * 1e6) / 1e6,
    // 'credit_limit' - the protection is the constraint, which is the product
    // working. 'wallet' - WE cannot fund it today, which is not about the user.
    boundBy,
    walletUsdc,
    // Only present when our float is the binding constraint, so an interface
    // cannot accidentally render an operations shortfall as a credit decision.
    walletShortfallUsdc: boundBy === 'wallet'
      ? Math.round((limit.creditLimitUsdc - walletUsdc) * 1e6) / 1e6
      : null,
  };
}

/**
 * Turn a failed disburse pre-flight into a refusal that names the right cause.
 *
 * Check 3 is the credit limit and check 4 is the wallet. Conflating them would
 * tell a user their protection is worth less than it is.
 */
function refusedDisbursement(preflight, limit, principalUsdc) {
  const failed = (preflight?.checks ?? []).filter((c) => !c.pass);
  const walletShort = failed.some((c) => c.label.includes('wallet holds the principal'));

  if (walletShort) {
    const funded = borrowableView(limit, preflight);
    return new ApiError('INSUFFICIENT_FLOAT',
      `We cannot fund ${principalUsdc} USDC right now. This is our limit, not yours — `
      + `your protection still supports ${limit.creditLimitUsdc} USDC. `
      + `The most we can send today is ${funded.borrowableNowUsdc} USDC.`, {
        requestedUsdc: principalUsdc,
        ...creditLimitView(limit),
        ...funded,
        checks: checksView(preflight.checks),
        sent: false,
      });
  }

  return new ApiError('PRECONDITION_FAILED',
    'This loan cannot be disbursed. Nothing was sent.', {
      requestedUsdc: principalUsdc,
      ...creditLimitView(limit),
      checks: checksView(preflight?.checks),
      sent: false,
    });
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

/**
 * GET /api/loans/offer?positionId=...
 *
 * What could be borrowed against a position, with the equation shown and every
 * check run. Sends nothing, writes nothing.
 */
export async function getLoanOffer(positionId) {
  const position = await ownedPosition(positionId);
  const limit = creditLimitFor(position);
  const recipient = payoutRecipient();

  // The full limit, so the checks describe the most that could be drawn.
  const pre = await runDisbursePreflight({
    position, recipient, principalRaw: limit.creditLimitRaw,
  });

  return {
    positionId: position.id,
    ...creditLimitView(limit),
    ...borrowableView(limit, pre),

    recipientAddress: recipient,
    checks: checksView(pre.checks),
    sent: false,
  };
}

/**
 * POST /api/loans   { positionId, principalUsdc }
 *
 * Borrow against protection already held. **This sends real USDC.**
 *
 * ---------------------------------------------------------------------------
 * ONE IRREVERSIBLE WRITE, BECAUSE THE PUT ALREADY EXISTS.
 * ---------------------------------------------------------------------------
 *
 * This endpoint never buys an option. Buying a put and disbursing a loan are
 * irreversible in different ways - the first leaves you owning an asset, the
 * second creates an obligation - and fusing them would produce a state with no
 * remedy: "we bought you an option you did not ask for". So the products chain:
 * buy protection, then borrow against it.
 *
 * ---------------------------------------------------------------------------
 * THE CLIENT CHOOSES ONE NUMBER, AND ONLY DOWNWARD.
 * ---------------------------------------------------------------------------
 *
 * `principalUsdc` is bounded by a limit derived from the position - strike x
 * contracts, less the interest this loan will charge (BR-39). The client can
 * ask for LESS than the limit, never more, and the limit itself never comes
 * from the request.
 *
 * Held rather than returned early, unlike the vault: the pre-flight is eight
 * local and RPC checks rather than a settlement scan, and the transfer is one
 * block. Measured end to end at a few seconds, against the maturity
 * pre-flight's 316.
 */
export async function postLoan(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError('INVALID_REQUEST', 'A JSON body is required.');
  }

  const { positionId, principalUsdc } = body;

  if (typeof positionId !== 'string' || positionId.trim() === '') {
    throw new ApiError('INVALID_REQUEST', 'positionId is required.', { field: 'positionId' });
  }
  if (typeof principalUsdc !== 'number' || !Number.isFinite(principalUsdc) || principalUsdc <= 0) {
    throw new ApiError('INVALID_REQUEST', 'principalUsdc must be a positive number.', {
      field: 'principalUsdc',
    });
  }

  const position = await ownedPosition(positionId.trim());

  // Derived from the position, never from the request. The client can only ask
  // for less.
  let limit;
  try {
    limit = creditLimitFor(position);
  } catch (error) {
    throw new ApiError('CONFLICT',
      'This position cannot back a loan yet — it has no confirmed size on chain.', {
        positionId: position.id,
        reason: error.message,
      });
  }

  const principalRaw = BigInt(Math.round(principalUsdc * 1e6));

  if (principalRaw > limit.creditLimitRaw) {
    throw new ApiError('CREDIT_LIMIT_EXCEEDED',
      `You can borrow up to ${limit.creditLimitUsdc} USDC against this protection.`, {
        requestedUsdc: principalUsdc,
        ...creditLimitView(limit),
      });
  }

  const recipient = payoutRecipient();

  try {
    const result = await disburse({
      positionId: position.id,
      recipient,
      principalRaw,
      confirmed: true,
    });

    const loan = await getLoan(result.loanId);

    return {
      loanId: result.loanId,
      loan: loanView(loan, owedOrNull(loan)),
      ...creditLimitView(limit),
      principalUsdc: result.principalUsdc,
      txHash: result.txHash,
      explorerUrl: result.explorerUrl,
      recipientAddress: recipient,
      sent: true,
    };
  } catch (error) {
    if (error?.code === 'DISBURSE_PREFLIGHT_FAILED') {
      throw refusedDisbursement(error.preflight, limit, principalUsdc);
    }
    if (error?.code === 'DISBURSE_REVERTED') {
      throw new ApiError('TRANSFER_REVERTED',
        'The transfer was rejected on chain. Nothing was sent.', {
          loanId: error.loanId, sent: false,
        });
    }
    if (error?.code === 'DISBURSE_OUTCOME_UNKNOWN') {
      throw new ApiError('OUTCOME_UNKNOWN',
        'We lost contact before we could confirm the transfer. It may have been sent. '
        + 'Do not try again — check with the team.', {
          loanId: error.loanId, sent: null, doNotRetry: true,
        });
    }
    throw error;
  }
}
