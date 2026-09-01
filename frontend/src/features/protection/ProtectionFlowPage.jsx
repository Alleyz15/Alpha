import { useCallback, useEffect, useMemo, useState } from 'react';
import { toApiErrorViewModel, toMarketAssetViewModel, toQuoteViewModel } from '../../adapters/quoteViewModel.js';
import { AsyncState, Button, Card } from '../../components/ui/index.js';
import ConfigureProtectionStep from './ConfigureProtectionStep.jsx';
import ProtectionStatusStep from './ProtectionStatusStep.jsx';
import ReviewProtectionStep from './ReviewProtectionStep.jsx';
import useMarketContext from './useMarketContext.js';
import { getDateBounds, isSupportedAsset, validateConfiguration } from './protectionFlowUtils.js';

function UnsupportedAsset({ symbol, onExit }) {
  return (
    <main className="protection-flow">
      <div className="protection-container protection-container--state">
        <Card variant="glass" className="protection-route-error">
          <span className="protection-eyebrow">Unsupported asset</span>
          <h1>Alpha cannot configure protection for “{symbol}”.</h1>
          <p>This checkout currently accepts ETH, BTC, BNB, or SOL. Return to the asset page and choose one of those supported assets.</p>
          <Button onClick={onExit}>Back to asset</Button>
        </Card>
      </div>
    </main>
  );
}

