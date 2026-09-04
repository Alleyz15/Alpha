import AssetLogo from '../../components/AssetLogo.jsx';
import { ArrowIcon, ClockIcon, ShieldIcon } from '../../components/Icons.jsx';
import PageBackLink from '../../components/PageBackLink.jsx';
import {
  Alert,
  Button,
  Card,
  FormField,
  MonoValue,
  RealityBadge,
  StatusBadge,
} from '../../components/ui/index.js';
import ProtectionProgress from './ProtectionProgress.jsx';
import useQuoteCountdown from './useQuoteCountdown.js';

export default function ConfigureProtectionStep({
  asset,
  contextReality,
  form,
  errors,
  dateBounds,
  quote,
  selectedTier,
  selectedTierId,
  quoteState,
  quoteError,
  invalidationNotice,
  refreshError,
  onFieldChange,
  onRequestQuote,
  onSelectTier,
  onContinue,
  onExit,
  exitLabel,
  exitTo,
}) {
  const secondsRemaining = useQuoteCountdown(quote?.expiresAt);
  const quoteExpired = secondsRemaining === 0;
  const priceLabel = quote ? quote.spot : asset.priceLabel;
  const executionKind = contextReality?.fill === 'operator' ? 'operator' : 'live';
  const executionLabel = contextReality?.fill === 'operator'
    ? 'Operator executes purchase'
    : 'Backend executes purchase';
  const hasUsableHolding = Number.isFinite(Number(asset.holdingUnits)) && Number(asset.holdingUnits) > 0;

  return (
    <>
      <PageBackLink to={exitTo} onClick={exitTo ? undefined : onExit}>{exitLabel}</PageBackLink>

      <div className="protection-config-topline">
        <header className="protection-heading">
          <div className="protection-asset-title">
            <AssetLogo symbol={asset.symbol} name={asset.name} size="large" />
            <div>
              <span className="protection-eyebrow">Alpha protection</span>
              <h1>Buy protection for {asset.name}</h1>
              <p>{asset.symbol} is selected from the asset page and cannot be changed during checkout.</p>
            </div>
          </div>

          <div className="protection-price" aria-live="polite">
            <span>{quote ? 'Price when quoted' : 'Current live price'}</span>
            <MonoValue as="strong">{priceLabel}</MonoValue>
            <small>{quote ? 'Fixed for this quote' : asset.updatedAtLabel}</small>
          </div>
        </header>

        <ProtectionProgress current="Configure" />
      </div>

      <div className="protection-reality-row" aria-label="What is real and simulated">
        <RealityBadge kind={contextReality?.quote ?? contextReality?.price} label="Live market quote" />
        <RealityBadge kind={contextReality?.balance} label="Simulated balance" />
        <RealityBadge kind={executionKind} label={executionLabel} />
        <RealityBadge kind={contextReality?.settlement} label="On-chain settlement" />
      </div>

      {refreshError && !quote && (
        <Alert tone="warning" title="The latest refresh failed">
          The last successful live market values remain visible. Alpha will try again automatically.
        </Alert>
      )}

      {invalidationNotice && (
        <Alert tone="info" title="Configuration changed">
          The previous quote was cleared because its price and choices no longer match these details. Get a new live quote to continue.
        </Alert>
      )}

      <div className="protection-checkout-grid">
        <div className="protection-config-column">
          <Card className="protection-config-card">
            <div className="protection-section-heading">
              <div>
                <span>01</span>
                <div><h2>Configure protection</h2><p>Tell Alpha how much downside protection you want to explore.</p></div>
              </div>
              <StatusBadge tone={asset.protectionAvailable ? 'live' : 'warning'}>
                {asset.availabilityLabel}
              </StatusBadge>
            </div>

            {!asset.protectionAvailable && (
              <Alert tone="warning" title="Protection is unavailable right now">
                {asset.unavailableReason}
              </Alert>
            )}

            <form className="protection-form" onSubmit={onRequestQuote} noValidate>
              <div className="protection-readonly-field">
                <span className="protection-readonly-label">Asset</span>
                <div className="protection-readonly-asset" aria-label="Selected asset">
                  <strong>{asset.name}</strong>
                  <MonoValue>{asset.symbol}</MonoValue>
                </div>
                <small>Selected from the asset page</small>
              </div>

              <FormField
                label="Amount to protect"
                hint={`Available: ${asset.holdingLabel} · Simulated holding`}
                error={errors.units}
              >
                <input
                  name="units"
                  type="number"
                  min="0.000001"
                  max={asset.holdingUnits}
                  step="any"
                  inputMode="decimal"
                  value={form.units}
                  onChange={onFieldChange}
                  placeholder={hasUsableHolding ? `Up to ${asset.holdingUnits}` : 'Holding unavailable'}
                  disabled={!hasUsableHolding}
                  required
                />
              </FormField>

              <FormField
                label="Protection target (%)"
                hint="10% asks for a floor near 10% below the quoted price."
                error={errors.protectionPct}
              >
                <input
                  name="protectionPct"
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  inputMode="numeric"
                  value={form.protectionPct}
                  onChange={onFieldChange}
                  placeholder="10"
                  required
                />
              </FormField>

              <FormField
                label="Target date"
                hint={asset.longestProtectionDays === 0
                  ? 'Available today only · Live market limit'
                  : `Available up to ${asset.longestProtectionDays} day${asset.longestProtectionDays === 1 ? '' : 's'} · Live market limit`}
                error={errors.targetDate}
              >
                <input
                  name="targetDate"
                  type="date"
                  min={dateBounds.minimum}
                  max={dateBounds.maximum}
                  value={form.targetDate}
                  onChange={onFieldChange}
                  required
                />
              </FormField>

              {quoteError && <Alert tone="error" title={quoteError.title}>{quoteError.message}</Alert>}

              <Button
                type="submit"
                size="large"
                loading={quoteState === 'loading'}
                loadingLabel="Getting live choices…"
                disabled={!asset.protectionAvailable || asset.spotUsdc == null || !hasUsableHolding}
              >
                Get live quote <ArrowIcon />
              </Button>
            </form>

            <section className="protection-choice-section" aria-labelledby="choice-title">
              <div className="protection-section-heading protection-choice-heading">
                <div>
                  <span>02</span>
                  <div>
                    <h2 id="choice-title">Available choices</h2>
                    <p>{quote
                      ? 'These choices came directly from the live backend quote.'
                      : 'Complete the configuration and get a live quote to see current market choices.'}</p>
                  </div>
                </div>
                {quote && (
                  <StatusBadge tone={quoteExpired ? 'danger' : 'live'} glyph={quoteExpired ? '○' : undefined}>
                    <ClockIcon size={14} /> {quoteExpired ? 'Quote expired' : `${secondsRemaining}s left`}
                  </StatusBadge>
                )}
              </div>

              {quote ? (
                <div className="protection-tier-list" role="radiogroup" aria-label="Available protection choices">
                  {quote.tiers.map((tier) => (
                    <button
                      key={tier.tierId}
                      type="button"
                      role="radio"
                      aria-checked={selectedTierId === tier.tierId}
                      className={`protection-tier ${selectedTierId === tier.tierId ? 'is-selected' : ''}`}
                      onClick={() => onSelectTier(tier.tierId)}
                    >
                      <span className="protection-tier-radio" aria-hidden="true" />
                      <span className="protection-tier-copy">
                        <span><strong>{tier.name}</strong>{tier.recommended && <StatusBadge tone="primary">Recommended</StatusBadge>}</span>
                        <small>{tier.description}</small>
                      </span>
                      <span className="protection-tier-stat"><small>Protection floor</small><MonoValue as="strong">{tier.floor}</MonoValue></span>
                      <span className="protection-tier-stat"><small>{tier.sizeConfirmed ? 'Protected amount' : 'Computed protection amount'}</small><strong>{tier.protectedAmount}</strong></span>
                      <span className="protection-tier-stat"><small>Cost</small><MonoValue as="strong">{tier.cost}</MonoValue></span>
                      <span className="protection-tier-stat"><small>End date</small><strong>{tier.expiry}</strong></span>
                      {!tier.sizeConfirmed && <span className="protection-tier-size-warning">Size check incomplete</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="protection-choice-placeholder" role="status">
                  <span aria-hidden="true">○</span>
                  <p>Your live protection choices will appear here. Alpha will not estimate or invent costs.</p>
                </div>
              )}

              {selectedTier?.sizeReduced && (
                <Alert tone="warning" title="Part of the holding remains unprotected">
                  {selectedTier.unprotectedAmount}, currently valued at {selectedTier.unprotectedValue}, is outside this choice.
                </Alert>
              )}
              {selectedTier && !selectedTier.sizeConfirmed && (
                <Alert tone="warning" title="This amount is not confirmed against operator capacity">
                  {selectedTier.sizeConfirmationMessage}
                </Alert>
              )}
            </section>
          </Card>

          <Card variant="inset" className="protection-how-card">
            <ShieldIcon />
            <div>
              <h2>How this works</h2>
              <p>Alpha reads the live market and shows only protection currently offered for {asset.symbol}. If the asset finishes below the selected floor on the end date, the protection pays the difference in USDC.</p>
            </div>
          </Card>

        </div>

        <Card className="protection-summary" aria-labelledby="summary-title">
          <div className="protection-summary-heading">
            <span>Order summary</span>
            <h2 id="summary-title">Your protection</h2>
          </div>

          <dl>
            <div><dt>Asset</dt><dd>{asset.name} ({asset.symbol})</dd></div>
            <div><dt>Recorded holding</dt><dd>{asset.holdingLabel}</dd></div>
            <div><dt>Amount requested</dt><dd>{form.units ? `${form.units} ${asset.symbol}` : '—'}</dd></div>
            <div><dt>{quote ? 'Price when quoted' : 'Current live price'}</dt><dd className="numeric">{priceLabel}</dd></div>
            <div><dt>Target date</dt><dd>{form.targetDate || '—'}</dd></div>
            <div><dt>Protection floor</dt><dd className="numeric">{selectedTier?.floor ?? '—'}</dd></div>
            <div><dt>{selectedTier?.sizeConfirmed ? 'Protected amount' : 'Computed protection amount'}</dt><dd>{selectedTier?.protectedAmount ?? '—'}</dd></div>
            <div><dt>Ends</dt><dd>{selectedTier?.expiry ?? '—'}</dd></div>
            <div className="protection-summary-total"><dt>Cost</dt><dd className="numeric">{selectedTier?.cost ?? '—'}</dd></div>
          </dl>

          <Button
            size="large"
            disabled={!selectedTier || quoteExpired}
            onClick={onContinue}
          >
            {quoteExpired ? 'Quote expired — request again above' : 'Continue to review'} <ArrowIcon />
          </Button>

          <p className="protection-summary-note">
            {quote
              ? 'The quote price is fixed while you review. The backend verifies its identifiers again before recording the request.'
              : 'Get a live quote to see actual choices and their costs. Alpha does not estimate these values in the browser.'}
          </p>
        </Card>
      </div>
    </>
  );
}
