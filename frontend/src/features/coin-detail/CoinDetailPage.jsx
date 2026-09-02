import AssetLogo from '../../components/AssetLogo.jsx';
import { ShieldIcon } from '../../components/Icons.jsx';
import { AsyncState, Button, Card, MonoValue, StatusBadge } from '../../components/ui/index.js';
import CoinChartSlot from './CoinChartSlot.jsx';
import { formatUpdatedAt } from './coinDetailViewModel.js';
import useCoinDetailData from './useCoinDetailData.js';

function CoinDetailNav({ onBack, onDashboard }) {
  return (
    <header className="coin-site-nav">
      <button className="coin-brand" type="button" onClick={onBack} aria-label="Alpha markets">
        <span><ShieldIcon size={18} /></span><strong>ALPHA</strong><small>Market detail</small>
      </button>
      <nav aria-label="Coin detail navigation">
        <button type="button" onClick={onBack}>Markets</button>
        <button type="button" onClick={onDashboard}>My protection</button>
      </nav>
    </header>
  );
}

function OrderRows({ rows, side, symbol, quoteCurrency }) {
  const visibleRows = (rows || []).slice(0, 5);
  const maximumQuantity = Math.max(...visibleRows.map((row) => Number(row.quantity) || 0), 1);

  return visibleRows.map((row) => {
    const depth = Math.min(100, ((Number(row.quantity) || 0) / maximumQuantity) * 100);
    return (
      <div className={`order-book-row order-book-row--${side}`} key={`${side}-${row.price}`} style={{ '--depth': `${depth}%` }}>
        <MonoValue>{Number(row.price).toLocaleString(undefined, { maximumFractionDigits: 8 })} {quoteCurrency}</MonoValue>
        <MonoValue>{Number(row.quantity).toLocaleString(undefined, { maximumFractionDigits: 6 })} {symbol}</MonoValue>
      </div>
    );
  });
}

function OrderBookPanel({ state, onRetry, symbol }) {
  if (state.status === 'loading' || state.status === 'idle') {
    return <Card className="coin-order-book"><AsyncState state="loading" loadingLabel="Loading Binance order book…" /></Card>;
  }
  if (state.status === 'error' || !state.data) {
    return (
      <Card className="coin-order-book">
        <AsyncState
          state="error"
          errorTitle="Order book temporarily unavailable"
          errorMessage="Alpha could not reach Binance. No empty or cached order book has been shown as current."
          onRetry={onRetry}
        />
      </Card>
    );
  }

  const book = state.data;
  return (
    <Card className="coin-order-book">
      <header>
        <div><span>Live depth snapshot</span><h2>Order book</h2></div>
        <StatusBadge tone="live">{state.status === 'refreshing' ? 'Refreshing' : `${book.venue} · live`}</StatusBadge>
      </header>
      <div className="order-book-columns"><span>Price</span><span>Size</span></div>
      <div className="order-book-side order-book-side--asks">
        <OrderRows rows={book.asks} side="ask" symbol={symbol} quoteCurrency={book.quoteCurrency} />
      </div>
      <div className="order-book-spread"><span>{book.pair}</span><small>{formatUpdatedAt(book.updatedAt)}</small></div>
      <div className="order-book-side">
        <OrderRows rows={book.bids} side="bid" symbol={symbol} quoteCurrency={book.quoteCurrency} />
      </div>
      <p className="order-book-scope">{book.scopeStatement}</p>
    </Card>
  );
}

function OverviewStats({ asset }) {
  const stats = [
    ['Market cap', asset.marketCapLabel],
    ['24h volume', asset.volumeLabel],
    ['Circulating supply', asset.supplyLabel],
    ['All-time high', asset.allTimeHighLabel],
  ];
  return (
    <section className="coin-stat-grid" aria-label={`${asset.name} market statistics`}>
      {stats.map(([label, value]) => <Card key={label}><span>{label}</span><MonoValue as="strong">{value}</MonoValue></Card>)}
    </section>
  );
}

export default function CoinDetailPage({
  symbol,
  apiClient,
  onBack,
  onDashboard,
  onProtect,
  orderBookPollInterval = 3_000,
}) {
  const data = useCoinDetailData(apiClient, symbol, orderBookPollInterval);
  const { overview } = data;

  return (
    <div className="coin-detail-page">
      <CoinDetailNav onBack={onBack} onDashboard={onDashboard} />
      <main className="coin-detail-main">
        {overview.status === 'loading' ? (
          <div className="coin-detail-state"><AsyncState state="loading" loadingLabel={`Loading live ${symbol} market data…`} /></div>
        ) : null}
        {overview.status === 'error' ? (
          <div className="coin-detail-state">
            <AsyncState
              state="error"
              errorTitle="Market overview temporarily unavailable"
              errorMessage="CoinGecko did not return current data. Alpha has not substituted zeros or sample values."
              onRetry={data.retryOverview}
            />
          </div>
        ) : null}
        {overview.status === 'not-found' ? (
          <div className="coin-detail-state">
            <AsyncState
              state="error"
              errorTitle={`${symbol} market detail is not offered`}
              errorMessage="Return to Markets and choose an asset returned by the live overview endpoint."
              onRetry={onBack}
              retryLabel="Back to Markets"
            />
          </div>
        ) : null}
        {overview.status === 'ready' ? (
          <>
            <button className="coin-detail-back" type="button" onClick={onBack}>← Markets</button>
            <header className="coin-detail-header">
              <div className="coin-detail-identity">
                <AssetLogo symbol={symbol} name={overview.asset.name} imageUrl={overview.asset.image} size="large" />
                <div><span>Live asset overview</span><h1>{overview.asset.name}</h1><p>{symbol} · Market cap {overview.asset.marketCapLabel}</p></div>
              </div>
              <div className="coin-detail-price">
                <span>{overview.asset.source} aggregated price</span>
                <MonoValue as="strong">{overview.asset.priceLabel}</MonoValue>
                <div>
                  <StatusBadge tone={overview.asset.changeTone === 'positive' ? 'success' : overview.asset.changeTone === 'negative' ? 'danger' : 'neutral'}>
                    {overview.asset.changeLabel} · 24h
                  </StatusBadge>
                  <small>{overview.asset.updatedAtLabel}</small>
                </div>
              </div>
            </header>

            <div className="coin-detail-grid">
              <div className="coin-detail-market-column">
                <CoinChartSlot symbol={symbol} apiClient={apiClient} />
                <OverviewStats asset={overview.asset} />
                <Card className="coin-detail-about">
                  <span>About {overview.asset.name}</span>
                  <h2>{overview.asset.name} market context</h2>
                  <p>This page combines CoinGecko's aggregated USD overview with Binance's {symbol}/USDT market data. Alpha protection is a separate product priced from Thetanuts in USDC.</p>
                </Card>
                <Card className="coin-detail-boundary">
                  <span>Three prices, three sources</span>
                  <p>CoinGecko overview values are USD. The Binance chart and order book use USDT. Alpha protection quotes use USDC from Thetanuts. These values are intentionally not merged.</p>
                </Card>
              </div>
              <aside className="coin-detail-side-column">
                <Card variant="glass" className="coin-protection-card">
                  <span>Alpha downside protection</span>
                  <h2>Set a floor for {symbol}</h2>
                  <p>See live choices priced separately from this Binance market view.</p>
                  <Button size="large" onClick={onProtect}>Protect {symbol}</Button>
                </Card>
                <OrderBookPanel state={data.orderBook} onRetry={data.retryOrderBook} symbol={symbol} />
              </aside>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
