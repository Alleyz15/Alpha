import { ArrowIcon, ClockIcon, ShieldIcon } from '../../components/Icons.jsx';
import { Alert, Button, Card, MonoValue, RealityBadge, StatusBadge } from '../../components/ui/index.js';
import ProtectionProgress from './ProtectionProgress.jsx';
import useQuoteCountdown from './useQuoteCountdown.js';

export default function ReviewProtectionStep({
  asset,
  contextReality,
  quote,
  tier,
  purchaseState,
  purchaseError,
  onBack,
  onConfirm,
}) {
  const secondsRemaining = useQuoteCountdown(quote.expiresAt);
  const quoteExpired = secondsRemaining === 0;
  const operatorExecution = contextReality?.fill === 'operator';

  return (
    <>
      <button className="protection-back" type="button" onClick={onBack}>← Back to configure</button>
      <ProtectionProgress current="Review" />

      <header className="protection-heading protection-heading--review">
        <div>
          <span className="protection-eyebrow">Review before requesting</span>
          <h1>Check your {asset.symbol} protection</h1>
          <p>{operatorExecution
            ? 'No transaction is sent by this button. The application operator executes accepted requests after safety checks.'
            : 'The backend verifies the quote and controls execution after the request is submitted.'}</p>
        </div>
        <StatusBadge tone={quoteExpired ? 'danger' : 'live'}>
          <ClockIcon size={14} /> {quoteExpired ? 'Quote expired' : `${secondsRemaining}s remaining`}
        </StatusBadge>
      </header>

      <div className="protection-review-grid">
        <Card variant="glass" className="protection-review-hero">
          <div className="protection-review-icon"><ShieldIcon size={34} /></div>
          <span>Your protection floor at the end date</span>
          <MonoValue as="strong">{tier.floor}</MonoValue>
          <p>{tier.protectionDrop} · ends {tier.expiry}</p>
        </Card>

        <Card className="protection-review-details">
          <div className="protection-section-heading">
            <div><span>03</span><div><h2>Request details</h2><p>All financial values below came from this backend quote.</p></div></div>
          </div>

          <dl>
            <div><dt>Asset</dt><dd>{asset.name} ({asset.symbol})</dd></div>
            <div><dt>Price when quoted</dt><dd className="numeric">{quote.spot}</dd></div>
            <div><dt>Amount requested</dt><dd>{quote.requestedAmount}</dd></div>
            <div><dt>Amount protected</dt><dd>{tier.protectedAmount}</dd></div>
            <div><dt>Protection floor</dt><dd className="numeric">{tier.floor}</dd></div>
            <div><dt>Protection premium</dt><dd className="numeric">{tier.cost}</dd></div>
            <div><dt>Maximum loss on protected portion</dt><dd className="numeric">{tier.maximumLoss}</dd></div>
            <div><dt>Settlement currency</dt><dd>{tier.paysIn}</dd></div>
          </dl>

          {tier.sizeReduced && (
            <Alert tone="warning" title="This choice protects only part of the requested amount">
              {tier.unprotectedAmount}, currently valued at {tier.unprotectedValue}, remains exposed.
            </Alert>
          )}

          {!tier.sizeConfirmed && (
            <Alert tone="warning" title="Amount confirmation is incomplete">
              {tier.sizeConfirmationMessage} The size shown is the backend’s computed amount, but it is not presented as chain-confirmed.
            </Alert>
          )}

          <div className="protection-meaning">
            <ShieldIcon />
            <div>
              <h2>What this means for you</h2>
              <p>If {asset.symbol} ends below {tier.floor} on {tier.expiry}, the protection pays the difference in USDC for the protected amount. It does not stop the market price from moving before that date.</p>
            </div>
          </div>

          <div className="protection-reality-panel">
            <h2>What is real—and what is not</h2>
            <div>
              <RealityBadge kind={contextReality?.price} label="Live quote" />
              <RealityBadge kind={contextReality?.balance} label="Simulated holding" />
              <RealityBadge kind={operatorExecution ? 'operator' : 'live'} label={operatorExecution ? 'Operator execution' : 'Backend execution'} />
            </div>
            <p>The asset holding and USDC balance are seeded for the demo. The quote comes from the live market. Confirming records a request and holds the simulated USDC premium; the Status page will report whether execution is still pending or actually on-chain.</p>
          </div>

          {purchaseError && <Alert tone="error" title={purchaseError.title}>{purchaseError.message}</Alert>}

          {quoteExpired ? (
            <Alert
              tone="warning"
              title="This quote has expired"
              actions={<Button variant="ghost" size="small" onClick={onBack}>Return for a fresh quote</Button>}
            >
              Live offers can change quickly. Return to Configure and request new choices before continuing.
            </Alert>
          ) : (
            <Button
              size="large"
              loading={purchaseState === 'loading'}
              loadingLabel="Submitting request…"
              onClick={onConfirm}
            >
              Submit purchase request <ArrowIcon />
            </Button>
          )}

          <small className="protection-authority-note">
            Alpha sends only the backend-issued quote and tier identifiers. Prices and payment amounts are not accepted from the browser.
          </small>
        </Card>
      </div>
    </>
  );
}
