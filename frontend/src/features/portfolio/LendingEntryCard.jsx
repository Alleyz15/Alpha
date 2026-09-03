import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, MonoValue } from '../../components/ui/index.js';
import { formatUsdc } from '../../utils/usdc.js';

/** Statuses where money is still owed. Anything else is closed or not yet lent. */
const OPEN_STATUSES = new Set(['active', 'repaying']);

/**
 * What is still owed on one loan.
 *
 * `repaymentExpectedUsdc` is the figure FIXED when the borrower asked to repay;
 * once set it is the number that binds, so it wins over the live `owed` total.
 * Same precedence the lending page uses - two screens disagreeing about a debt
 * is worse than either of them being slightly stale.
 *
 * Returns null when neither figure is available, which the caller must treat as
 * "unknown", not as zero.
 */
export function outstandingForLoan(loan) {
  if (Number.isFinite(loan?.repaymentExpectedUsdc)) return loan.repaymentExpectedUsdc;
  if (Number.isFinite(loan?.owed?.totalUsdc)) return loan.owed.totalUsdc;
  return null;
}

/**
 * Summarise open loans.
 *
 * `complete` is false when any open loan could not be priced. A total that
 * silently omits a loan is worse than no total: it reads as the full debt and
 * is smaller than it. The count is still exact in that case, because counting
 * a loan does not require knowing what it owes.
 */
export function summariseLoans(loans) {
  const open = (loans ?? []).filter((loan) => OPEN_STATUSES.has(loan?.status));
  const amounts = open.map(outstandingForLoan);

  return {
    activeCount: open.length,
    outstandingUsdc: amounts.reduce((sum, amount) => sum + (amount ?? 0), 0),
    complete: amounts.every((amount) => amount !== null),
  };
}

/**
 * A way into /lending from the portfolio, carrying enough real data to be worth
 * looking at rather than being a bare button.
 *
 * It does NOT reimplement the lending page. The borrow flow, the offer equation
 * and the repayment steps all live at /lending; a second implementation here
 * would be a second thing to keep in step with the backend.
 */
export default function LendingEntryCard({ apiClient }) {
  const [summary, setSummary] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.getLoans();
      setSummary(summariseLoans(data?.loans));
      setFailed(false);
    } catch {
      // The entry point must survive a failed read. Hiding the link because a
      // number could not be fetched would remove the only way through to the
      // page that could explain why.
      setSummary(null);
      setFailed(true);
    }
  }, [apiClient]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card className="lending-entry-card">
      <div className="lending-entry-card__text">
        <span className="portfolio-eyebrow">Borrowing</span>
        <h2>Cash against your protection</h2>
        <p>Borrow without selling, using protection you already hold as collateral.</p>
      </div>

      <dl className="lending-entry-card__stats">
        <div>
          <dt>Active loans</dt>
          <dd><MonoValue as="strong">{summary ? summary.activeCount : '—'}</MonoValue></dd>
        </div>
        <div>
          <dt>Outstanding</dt>
          <dd>
            <MonoValue as="strong">
              {summary && summary.complete ? (formatUsdc(summary.outstandingUsdc) ?? '—') : '—'}
            </MonoValue>
          </dd>
        </div>
      </dl>

      {summary && !summary.complete && (
        <p className="lending-entry-card__note">
          One or more loans could not be priced, so the total is not shown. Open
          Lending to see each loan on its own.
        </p>
      )}
      {failed && (
        <p className="lending-entry-card__note">
          Loan figures could not be loaded. The page below still works.
        </p>
      )}

      <Link className="lending-entry-card__link" to="/lending">
        Open Lending
      </Link>
    </Card>
  );
}