function SupportedProtectionFlow({ symbol, apiClient, onExit, marketPollInterval }) {
  const [step, setStep] = useState('Configure');
  const [form, setForm] = useState({ units: '', protectionPct: '10', targetDate: '' });
  const [errors, setErrors] = useState({});
  const [quote, setQuote] = useState(null);
  const [selectedTierId, setSelectedTierId] = useState(null);
  const [quoteState, setQuoteState] = useState('idle');
  const [quoteError, setQuoteError] = useState(null);
  const [invalidationNotice, setInvalidationNotice] = useState(false);
  const [purchaseState, setPurchaseState] = useState('idle');
  const [purchaseError, setPurchaseError] = useState(null);
  const [purchase, setPurchase] = useState(null);
  const [demoContext, setDemoContext] = useState(null);
  const [demoState, setDemoState] = useState('loading');

  const market = useMarketContext({
    apiClient,
    enabled: !quote && step === 'Configure',
    intervalMs: marketPollInterval,
  });

  const loadDemoContext = useCallback(async () => {
    setDemoState('loading');
    try {
      setDemoContext(await apiClient.getDemoContext());
      setDemoState('ready');
    } catch {
      setDemoState('error');
    }
  }, [apiClient]);

  useEffect(() => {
    loadDemoContext();
  }, [loadDemoContext]);

  const asset = useMemo(() => {
    const rawAsset = market.context?.assets?.find((item) => item.symbol === symbol);
    return rawAsset ? toMarketAssetViewModel(rawAsset, market.context.updatedAt) : null;
  }, [market.context, symbol]);

  const selectedTier = useMemo(
    () => quote?.tiers.find((tier) => tier.tierId === selectedTierId) ?? null,
    [quote, selectedTierId],
  );

  if (market.state === 'loading' || demoState === 'loading') {
    return (
      <main className="protection-flow">
        <div className="protection-container protection-container--state">
          <AsyncState state="loading" loadingLabel={`Loading live ${symbol} protection…`} />
        </div>
      </main>
    );
  }

  if (market.state === 'error' || demoState === 'error') {
    const retry = () => {
      market.retry();
      loadDemoContext();
    };
    return (
      <main className="protection-flow">
        <div className="protection-container protection-container--state">
          <AsyncState
            state="error"
            errorTitle="Live backend data is unavailable"
            errorMessage="Alpha could not load the real market context and demo-account boundary, so this checkout has stopped instead of showing substitute data."
            onRetry={retry}
          />
        </div>
      </main>
    );
  }

  if (!asset) {
    return (
      <main className="protection-flow">
        <div className="protection-container protection-container--state">
          <AsyncState
            state="error"
            errorTitle={`${symbol} is missing from the backend response`}
            errorMessage="The page will not create a placeholder asset. Ask the backend team to inspect GET /api/market-context."
            onRetry={market.retry}
          />
        </div>
      </main>
    );
  }

  const dateBounds = getDateBounds(asset.longestProtectionDays);
  const contextReality = { ...market.context.reality, ...demoContext?.reality };

  function changeField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setQuoteError(null);

    if (quote) {
      setQuote(null);
      setSelectedTierId(null);
      setQuoteState('idle');
      setInvalidationNotice(true);
    }
  }

  async function requestQuote(event) {
    event.preventDefault();
    const nextErrors = validateConfiguration({ ...form, asset, dateBounds });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const request = {
      asset: symbol,
      units: Number(form.units),
      mode: 'percentage',
      protectionPct: Number(form.protectionPct),
      targetDate: form.targetDate,
    };

    setQuoteState('loading');
    setQuoteError(null);
    setQuote(null);
    setSelectedTierId(null);

    try {
      const viewModel = toQuoteViewModel(await apiClient.createQuote(request));
      if (viewModel.tiers.length === 0) {
        throw Object.assign(new Error('No protection tiers were returned.'), {
          payload: { error: { code: 'NO_TIERS' } },
        });
      }
      setQuote(viewModel);
      setSelectedTierId(viewModel.defaultTierId);
      setQuoteState('ready');
      setInvalidationNotice(false);
    } catch (requestError) {
      setQuoteError(toApiErrorViewModel(requestError, request));
      setQuoteState('error');
    }
  }

  function continueToReview() {
    if (!quote || !selectedTier) return;
    if (Date.now() >= new Date(quote.expiresAt).getTime()) {
      setQuoteError(toApiErrorViewModel({ payload: { error: { code: 'QUOTE_EXPIRED' } } }));
      return;
    }
    setStep('Review');
    setPurchaseError(null);
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  async function confirmPurchase() {
    if (purchaseState === 'loading' || !quote || !selectedTier) return;
    setPurchaseState('loading');
    setPurchaseError(null);

    try {
      const result = await apiClient.purchaseQuote({
        quoteId: quote.quoteId,
        tierId: selectedTier.tierId,
      });
      setPurchase(result);
      setPurchaseState('ready');
      setStep('Status');
      window.scrollTo?.({ top: 0, behavior: 'smooth' });
    } catch (requestError) {
      setPurchaseError(toApiErrorViewModel(requestError));
      setPurchaseState('error');
    }
  }

  return (
    <main className="protection-flow">
      <div className={`protection-container ${step === 'Configure' ? 'protection-container--configure' : ''}`}>
        {step === 'Configure' && (
          <ConfigureProtectionStep
            asset={asset}
            contextReality={contextReality}
            form={form}
            errors={errors}
            dateBounds={dateBounds}
            quote={quote}
            selectedTier={selectedTier}
            selectedTierId={selectedTierId}
            quoteState={quoteState}
            quoteError={quoteError}
            invalidationNotice={invalidationNotice}
            refreshError={market.refreshError}
            onFieldChange={changeField}
            onRequestQuote={requestQuote}
            onSelectTier={setSelectedTierId}
            onContinue={continueToReview}
            onExit={onExit}
          />
        )}

        {step === 'Review' && quote && selectedTier && (
          <ReviewProtectionStep
            asset={asset}
            contextReality={contextReality}
            quote={quote}
            tier={selectedTier}
            purchaseState={purchaseState}
            purchaseError={purchaseError}
            onBack={() => setStep('Configure')}
            onConfirm={confirmPurchase}
          />
        )}

        {step === 'Status' && quote && selectedTier && purchase && (
          <ProtectionStatusStep
            asset={asset}
            quote={quote}
            tier={selectedTier}
            purchase={purchase}
            onExit={onExit}
          />
        )}
      </div>
    </main>
  );
}

export default function ProtectionFlowPage({
  symbol,
  apiClient,
  onExit = () => window.history.back(),
  marketPollInterval = 30_000,
}) {
  if (!isSupportedAsset(symbol)) {
    return <UnsupportedAsset symbol={symbol} onExit={onExit} />;
  }

  return (
    <SupportedProtectionFlow
      symbol={symbol}
      apiClient={apiClient}
      onExit={onExit}
      marketPollInterval={marketPollInterval}
    />
  );
}
