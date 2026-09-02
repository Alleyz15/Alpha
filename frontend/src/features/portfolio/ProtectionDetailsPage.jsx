import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { liveApi } from '../../api/client.js';
import AssetLogo from '../../components/AssetLogo.jsx';
import { ExternalIcon, ShieldIcon } from '../../components/Icons.jsx';
import { Alert, AsyncState, Button, Card, MonoValue, StatusBadge } from '../../components/ui/index.js';
import ProtectionTrackingChart from './ProtectionTrackingChart.jsx';
import { formatDate, formatUsdc, toProtectionDetailViewModel } from './portfolioViewModel.js';

function statusTone(status, verifiedOnChain) {
  if (status === 'active' && verifiedOnChain) return 'success';
  if (['pending', 'pending_fill', 'pending_verification', 'needs_review'].includes(status)) return 'warning';
  if (status === 'failed') return 'danger';
  return 'primary';
}

function timelineProgress(position) {
  const start = new Date(position.purchasedAt ?? position.createdAt).getTime();
  const end = new Date(position.expiry).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100));
}

function DetailList({ children }) {
  return <dl className="pd-detail-list">{children}</dl>;
}

function DetailItem({ label, value, mono = false }) {
  return <div><dt>{label}</dt><dd className={mono ? 'numeric' : undefined}>{value}</dd></div>;
}

