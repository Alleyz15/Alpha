import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { toApiErrorViewModel, toPaymentStatusLabel } from '../adapters/quoteViewModel.js';
import { ArrowIcon, ClockIcon, ShieldIcon } from '../components/Icons.jsx';
import FloorCrossingScenario from '../components/FloorCrossingScenario.jsx';
import RealityDisclosure from '../components/RealityDisclosure.jsx';

function useSecondsRemaining(expiresAt) {
  const calculate = () => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [seconds, setSeconds] = useState(calculate);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(calculate()), 250);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return seconds;
}

function PurchaseComplete({ purchase, tier, isMock, reality, onViewDashboard }) {
  const hasOnchainTransaction = purchase.fill === 'onchain' && typeof purchase.txHash === 'string';
  const paymentStatusLabel = toPaymentStatusLabel(purchase.paymentStatus);

  return (
    <section className="completion-card" aria-labelledby="complete-title">
      <span className="success-mark"><ShieldIcon size={36} /></span>
      <RealityDisclosure
        variant="completion"
        isMock={isMock}
        fill={purchase.fill}
        amount={tier.protectedAmount}
        floor={tier.floor}
        expiry={tier.expiry}
      />

      <RealityDisclosure variant="transaction" isMock={isMock} reality={reality} fill={purchase.fill} explorerUrl={purchase.explorerUrl} />

      <p className="payment-status-summary">
        <span>Payment status</span>
        <strong>{isMock ? 'Sample · ' : ''}{paymentStatusLabel}</strong>
      </p>

      <div className="completion-actions">
        <button className="secondary-button" type="button" onClick={onViewDashboard}>View my protection</button>
      </div>

      {hasOnchainTransaction && <small className="transaction-note">Transaction: {purchase.txHash.slice(0, 12)}…{purchase.txHash.slice(-8)}</small>}
    </section>
  );
}

export default function ConfirmationScreen({ step, quote, tier, purchase, isMock, reality, onBack, onComplete, onViewDashboard }) {
  const secondsRemaining = useSecondsRemaining(quote.expiresAt);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  if (step === 'complete') {
    return <PurchaseComplete purchase={purchase} tier={tier} isMock={isMock} reality={reality} onViewDashboard={onViewDashboard} />;
  }

  const timerExpired = secondsRemaining === 0;

  async function confirmPurchase() {
    setStatus('loading');
    setError(null);
    try {
      const result = await api.purchaseQuote({ quoteId: quote.quoteId, tierId: tier.tierId });
      onComplete(result);
    } catch (purchaseError) {
      setError(toApiErrorViewModel(purchaseError));
      setStatus('error');
    }
  }

  return (
    <div className="confirmation-layout">
      <button className="back-button" type="button" onClick={onBack}>← Back to choices</button>

      <section className="confirmation-card" aria-labelledby="confirmation-title">
        <div className="confirmation-heading">
          <div><span className="step-label">Final step</span><h1 id="confirmation-title">Review your protection</h1></div>
          <span className={`quote-timer ${timerExpired ? 'expired' : ''}`}><ClockIcon />{timerExpired ? 'Quote expired' : `${secondsRemaining}s remaining`}</span>
        </div>

        <div className="review-hero">
          <span>Your floor at the end date</span>
          <strong>{tier.floor}</strong>
          <small>{tier.protectionDrop} · {tier.expiry}</small>
        </div>

        <FloorCrossingScenario tier={tier} asset={quote.asset} />

        <dl className="review-details">
          <div><dt>Amount protected</dt><dd>{tier.protectedAmount}</dd></div>
          <div><dt>Protection cost</dt><dd>{tier.cost}</dd></div>
          <div className="maximum-loss"><dt>Maximum loss on the protected portion</dt><dd>{tier.maximumLoss}</dd></div>
          <div><dt>Paid in if protection is needed</dt><dd>{tier.paysIn}</dd></div>
        </dl>

        <div className="plain-language-note">
          <ShieldIcon />
          <p><strong>What this means</strong><span>At the end date, if ETH is below your floor, you receive the difference in USDC. You still keep any upside if ETH rises.</span></p>
        </div>

        {tier.sizeReduced && (
          <div className="notice warning">
            <strong>Part of your holding remains exposed.</strong> {tier.unprotectedAmount}, currently valued at {tier.unprotectedValue}, is not covered by this purchase.
          </div>
        )}

        <RealityDisclosure variant="confirmation" isMock={isMock} reality={reality} />

        {error && <div className="error-message" role="alert"><strong>{error.title}</strong><span>{error.message}</span></div>}

        {timerExpired ? (
          <button className="primary-button" type="button" onClick={onBack}>Get a fresh quote <ArrowIcon /></button>
        ) : (
          <button className="primary-button" type="button" onClick={confirmPurchase} disabled={status === 'loading'}>
            {status === 'loading'
              ? 'Submitting request…'
              : reality?.fill === 'automatic' && !isMock
                ? `Confirm and pay ${tier.cost}`
                : isMock
                  ? 'Preview purchase request'
                  : 'Submit purchase request'} {status !== 'loading' && <ArrowIcon />}
          </button>
        )}
        <small className="authority-note">
          {isMock
            ? 'This preview creates a sample request only. Nothing will be sent to the blockchain.'
            : reality?.fill === 'automatic'
            ? 'The backend re-checks availability and expiry before sending any purchase.'
            : 'The backend records this request first. The app’s operator executes it only after the safety checks pass.'}
        </small>
      </section>
    </div>
  );
}
