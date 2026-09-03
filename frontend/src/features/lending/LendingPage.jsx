import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorCode, liveApi } from '../../api/client.js';
import AssetLogo from '../../components/AssetLogo.jsx';
import { ArrowIcon } from '../../components/Icons.jsx';
import { Alert, AsyncState, Button, Card, FormField, MonoValue, StatusBadge } from '../../components/ui/index.js';
import useLendingData from './useLendingData.js';
import {
  borrowableHint,
  buildCollateralRows,
  buildLoanRows,
  describeLoanError,
  failingChecks,
  formatDate,
  formatUsdc,
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

  const hint = borrowableHint(offer);
  const amount = Number(principalInput);
  const submitDisabled = !principalInput || !Number.isFinite(amount) || amount <= 0 || amount > offer.creditLimitUsdc
    || borrowState === 'submitting';

  return (
    <>
      <dl className="pd-detail-list lending-equation">
        <div><dt>Protection floor</dt><dd className="numeric">{formatUsdc(offer.protectionFloorUsdc) ?? '—'}</dd></div>
        <div><dt>Contracts covered</dt><dd className="numeric">{offer.numContracts}</dd></div>
        <div><dt>Protected value</dt><dd className="numeric">{formatUsdc(offer.protectedValueUsdc) ?? '—'}</dd></div>
        <div><dt>Interest reserved</dt><dd className="numeric">{formatUsdc(offer.interestReservedUsdc) ?? '—'}</dd></div>
        <div><dt>Your credit limit</dt><dd className="numeric"><MonoValue as="strong">{formatUsdc(offer.creditLimitUsdc) ?? '—'}</MonoValue></dd></div>
        <div><dt>Due date</dt><dd>{formatDate(offer.dueAt)}</dd></div>
      </dl>

      {hint && <Alert tone="info" title="Our operator float is the limit today">{hint}</Alert>}

      <FormField label="Amount to borrow (USDC)" hint={`Up to ${formatUsdc(offer.creditLimitUsdc) ?? '—'}`}>
        <input
          type="number"
          min="0.000001"
          max={offer.creditLimitUsdc}
          step="any"
          inputMode="decimal"
          placeholder="0.00"
          value={principalInput}
          onChange={(event) => setPrincipal(event.target.value)}
          disabled={borrowState === 'submitting' || borrowState === 'success'}
        />
      </FormField>

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
          <small>This sends real USDC from Alpha's operator wallet to you, right now.</small>
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
          <tr><th>Principal</th><th>Status</th><th>Due date</th><th>Amount owed</th><th><span className="sr-only">Action</span></th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.loanId}>
              <tr>
                <td className="numeric">{row.principalLabel}</td>
                <td><StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge></td>
                <td>{row.dueLabel}</td>
                <td className="numeric">{row.owedLabel}</td>
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
                  <td colSpan={5}>
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
  const loanRows = useMemo(() => buildLoanRows(lending.loans), [lending.loans]);

  return (
    <main className="portfolio-page">
      <div className="portfolio-container">
        <section className="portfolio-heading">
          <div>
            <span className="portfolio-eyebrow">Lending</span>
            <h1>Borrow Against Your Protection</h1>
            <p>Borrow USDC against a protection position you already hold — no separate credit check, no selling early.</p>
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
