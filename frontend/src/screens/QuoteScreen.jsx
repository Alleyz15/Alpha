import { useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { toApiErrorViewModel, toQuoteViewModel } from '../adapters/quoteViewModel.js';
import { ArrowIcon, ShieldIcon } from '../components/Icons.jsx';
import RealityDisclosure from '../components/RealityDisclosure.jsx';

export default function QuoteScreen({ demoContext, isMock, reality, onReview }) {
  const balance = demoContext?.balances?.find((item) => item.asset === 'ETH');
  const [units, setUnits] = useState('0.4');
  const [protectionPct, setProtectionPct] = useState('20');
  const [quote, setQuote] = useState(null);
  const [selectedTierId, setSelectedTierId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const selectedTier = useMemo(
    () => quote?.tiers.find((tier) => tier.tierId === selectedTierId) ?? null,
    [quote, selectedTierId],
  );

  async function submit(event) {
    event.preventDefault();
    setStatus('loading');
    setError(null);
    setQuote(null);

    const request = {
      asset: 'ETH',
      units: Number(units),
      mode: 'percentage',
      protectionPct: Number(protectionPct),
    };

    try {
      const response = await api.createQuote(request);
      const viewModel = toQuoteViewModel(response);
      setQuote(viewModel);
      setSelectedTierId(viewModel.defaultTierId);
      setStatus('ready');
    } catch (requestError) {
      setError(toApiErrorViewModel(requestError, request));
      setStatus('error');
    }
  }

  return (
    <div className="page-grid quote-page">
      <section className="intro-panel">
        <RealityDisclosure variant="quoteEyebrow" isMock={isMock} reality={reality} />
        <h1>Keep the upside.<br />Set a floor for the downside.</h1>
        <p className="intro-copy">Choose what you hold and what matters to you. We turn it into clear protection choices.</p>

        <div className="trust-list">
          <div><span className="trust-icon"><ShieldIcon /></span><p><strong>Loss is limited</strong><small>You see the maximum before confirming.</small></p></div>
          <div><span className="trust-number">01</span><p><strong>One clear action</strong><small>No wallet setup is needed for this demo.</small></p></div>
          <div><span className="trust-number">↗</span><p><strong>Verifiable on Base</strong><RealityDisclosure variant="verification" isMock={isMock} reality={reality} /></p></div>
        </div>
      </section>

      <section className="quote-workspace" aria-labelledby="quote-title">
        <div className="section-heading">
          <div>
            <span className="step-label">Step 1</span>
            <h2 id="quote-title">Build your protection</h2>
          </div>
          {balance && <span className="balance-pill">Simulated balance · {balance.amount} {balance.asset}</span>}
        </div>

        <form className="quote-form" onSubmit={submit}>
          <div className="field-row">
            <label>
              <span>Asset</span>
              <select value="ETH" disabled><option>ETH · Ethereum</option></select>
            </label>
            <label>
              <span>Amount to protect</span>
              <div className="input-suffix"><input type="number" min="0.000001" step="0.000001" value={units} onChange={(event) => setUnits(event.target.value)} required /><b>ETH</b></div>
            </label>
          </div>

          <label>
            <span>Try to protect me after a drop of</span>
            <div className="input-suffix"><input type="number" min="1" max="99" step="1" value={protectionPct} onChange={(event) => setProtectionPct(event.target.value)} required /><b>%</b></div>
            <small>We will show the closest protection levels actually available.</small>
          </label>

          <button className="primary-button" type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? 'Checking available choices…' : 'See protection choices'}
            {status !== 'loading' && <ArrowIcon />}
          </button>
        </form>

        <RealityDisclosure variant="explore" isMock={isMock} reality={reality} balance={balance ? `${balance.amount} ${balance.asset}` : 'demo ETH balance'} />

        {error && <div className="error-message" role="alert"><strong>{error.title}</strong><span>{error.message}</span></div>}

        {quote && (
          <div className="quote-results" aria-live="polite">
            <div className="results-heading">
              <div><span className="step-label">Step 2</span><h2>Choose your floor</h2></div>
              <p>ETH now <strong>{quote.spot}</strong></p>
            </div>

            <div className="tier-list" role="radiogroup" aria-label="Protection choices">
              {quote.tiers.map((tier) => (
                <button
                  key={tier.tierId}
                  type="button"
                  role="radio"
                  aria-checked={selectedTierId === tier.tierId}
                  className={`tier-card ${selectedTierId === tier.tierId ? 'selected' : ''}`}
                  onClick={() => setSelectedTierId(tier.tierId)}
                >
                  <span className="radio-dot" />
                  <span className="tier-main">
                    <span className="tier-title">{tier.name}{tier.recommended && <em>Recommended</em>}</span>
                    <small>{tier.description}</small>
                    <span className="tier-meta">Protects {tier.protectedAmount} · ends {tier.expiry}</span>
                  </span>
                  <span className="tier-numbers"><strong>{tier.floor}</strong><small>your floor</small><b>{tier.cost}</b><small>cost</small></span>
                </button>
              ))}
            </div>

            {selectedTier?.sizeReduced && (
              <div className="notice warning">
                This choice protects part of your holding. {selectedTier.unprotectedAmount} ({selectedTier.unprotectedValue}) remains unprotected.
              </div>
            )}

            <button className="primary-button" type="button" disabled={!selectedTier} onClick={() => onReview(quote, selectedTier)}>
              Review this protection <ArrowIcon />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
