import { getAssetIdentity } from '../../components/AssetLogo.jsx';
import { formatUsdc } from '../../utils/usdc.js';
import { formatDate, getProtectionState } from '../portfolio/portfolioViewModel.js';

export { formatDate, formatUsdc };

export const LOAN_STATUS = {
  active: { tone: 'success', label: 'Active' },
  repaying: { tone: 'warning', label: 'Repaying' },
  repaid: { tone: 'primary', label: 'Repaid' },
  defaulted: { tone: 'danger', label: 'Defaulted' },
};

/**
 * Positions that can back a loan: confirmed on-chain protection, same test
 * portfolioViewModel.getProtectionState already uses for the Portfolio table.
 */
export function buildCollateralRows(positions = []) {
  return positions
    .filter((position) => getProtectionState(position) === 'active')
    .map((position) => {
      const identity = getAssetIdentity(position.asset);
      return {
        positionId: position.positionId,
        symbol: identity.symbol,
        name: identity.name,
        floorLabel: formatUsdc(position.protectionFloorUsdc) ?? '—',
        expiryLabel: formatDate(position.expiry),
      };
    });
}

/**
 * Statuses where the debt is settled and nothing more is owed. `repaying` is
 * NOT one of them: the transfer has been quoted but not yet verified, and the
 * borrower still owes the full amount until it is.
 */
const CLOSED_STATUSES = new Set(['repaid']);

/**
 * repaymentExpectedUsdc is the figure FIXED when repayment was requested and
 * does not move afterwards; owed.totalUsdc keeps accruing until then. Once
 * set, the fixed figure is what must be shown - see API-LENDING.md.
 */
export function owedNowUsdc(loan) {
  // A closed loan owes nothing, and that is a fact rather than a gap. The
  // stored `repaymentExpectedUsdc` survives repayment - it is the figure the
  // borrower was quoted, kept as a record - so reading it after settlement
  // shows a repaid loan still asking for money.
  if (CLOSED_STATUSES.has(loan?.status)) return 0;

  if (loan?.repaymentExpectedUsdc !== null && loan?.repaymentExpectedUsdc !== undefined) {
    return loan.repaymentExpectedUsdc;
  }
  return loan?.owed?.totalUsdc ?? null;
}

/**
 * What a loan of `principalUsdc` would cost to repay.
 *
 * ---------------------------------------------------------------------------
 * A SECOND IMPLEMENTATION OF A MONEY FORMULA. KEEP IT IN STEP.
 * ---------------------------------------------------------------------------
 *
 * The authority is `amountOwed()` in backend/src/lending/repay.js (the interest
 * line and the ceil are at repay.js:108-113). This mirrors it so the cost can
 * be shown BEFORE borrowing, which the backend cannot do - it has no loan to
 * price until one exists. Any change there has to be made here too, and the
 * test pins both the formula and the rounding.
 *
 *   interest = principal x rate/100 x termDays/365
 *   total    = ceil((principal + interest) x 1e6) / 1e6
 *
 * The ceil is not cosmetic: a borrower who sends the rounded-DOWN figure is a
 * fraction short, and the repayment check compares against what is owed.
 *
 * ESTIMATE, NOT A QUOTE. `offer.termDays` runs from now to the due date, while
 * the loan is priced from its own created_at. Time passes between reading this
 * and pressing the button, so the real figure is slightly smaller. The
 * interface must say so rather than print this as exact.
 *
 * @returns {{interestUsdc: number, totalUsdc: number, termDays: number,
 *            annualRatePct: number}|null} null when it cannot be priced
 */
export function estimateRepayment(offer, principalUsdc) {
  const principal = Number(principalUsdc);
  const annualRatePct = Number(offer?.annualRatePct);
  const termDays = Number(offer?.termDays);

  if (!Number.isFinite(principal) || principal <= 0) return null;
  if (!Number.isFinite(annualRatePct) || annualRatePct < 0) return null;
  if (!Number.isFinite(termDays) || termDays < 0) return null;

  const interestUsdc = principal * (annualRatePct / 100) * (termDays / 365);
  const totalUsdc = Math.ceil((principal + interestUsdc) * 1e6) / 1e6;

  return { interestUsdc, totalUsdc, termDays, annualRatePct };
}

