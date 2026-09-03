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
 * repaymentExpectedUsdc is the figure FIXED when repayment was requested and
 * does not move afterwards; owed.totalUsdc keeps accruing until then. Once
 * set, the fixed figure is what must be shown - see API-LENDING.md.
 */
export function owedNowUsdc(loan) {
  if (loan?.repaymentExpectedUsdc !== null && loan?.repaymentExpectedUsdc !== undefined) {
    return loan.repaymentExpectedUsdc;
  }
  return loan?.owed?.totalUsdc ?? null;
}

export function buildLoanRows(loans = []) {
  return loans.map((loan) => {
    const status = LOAN_STATUS[loan.status] ?? { tone: 'neutral', label: loan.status ?? 'Unknown' };
    const owed = owedNowUsdc(loan);
    return {
      ...loan,
      principalLabel: formatUsdc(loan.principalUsdc) ?? '—',
      statusTone: status.tone,
      statusLabel: status.label,
      dueLabel: formatDate(loan.dueAt),
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
