import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorCode, liveApi } from '../../api/client.js';
import AssetLogo from '../../components/AssetLogo.jsx';
import { ArrowIcon, ExternalIcon } from '../../components/Icons.jsx';
import { Alert, AsyncState, Button, Card, FormField, MonoValue, StatusBadge } from '../../components/ui/index.js';
import useLendingData from './useLendingData.js';
import {
  borrowableHint,
  buildCollateralRows,
  buildLoanRows,
  estimateRepayment,
  describeLoanError,
  failingChecks,
  formatDate,
  formatUsdc,
  formatUsdcPrecise,
} from './lendingViewModel.js';

function CollateralPicker({ rows, selectedPositionId, onSelect }) {
  if (rows.length === 0) {
    return (
      <div className="alpha-async-state alpha-async-state--empty">
        <span className="alpha-async-state__mark" aria-hidden="true">○</span>
        <strong>No confirmed protection to borrow against yet</strong>
        <p>Borrowing needs a protection position that is active and confirmed on-chain.</p>
        <Link className="alpha-button alpha-button--primary alpha-button--default" to="/markets">
          Browse protection choices
        </Link>
      </div>
    );
  }

  return (
    <div className="portfolio-table-scroll">
      <table className="portfolio-table">
        <thead>
          <tr><th>Asset</th><th>Protection floor</th><th>End date</th><th><span className="sr-only">Action</span></th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.positionId} className={row.positionId === selectedPositionId ? 'is-selected' : ''}>
              <td>
                <div className="portfolio-coin-cell">
                  <AssetLogo symbol={row.symbol} name={row.name} size="small" />
                  <span><strong>{row.name}</strong><small>{row.symbol}</small></span>
                </div>
              </td>
              <td className="numeric">{row.floorLabel}</td>
              <td>{row.expiryLabel}</td>
              <td className="portfolio-action-cell">
                <Button
                  size="small"
                  variant={row.positionId === selectedPositionId ? 'primary' : 'ghost'}
                  onClick={() => onSelect(row.positionId)}
                >
                  {row.positionId === selectedPositionId ? 'Selected' : 'Use as collateral'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OfferAndBorrow({ lending }) {
  const { offerState, offer, offerError, principalInput, setPrincipal, borrowState, borrowResult, borrowError, submitBorrow } = lending;

  if (offerState === 'loading') return <AsyncState state="loading" loadingLabel="Checking how much you can borrow…" />;
  if (offerState === 'error') {
    return (
      <AsyncState
        state="error"
        errorTitle="Could not check your borrowing limit"
        errorMessage={offerError?.message ?? 'Check that the backend is running, then try again.'}
        onRetry={() => lending.selectCollateral(lending.selectedPositionId)}
      />
    );
  }
  if (!offer) return null;

  // The asset the selected protection covers, for the units on "Protection
  // covers". Falls back to nothing rather than guessing a symbol.
  const coveredSymbol = lending.positions
    ?.find((position) => position.positionId === offer.positionId)?.asset ?? '';

  const hint = borrowableHint(offer);
  const amount = Number(principalInput);
  const ceiling = borrowableCeiling(offer);

  // Against the ceiling that can actually be funded, not the credit limit.
  // The field carries `max`, but `max` on a number input only drives
  // validation and the steppers - it does not stop anyone typing a larger
  // number, so gating on the limit let an amount through that the backend
  // would refuse with INSUFFICIENT_FLOAT.
  const overCeiling = Number.isFinite(amount) && amount > ceiling;
  const estimate = estimateRepayment(offer, principalInput);
  const submitDisabled = !principalInput || !Number.isFinite(amount) || amount <= 0
    || overCeiling
    || borrowState === 'submitting';

  return (
    <>
      <dl className="pd-detail-list lending-equation">
        <div><dt>Protection floor</dt><dd className="numeric">{formatUsdc(offer.protectionFloorUsdc) ?? '—'}</dd></div>
        {/*
          Not "contracts". The number is the amount of the asset the protection
          covers - protectedAmount, numContracts and collateralContracts are
          the same figure - and it is a factor in the credit limit below, so
          removing it would break the reader's ability to check the sum. BR-3
          forbids the word, not the quantity.
        */}
        <div><dt>Protection covers</dt><dd className="numeric">{`${offer.numContracts} ${coveredSymbol}`}</dd></div>
        <div><dt>Protected value</dt><dd className="numeric">{formatUsdc(offer.protectedValueUsdc) ?? '—'}</dd></div>
        <div>
          <dt>Interest set aside</dt>
          <dd className="numeric">{formatUsdc(offer.interestReservedUsdc) ?? '—'}</dd>
          <small>Held back from your limit so the debt can never exceed your floor.</small>
        </div>
        <div><dt>Your credit limit</dt><dd className="numeric"><MonoValue as="strong">{formatUsdc(offer.creditLimitUsdc) ?? '—'}</MonoValue></dd></div>
        <div><dt>Due date</dt><dd>{formatDate(offer.dueAt)}</dd></div>
      </dl>

      {hint && <Alert tone="info" title="Our operator float is the limit today">{hint}</Alert>}

      {/*
        Bounded by what can actually be sent today, not by the credit limit.
        The limit is a fact about the collateral; the float is a fact about our
        wallet, and it is the smaller of the two that a request has to clear.
        Offering the limit as the ceiling invited an amount that fails on
        submit - the alert directly above already said so, and the field
        contradicted it.
      */}
      <FormField label="Amount to borrow (USDC)" hint={borrowableHintText(offer)}>
        <input
          type="number"
          min="0.000001"
          max={borrowableCeiling(offer)}
          step="any"
          inputMode="decimal"
          placeholder="0.00"
          value={principalInput}
          onChange={(event) => setPrincipal(event.target.value)}
          disabled={borrowState === 'submitting' || borrowState === 'success'}
        />
      </FormField>

      {/*
        What it costs, before committing to it. Rendered only for a usable
        amount: an estimate of nothing is neither an estimate nor a fact, and
        printing a hopeful $0.00 under an empty field is worse than silence.
      */}
      {estimate && !overCeiling && (
        <dl className="pd-detail-list lending-estimate">
          <div>
            <dt>Interest rate</dt>
            <dd className="numeric">{`${estimate.annualRatePct}% a year`}</dd>
          </div>
          <div>
            <dt>Repay by</dt>
            <dd>{formatDate(offer.dueAt)}</dd>
          </div>
          <div>
            {/*
              At 2dp the interest on a two-day loan disappears - "repay $50.00"
              against "borrow 50" reads as though nothing was calculated. Shown
              at USDC's own six decimals, and only on this line: the total
              stays in the page's ordinary money format.
            */}
            <dt>Interest</dt>
            <dd className="numeric">{`≈ ${formatUsdcPrecise(estimate.interestUsdc) ?? '—'}`}</dd>
          </div>
          <div>
            <dt>You would repay</dt>
            <dd className="numeric">
              <MonoValue as="strong">{`≈ ${formatUsdc(estimate.totalUsdc) ?? '—'}`}</MonoValue>
            </dd>
          </div>
          <p className="lending-estimate__note">
            An estimate: interest runs with the clock, so the amount is a little
            lower the sooner you borrow. The exact figure is fixed when you borrow,
            and shown in Your loans.
          </p>
        </dl>
      )}

      {/*
        Say why, rather than only greying the button out. A disabled control
        with no explanation reads as a broken page, and the reason here is one
        the user can act on by typing a smaller number.
      */}
      {overCeiling && (
        <Alert tone="warning" title="More than we can send today">
          {`The most we can send right now is ${formatUsdc(ceiling) ?? '—'}. `}
          {offer.boundBy === 'wallet'
            ? 'That is our operator float, not your credit limit — your protection still supports the full amount.'
            : 'That is what your protection supports.'}
        </Alert>
      )}

      {borrowState === 'error' && borrowError && (() => {
        const described = describeLoanError(borrowError, getApiErrorCode(borrowError));
        return (
          <Alert tone={described.code === 'INSUFFICIENT_FLOAT' ? 'warning' : 'error'} title={described.title}>
            {described.message}
          </Alert>
        );
      })()}

      {borrowState === 'success' && borrowResult && (
        <Alert tone="success" title="Loan disbursed">
          {formatUsdc(borrowResult.principalUsdc)} sent.{' '}
          {borrowResult.explorerUrl && (
            <a href={borrowResult.explorerUrl} target="_blank" rel="noreferrer">View on BaseScan</a>
          )}
        </Alert>
      )}

      {borrowState !== 'success' && (
        <div className="lending-spend-action">
          <Button
            size="large"
            disabled={submitDisabled}
            loading={borrowState === 'submitting'}
            loadingLabel="Sending…"
            onClick={submitBorrow}
          >
            Borrow {principalInput || '0'} USDC <ArrowIcon />
          </Button>
          {/*
            Not "to you". The disbursement goes to payoutRecipient() - a second
            wallet the team controls - and recipient.js says in as many words
            that the interface must not call it "your wallet". There is no
            wallet connection in this product, so there is no address of the
            user's to pay.

            Saying "to you" cost a real repayment: the borrower sent the money
            back from the operator wallet instead of from this address, and the
            transfer was refused for having the wrong sender. The address is
            shown here, before borrowing, because it is the address repayment
            must later come FROM.
          */}
          <small className="lending-spend-note">
            This sends real USDC now, to Alpha's payout address{' '}
            <MonoValue>{offer.recipientAddress ?? '—'}</MonoValue>. That address is
            held by the Alpha team, not by you — Alpha holds the funds throughout.
            When you repay, the transfer has to be sent back <strong>from that same
            address</strong>; one sent from anywhere else is refused.
          </small>
        </div>
      )}
    </>
  );
}

function RepaymentFlow({ loanId, flow, onSetTxHash, onConfirm, onRetryStart }) {
  if (!flow) return null;

  if (flow.phase === 'requesting') {
    return <div className="lending-repay-flow"><AsyncState state="loading" loadingLabel="Locking your repayment amount…" /></div>;
  }

  if (flow.phase === 'failed') {
    // A retry has to live HERE. Once repayFlows has an entry for this loan the
    // row's own button is hidden, so without this the failure is a dead end -
    // the same trap that made a `repaying` loan unrecoverable after a refresh.
    return (
      <div className="lending-repay-flow">
        <Alert tone="error" title="Could not start repayment">{flow.error?.message ?? 'Something went wrong. Please try again.'}</Alert>
        <div className="lending-verify-action">
          <Button variant="ghost" size="small" onClick={() => onRetryStart(loanId)}>Try again</Button>
        </div>
      </div>
    );
  }

  if (flow.phase === 'done') {
    return (
      <div className="lending-repay-flow">
        <Alert tone="success" title="Repayment recorded">
          {flow.loan?.repaymentUrl
            ? <a href={flow.loan.repaymentUrl} target="_blank" rel="noreferrer">View on BaseScan</a>
            : 'This loan is now repaid.'}
        </Alert>
      </div>
    );
  }

  // awaiting-tx or verifying
  const checks = failingChecks(flow.error);
  return (
    <div className="lending-repay-flow">
      {/*
        All four fields the backend returns, not two. `from` and `token` were
        omitted and that is exactly what went wrong in real use: the transfer
        was sent from a different address the user also controlled, every other
        detail correct, and the backend refused it. Addresses render in full -
        never truncated - because the user has to copy them.
      */}
      <dl className="pd-detail-list">
        <div><dt>Send exactly</dt><dd className="numeric"><MonoValue as="strong">{formatUsdc(flow.transfer?.amountUsdc) ?? '—'}</MonoValue></dd></div>
        <div>
          <dt>From this address</dt>
          <dd className="numeric"><MonoValue>{flow.transfer?.from ?? '—'}</MonoValue></dd>
        </div>
        <div><dt>To</dt><dd className="numeric"><MonoValue>{flow.transfer?.to ?? '—'}</MonoValue></dd></div>
        <div>
          <dt>Token</dt>
          <dd className="numeric"><MonoValue>{flow.transfer?.token ?? '—'}</MonoValue></dd>
        </div>
      </dl>
      <p className="lending-repay-note">
        <strong>It must come from the address above.</strong> A transfer sent from any other
        address will not be accepted, even if the amount and the destination are right.
        Alpha does not send it for you — send it yourself, then paste the transaction hash below.
      </p>

      {flow.error && checks.length > 0 && (
        <Alert tone="error" title="That transaction does not settle this loan">
          <ul>{checks.map((check) => <li key={check.label}>{check.label}: {check.detail}</li>)}</ul>
        </Alert>
      )}
      {flow.error && checks.length === 0 && (
        <Alert tone="error" title="Could not verify that transaction">{flow.error?.message ?? 'Please check the transaction hash and try again.'}</Alert>
      )}

      <FormField label="Your transaction hash">
        <input
          type="text"
          placeholder="0x…"
          value={flow.txHashInput}
          onChange={(event) => onSetTxHash(loanId, event.target.value)}
          disabled={flow.phase === 'verifying'}
        />
      </FormField>

      <div className="lending-verify-action">
        <Button
          variant="ghost"
          loading={flow.phase === 'verifying'}
          loadingLabel="Verifying…"
          disabled={!flow.txHashInput || flow.phase === 'verifying'}
          onClick={() => onConfirm(loanId)}
        >
          Submit repayment
        </Button>
        <small>We only verify a transfer you already sent — nothing is sent from here.</small>
      </div>
    </div>
  );
}

/**
 * The on-chain evidence for one loan.
 *
 * Two different transactions: the money going out and the money coming back.
 * They are labelled by which one they are rather than both reading "View on
 * BaseScan", because two identically named links side by side say nothing
 * about where either of them goes.
 *
 * A url is null until that transaction exists - a loan mid-disbursement has no
 * hash yet. Nothing is rendered for a missing one, and a loan with neither
 * shows a dash: an empty cell cannot be told apart from a broken one.
 */
function OnChainLinks({ disbursementUrl, repaymentUrl }) {
  if (!disbursementUrl && !repaymentUrl) return <span aria-hidden="true">—</span>;

  return (
    <div className="lending-onchain-links">
      {disbursementUrl && (
        <a
          className="pd-explorer-link"
          href={disbursementUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="View the borrowing transaction on BaseScan"
        >
          Borrowed <ExternalIcon size={13} />
        </a>
      )}
      {repaymentUrl && (
        <a
          className="pd-explorer-link"
          href={repaymentUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="View the repayment transaction on BaseScan"
        >
          Repaid <ExternalIcon size={13} />
        </a>
      )}
    </div>
  );
}

/**
 * The most that can be borrowed right now.
 *
 * `borrowableNowUsdc` is already the smaller of the credit limit and our
 * float. Falling back to the credit limit keeps an older response shape
 * working, and cannot raise the ceiling above what the backend would allow -
 * it only loses the float cap, which the backend still enforces.
 */
function borrowableCeiling(offer) {
  return Number.isFinite(offer?.borrowableNowUsdc)
    ? offer.borrowableNowUsdc
    : offer?.creditLimitUsdc;
}

/**
 * Both figures when they differ, one when they do not.
 *
 * Showing only the limit promises money we cannot send today; showing only
 * today's ceiling makes the protection look smaller than it is. `boundBy`
 * already distinguishes the two - see borrowableHint.
 */
function borrowableHintText(offer) {
  const ceiling = formatUsdc(borrowableCeiling(offer)) ?? '—';
  if (offer?.boundBy !== 'wallet') return `Up to ${ceiling}`;
  return `Up to ${ceiling} today · your limit is ${formatUsdc(offer.creditLimitUsdc) ?? '—'}`;
}

function LoansList({ lending, rows }) {
  if (lending.loansState === 'loading') return <AsyncState state="loading" loadingLabel="Loading your loans…" />;
  if (lending.loansState === 'error') {
    return (
      <AsyncState
        state="error"
        errorTitle="Loans could not be loaded"
        errorMessage={lending.loansError?.message ?? 'Check that the backend is running, then try again.'}
        onRetry={lending.retryLoans}
      />
    );
  }
  if (rows.length === 0) {
    return <div className="alpha-async-state alpha-async-state--empty"><span className="alpha-async-state__mark" aria-hidden="true">○</span><strong>You haven't borrowed anything yet</strong></div>;
  }

  return (
    <div className="portfolio-table-scroll">
      <table className="portfolio-table">
        <thead>
          <tr><th>Principal</th><th>Backed by</th><th>Status</th><th>Due date</th><th>Amount owed</th><th>On chain</th><th><span className="sr-only">Action</span></th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.loanId}>
              <tr>
                <td className="numeric">{row.principalLabel}</td>
                <td>
                  {/*
                    Always a link. The protection page fetches by id, so it
                    works even when this list could not name the position.
                  */}
                  <Link className="lending-collateral-link" to={`/protection/${row.positionId}`}>
                    {row.collateralLabel ?? 'View protection'}
                  </Link>
                </td>
                <td><StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge></td>
                <td>{row.dueLabel}</td>
                <td className="numeric">{row.owedLabel}</td>
                <td>
                  <OnChainLinks
                    disbursementUrl={row.disbursementUrl}
                    repaymentUrl={row.repaymentUrl}
                  />
                </td>
                <td className="portfolio-action-cell">
                  {/*
                    `repaying` gets a button too, not just `active`.
                    ------------------------------------------------------
                    The transfer instruction lives only in `repayFlows`, which
                    is in-memory and dies on a refresh. Gating this on `active`
                    alone meant a loan that had already moved to `repaying` had
                    no way back in: no instruction, no hash field, no button -
                    an empty action cell and a status badge. That happened in
                    real use and the only way out was calling the API by hand.

                    Both branches call the SAME startRepayment. The backend is
                    idempotent: on a loan already `repaying` it returns the
                    figure it fixed the first time (alreadyFixed: true) rather
                    than re-pricing it. So one call serves both "fix it now"
                    and "show me what was fixed".
                  */}
                  {(row.status === 'active' || row.status === 'repaying') && !lending.repayFlows[row.loanId] && (
                    <Button variant="ghost" size="small" onClick={() => lending.startRepayment(row.loanId)}>
                      {row.status === 'active' ? 'Start repayment' : 'View repayment instructions'}
                    </Button>
                  )}
                </td>
              </tr>
              {lending.repayFlows[row.loanId] && (
                <tr>
                  {/* Spans every column, including the new On chain one. */}
                  <td colSpan={7}>
                    <RepaymentFlow
                      loanId={row.loanId}
                      flow={lending.repayFlows[row.loanId]}
                      onSetTxHash={lending.setRepayTxHash}
                      onConfirm={lending.confirmRepayment}
                      onRetryStart={lending.startRepayment}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LendingPage({ apiClient = liveApi }) {
  const lending = useLendingData(apiClient);
  const collateralRows = useMemo(() => buildCollateralRows(lending.positions), [lending.positions]);
  const loanRows = useMemo(
    () => buildLoanRows(lending.loans, lending.positions),
    [lending.loans, lending.positions],
  );

  return (
    <main className="portfolio-page">
      <div className="portfolio-container">
        <section className="portfolio-heading">
          <div>
            <span className="portfolio-eyebrow">Lending</span>
            <h1>Borrow Against Your Protection</h1>
            <p>Borrow USDC against a protection position you already hold — no separate credit check, no selling early.</p>
            {/*
              The difference from ordinary collateralised borrowing, and the
              reason it holds. Verified rather than asserted: a loan's due date
              is its protection's end date (dueAtFor), and the credit limit is
              the floor times the size less reserved interest, so the debt
              cannot outgrow what the floor guarantees.

              Said in plain words on purpose. "No liquidation" and "no margin
              call" only mean something to someone who has already been through
              one.
            */}
            <p className="lending-no-forced-sale">
              <strong>And no forced sale if the price drops:</strong> your loan is due
              when your protection ends, and you can never borrow more than your floor
              guarantees.
            </p>
          </div>
        </section>

        <Card className="lending-section">
          <div className="portfolio-section-heading"><div><span className="portfolio-eyebrow">01</span><h2>Choose collateral</h2></div></div>
          {lending.positionsState === 'loading' && <AsyncState state="loading" loadingLabel="Loading your protection positions…" />}
          {lending.positionsState === 'error' && (
            <AsyncState
              state="error"
              errorTitle="Positions could not be loaded"
              errorMessage={lending.positionsError?.message ?? 'Check that the backend is running, then try again.'}
              onRetry={lending.retryPositions}
            />
          )}
          {lending.positionsState === 'ready' && (
            <CollateralPicker rows={collateralRows} selectedPositionId={lending.selectedPositionId} onSelect={lending.selectCollateral} />
          )}
        </Card>

        {lending.selectedPositionId && (
          <Card className="lending-section">
            <div className="portfolio-section-heading"><div><span className="portfolio-eyebrow">02</span><h2>Borrow</h2></div></div>
            <OfferAndBorrow lending={lending} />
          </Card>
        )}

        <Card className="lending-section">
          <div className="portfolio-section-heading"><div><span className="portfolio-eyebrow">03</span><h2>Your loans</h2></div></div>
          <LoansList lending={lending} rows={loanRows} />
        </Card>
      </div>
    </main>
  );
}
