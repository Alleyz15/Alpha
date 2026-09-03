// Loan shapes for the API, as pure functions.
//
// No database, no network, no credentials - the same rule as positionView.js
// and portfolioView.js. What is worth testing here is not arithmetic but the
// distinctions: an expected repayment is not an owed amount, a disbursement
// hash is not a confirmed disbursement, and a credit limit is not a principal.

/** USDC has 6 decimals; rounding there keeps float noise out of the payload. */
const usdc = (n) => Math.round(n * 1e6) / 1e6;

/**
 * The credit limit with its WORKING SHOWN.
 *
 * ---------------------------------------------------------------------------
 * THE EQUATION IS THE PRODUCT'S CLAIM. IT SHIPS AS COMPONENTS, NOT A TOTAL.
 * ---------------------------------------------------------------------------
 *
 *   $4.5977  =  $2,300 floor  x  0.001999 contracts  -  this loan's interest
 *
 * That line is the entire argument for why the loan is safe: the borrower can
 * always repay because the protection guarantees at least that much, whatever
 * the price does. A total alone is a number the user has to trust. The
 * components are a number they can check.
 *
 * They are returned rather than recomputed in the browser for the same reason
 * quote figures are: two implementations of one equation eventually disagree,
 * and the disagreement would be about money. The frontend renders these; it
 * does not derive them.
 *
 * ---------------------------------------------------------------------------
 * "FLOOR" MEANS TWO DIFFERENT NUMBERS AND THIS FIELD SET REFUSES TO USE IT.
 * ---------------------------------------------------------------------------
 *
 * In `credit.js`, `floorUsdc` is strike x contracts - $4.5977, the total the
 * protection guarantees. In the sentence above, "the $2,300 floor" is the
 * STRIKE - the per-unit price the protection defends. Same word, two numbers,
 * differing by three orders of magnitude.
 *
 * So neither is called `floorUsdc` here. The strike keeps the name it already
 * has everywhere else in this API - `protectionFloorUsdc`, from
 * positionView.strikeView - and the product becomes `protectedValueUsdc`,
 * which says what it is.
 *
 * @param {object} limit - a creditLimitFor() result
 * @returns {object}
 */
export function creditLimitView(limit) {
  return {
    creditLimitUsdc: usdc(limit.creditLimitUsdc),

    // --- the equation, in the order it is spoken -------------------------
    //
    //   protectedValueUsdc = protectionFloorUsdc x numContracts
    //   creditLimitUsdc    = protectedValueUsdc - interestReservedUsdc
    //
    // Per unit: the price the protection defends. $2,300.
    protectionFloorUsdc: usdc(limit.strike),
    numContracts: limit.contracts,
    // Their product: what the protection guarantees in total. $4.5977. This is
    // what credit.js calls floorUsdc internally.
    protectedValueUsdc: usdc(limit.floorUsdc),
    // What the limit holds back to cover its own interest (BR-39). Solved
    // backwards rather than subtracted, so principal plus interest lands
    // exactly on the guaranteed value instead of just under it.
    interestReservedUsdc: usdc(limit.interestReservedUsdc),

    annualRatePct: limit.annualRatePct,
    // ------------------------------------------------------------------
    // THE LIMIT DRIFTS UPWARD AS EXPIRY APPROACHES, AND THAT IS SAFE.
    // ------------------------------------------------------------------
    //
    // The limit is protectedValue / (1 + rate x term/365), so as the term
    // shrinks the divisor shrinks and the limit rises toward the protected
    // value. Three calls seconds apart returned 257.237754, 257.237755 and
    // 257.237756.
    //
    // The direction is what makes it harmless: a user shown a figure and
    // clicking a moment later is always WITHIN the newer limit, never over
    // it. If this ever moved the other way, a displayed limit would become
    // a refusal between the render and the click.
    termDays: limit.termDays,
    dueAt: limit.dueAt,
  };
}

/**
 * A loan, as the interface needs it.
 *
 * @param {object} loan - a loans row
 * @param {object|null} [owed] - an amountOwed() result, when it can be computed
 */
export function loanView(loan, owed = null) {
  return {
    loanId: loan.id,
    positionId: loan.position_id,
    status: loan.status,

    principalUsdc: Number(loan.principal),
    creditLimitUsdc: loan.credit_limit === null ? null : Number(loan.credit_limit),
    annualRatePct: loan.interest_rate === null ? null : Number(loan.interest_rate),
    collateralContracts: loan.collateral_amount === null ? null : Number(loan.collateral_amount),

    recipientAddress: loan.recipient_address,
    createdAt: loan.created_at,
    dueAt: loan.due_at,

    // --- the disbursement ------------------------------------------------
    //
    // The hash and whether it is CONFIRMED are different questions, the same
    // distinction as executionState on a position. A row carrying a hash says
    // a transfer was broadcast; it does not say it succeeded.
    disbursementTx: loan.disbursement_tx,
    disbursementUrl: loan.disbursement_tx
      ? `https://basescan.org/tx/${loan.disbursement_tx}`
      : null,

    // --- the repayment ---------------------------------------------------
    //
    // `repaymentExpectedUsdc` is the figure FIXED when the repayment was
    // requested, not what is owed now. Once quoted it does not move - a
    // borrower told one number and judged against another has been treated
    // unfairly, and the difference is invisible unless both are carried.
    repaymentExpectedUsdc: loan.repayment_expected === null
      ? null
      : Number(loan.repayment_expected),
    repaymentRequestedAt: loan.repayment_requested_at ?? null,
    repaymentTx: loan.repayment_tx,
    repaymentUrl: loan.repayment_tx
      ? `https://basescan.org/tx/${loan.repayment_tx}`
      : null,

    // What the stored terms say is owed, computed now. Null when the loan is
    // closed or its terms cannot support the calculation.
    owed: owed === null ? null : {
      principalUsdc: usdc(owed.principalUsdc),
      interestUsdc: usdc(owed.interestUsdc),
      totalUsdc: usdc(owed.totalUsdc),
      termDays: owed.termDays,
      annualRatePct: owed.annualRatePct,
    },
  };
}

/**
 * A pre-flight or verification checklist, safe to send to a browser.
 *
 * Label, pass and detail only. The underlying results carry raw values and
 * addresses that the interface has no use for, and shipping them by accident
 * is how internal state leaks into a page.
 *
 * @param {Array<{label:string, pass:boolean, detail:string}>} checks
 */
export function checksView(checks) {
  return (checks ?? []).map((c) => ({
    label: c.label,
    pass: Boolean(c.pass),
    detail: c.detail ?? null,
  }));
}