/**
 * How a loan names the protection behind it.
 *
 * The page is called "Borrow Against Your Protection" and the list showed no
 * sign of which protection - two loans on two different floors were
 * indistinguishable. Asset and floor together identify one.
 *
 * The link is always offered, even when the position is not in hand:
 * /protection/:positionId fetches by id and does not depend on this list, and
 * a loan always has a positionId. "Cannot name it" and "has no collateral" are
 * different facts, and a dash would state the second.
 */
function collateralLabel(loan, positionsById) {
  const position = loan?.positionId ? positionsById.get(loan.positionId) : null;
  if (!position) return null;

  const identity = getAssetIdentity(position.asset);
  const floor = formatUsdc(position.protectionFloorUsdc);
  return floor ? `${identity.symbol} · ${floor} floor` : identity.symbol;
}

export function buildLoanRows(loans = [], positions = []) {
  const positionsById = new Map(positions.map((p) => [p.positionId, p]));
  return loans.map((loan) => {
    const status = LOAN_STATUS[loan.status] ?? { tone: 'neutral', label: loan.status ?? 'Unknown' };
    const owed = owedNowUsdc(loan);
    return {
      ...loan,
      principalLabel: formatUsdc(loan.principalUsdc) ?? '—',
      statusTone: status.tone,
      statusLabel: status.label,
      dueLabel: formatDate(loan.dueAt),
      collateralLabel: collateralLabel(loan, positionsById),
      // Zero, not a dash. A dash reads as "we do not know"; the amount owed on
      // a repaid loan is known exactly, and it is nothing.
      owedLabel: owed === null ? '—' : (formatUsdc(owed) ?? '—'),
    };
  });
}

/**
 * boundBy tells apart two different facts (API-LENDING.md): 'credit_limit'
 * means the protection itself is the ceiling (the product working as
 * intended); 'wallet' means the operator float is short today and has
 * nothing to do with the user's entitlement. Never render a wallet
 * shortfall as if it were a smaller credit limit.
 */
export function borrowableHint(offer) {
  if (!offer || offer.boundBy !== 'wallet') return null;
  return `We can fund ${formatUsdc(offer.borrowableNowUsdc) ?? '—'} of your ${formatUsdc(offer.creditLimitUsdc) ?? '—'} limit right now.`;
}

const LOAN_ERROR_TITLES = {
  CREDIT_LIMIT_EXCEEDED: 'More than your protection supports',
  INSUFFICIENT_FLOAT: 'Our funds are short right now — not your credit',
  PRECONDITION_FAILED: 'A safety check failed',
  CONFLICT: 'This position cannot back a loan yet',
  NOT_FOUND: 'Position not found',
  TRANSFER_REVERTED: 'Nothing was sent',
  OUTCOME_UNKNOWN: 'Outcome unknown — do not retry',
};

/**
 * The backend already writes a complete, correct-numbers message for every
 * one of these codes (see backend/src/api/loanRoutes.js for INSUFFICIENT_FLOAT
 * specifically) - this only picks the right title, it never rewrites the
 * message. Recomputing the numbers client-side is exactly what API-LENDING.md
 * warns against: two implementations of one equation eventually disagree.
 */
export function describeLoanError(error, code) {
  return {
    code,
    title: LOAN_ERROR_TITLES[code] ?? 'Borrowing failed',
    message: error?.message ?? 'Something went wrong. Please try again.',
    doNotRetry: code === 'OUTCOME_UNKNOWN',
  };
}

/** REPAYMENT_UNVERIFIED carries the checklist; show the failing items' detail. */
export function failingChecks(error) {
  const checks = error?.payload?.error?.details?.checks;
  if (!Array.isArray(checks)) return [];
  return checks.filter((check) => !check.pass);
}