export default function ProtectionDetailsPage({ apiClient = liveApi, suppliedPositionId }) {
  const navigate = useNavigate();
  const params = useParams();
  const positionId = suppliedPositionId ?? params.positionId;
  const [state, setState] = useState('loading');
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [chartState, setChartState] = useState('loading');
  const [candles, setCandles] = useState([]);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const response = await apiClient.getPositionDetail(positionId);
      setPosition(response);
      setState('ready');
    } catch (loadError) {
      setError(loadError);
      setState('error');
    }
  }, [apiClient, positionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let current = true;
    if (!position?.asset) return undefined;
    setChartState('loading');
    apiClient.getAssetCandles(position.asset, '1W')
      .then((response) => {
        if (!current) return;
        setCandles(response.candles ?? []);
        setChartState('ready');
      })
      .catch(() => {
        if (!current) return;
        setCandles([]);
        setChartState('unavailable');
      });
    return () => { current = false; };
  }, [apiClient, position?.asset]);

  const detail = useMemo(
    () => position ? toProtectionDetailViewModel(position) : null,
    [position],
  );
  const currentMarketPrice = candles.length ? candles.at(-1)?.close : null;
  const progress = position ? timelineProgress(position) : 0;
  const activeDate = detail?.timeline.find((event) => event.event === 'confirmed_onchain')?.at;

  return (
    <main className="pd-page">
      <div className="pd-container">
        <button className="pd-back" type="button" onClick={() => navigate('/portfolio')}>← Back to Portfolio</button>

        <AsyncState
          state={state}
          loadingLabel="Loading the real contract details…"
          errorTitle={error?.status === 404 ? 'Protection not found' : 'Protection details could not be loaded'}
          errorMessage={error?.status === 404
            ? 'This protection does not exist or is not available to the current user.'
            : error?.message ?? 'Check that the backend is running, then try again.'}
          onRetry={load}
        >
          {detail && (
            <>
              <header className="pd-heading">
                <div className="pd-title-row">
                  <AssetLogo symbol={detail.symbol} name={detail.name} size="large" />
                  <div>
                    <span className="pd-eyebrow">Contract tracker</span>
                    <h1>{detail.title}</h1>
                  </div>
                  <StatusBadge tone={statusTone(detail.status, detail.verifiedOnChain)}>{detail.statusLabel}</StatusBadge>
                </div>
                <p>
                  Order {detail.orderIdLabel} <span aria-hidden="true">·</span> Expires {detail.expiryLabel}
                  <span aria-hidden="true">·</span> <strong>{detail.timeLeft.label} left</strong>
                </p>
              </header>

              {detail.status === 'active' && !detail.verifiedOnChain && (
                <Alert tone="warning" title="On-chain confirmation is not established">
                  This contract is not labelled confirmed protection until the backend verifies it on-chain.
                </Alert>
              )}

              <section className="pd-summary-grid" aria-label="Contract summary">
                <Card className="pd-summary-card">
                  <span>{detail.premium.label}</span>
                  <MonoValue as="strong">{detail.premium.value}</MonoValue>
                  {detail.premium.caption ? <small>{detail.premium.caption}</small> : null}
                </Card>
                <Card className="pd-summary-card">
                  <span>Time left</span>
                  <MonoValue as="strong">{detail.timeLeft.label}</MonoValue>
                  <small>{detail.timeLeft.caption}</small>
                </Card>
              </section>

              <Card className="pd-section">
                <div className="pd-section-heading"><span>01</span><div><h2>Contract overview</h2><p>The recorded terms of this position.</p></div></div>
                <DetailList>
                  <DetailItem label="Asset" value={`${detail.name} (${detail.symbol})`} />
                  <DetailItem label="Contract type" value={detail.contractType} />
                  <DetailItem label="Quantity covered" value={detail.quantityLabel} mono />
                  <DetailItem label="Entry price" value={detail.entryPriceLabel} mono />
                  <DetailItem label="Strike price" value={detail.strikeLabel} mono />
                  <DetailItem label="Purchase date" value={detail.purchaseDateLabel} />
                  <DetailItem label="Expiry date" value={detail.expiryLabel} />
                  <DetailItem label="Status" value={detail.statusLabel} />
                </DetailList>
              </Card>

              <Card className="pd-section">
                <div className="pd-section-heading"><span>02</span><div><h2>Live tracking</h2><p>The real market path compared with this contract’s strike.</p></div></div>
                {chartState === 'loading' ? (
                  <div className="pd-chart-loading" role="status"><span className="alpha-async-state__spinner" /> Loading live prices…</div>
                ) : (
                  <ProtectionTrackingChart candles={candles} strike={detail.isProtection ? detail.protectionFloorUsdc : detail.upsideThresholdUsdc} />
                )}
                {chartState === 'unavailable' && (
                  <Alert tone="warning" title="Live chart feed unavailable">
                    The rest of this page uses the stored contract record. No price path has been invented.
                  </Alert>
                )}
                <div className="pd-tracking-stats">
                  <div><span>Market price</span><MonoValue as="strong">{formatUsdc(currentMarketPrice) ?? '—'}</MonoValue></div>
                  <div><span>Protection status</span><StatusBadge tone={statusTone(detail.status, detail.verifiedOnChain)}>{detail.statusLabel}</StatusBadge></div>
                </div>
              </Card>

              <Card className="pd-section">
                <div className="pd-section-heading"><span>03</span><div><h2>Order details</h2><p>Who requested it, when it was created, and how it is handled.</p></div></div>
                <DetailList>
                  <DetailItem label="Buyer name" value={detail.buyerName} />
                  <DetailItem label="Order ID" value={detail.orderIdLabel} mono />
                  <DetailItem label="Account / wallet" value={detail.walletLabel} mono />
                  <DetailItem label="Order created" value={detail.orderCreatedLabel} />
                  <DetailItem label="Settlement type" value={detail.settlementTypeLabel} />
                  <DetailItem label="Payment method" value={detail.paymentMethodLabel} />
                </DetailList>
                <p className="pd-custody-note">The operator controls the execution wallet. This interface does not imply that the position is held in the user’s own wallet.</p>
                {detail.verifiedOnChain && detail.explorerUrl && (
                  <a className="pd-explorer-link" href={detail.explorerUrl} target="_blank" rel="noreferrer">
                    View confirmed transaction on BaseScan <ExternalIcon />
                  </a>
                )}
              </Card>

              <Card className="pd-section" id="contract-history">
                <div className="pd-section-heading"><span>04</span><div><h2>Contract timeline</h2><p>Execution and contract events returned by the backend.</p></div></div>
                <div className="pd-progress" aria-label={`${Math.round(progress)} percent of the contract time has elapsed`}>
                  <div className="pd-progress-track"><span style={{ width: `${progress}%` }} /></div>
                  <div className="pd-milestones">
                    <div><span>1</span><strong>Purchased</strong><small>{detail.purchaseDateLabel}</small></div>
                    <div><span>2</span><strong>Active</strong><small>{formatDate(activeDate)}</small></div>
                    <div><span>3</span><strong>Expiry</strong><small>{detail.expiryLabel}</small></div>
                  </div>
                </div>
                {detail.timeline.length > 0 ? (
                  <ol className="pd-history-list">
                    {detail.timeline.map((event, index) => <li key={`${event.event}-${event.at}-${index}`}><span>{event.label}</span><time dateTime={event.at}>{event.dateLabel}</time></li>)}
                  </ol>
                ) : <p className="pd-empty-copy">No contract events were returned.</p>}
              </Card>

              <Card variant="glass" className="pd-meaning-card">
                <div className="pd-meaning-icon"><ShieldIcon size={28} /></div>
                <div>
                  <h2>What this means for you</h2>
                  <p>{detail.meaning}</p>
                </div>
              </Card>

              <div className="pd-actions">
                <Button variant="ghost" onClick={() => document.getElementById('contract-history')?.scrollIntoView({ behavior: 'smooth' })}>View history</Button>
                <Button onClick={() => navigate(`/protect/${detail.symbol}`)}>Buy more protection</Button>
              </div>
            </>
          )}
        </AsyncState>
      </div>
    </main>
  );
}
