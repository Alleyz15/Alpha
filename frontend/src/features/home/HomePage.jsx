import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { liveApi } from '../../api/client.js';
import AssetLogo from '../../components/AssetLogo.jsx';
import { ArrowIcon, ShieldIcon } from '../../components/Icons.jsx';
import { Alert, Button, Card, MonoValue, StatusBadge } from '../../components/ui/index.js';
import MarketSparkline from './MarketSparkline.jsx';
import {
  formatPortfolioValue,
  marketUpdateLabel,
  portfolioValueCaption,
  rankTrendingAssets,
  toHomeMarketAsset,
} from './homeViewModel.js';
import useHomeAnimations from './useHomeAnimations.js';
import useHomeData from './useHomeData.js';

function PortfolioIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v12H4z" /><path d="M8 7V5h8v2M4 11h16M10 15h4" /></svg>;
}

function MarketIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16" /><path d="m7 15 4-4 3 2 5-6" /></svg>;
}

function initials(displayName) {
  if (!displayName) return 'A';
  return displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function ChangeChip({ asset, compact = false }) {
  const numeric = Number(asset.priceChange24hPct);
  const available = Number.isFinite(numeric);
  const tone = available ? asset.changeTone : 'neutral';
  return (
    <span className={`home-change-chip home-change-chip--${tone} ${compact ? 'home-change-chip--compact' : ''}`}>
      <span aria-hidden="true">{available ? numeric >= 0 ? '▲' : '▼' : '○'}</span>
      {asset.changeLabel}{!compact && available ? ' (24h)' : ''}
    </span>
  );
}

function HomeRail({ navigate }) {
  return (
    <aside className="home-rail" aria-label="Primary navigation">
      <button className="home-rail__brand" type="button" onClick={() => navigate('/')} aria-label="Alpha Welcome">α</button>
      <nav>
        <button className="is-active" type="button" aria-current="page" aria-label="Markets"><MarketIcon /></button>
        <button type="button" onClick={() => navigate('/portfolio')} aria-label="Portfolio"><PortfolioIcon /></button>
      </nav>
      <button className="home-rail__help" type="button" onClick={() => navigate('/#product-reality')} aria-label="Product reality">?</button>
    </aside>
  );
}

export default function HomePage({ apiClient = liveApi }) {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const [query, setQuery] = useState('');
  const { demo, portfolio, market, candles, candleFailures, retry } = useHomeData(apiClient);

  const assets = useMemo(
    () => (market.data?.assets ?? []).map((asset) => toHomeMarketAsset(asset, candles[asset.symbol] ?? [])),
    [candles, market.data],
  );
  const trending = useMemo(() => rankTrendingAssets(assets), [assets]);
  const visibleAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return assets;
    return assets.filter((asset) => `${asset.name} ${asset.symbol}`.toLowerCase().includes(normalized));
  }, [assets, query]);
  const updateLabel = marketUpdateLabel(assets);
  const marketKey = assets.map((asset) => `${asset.symbol}:${asset.priceUsd}:${asset.priceChange24hPct}`).join('|');
  useHomeAnimations(rootRef, marketKey);

  const marketRefreshingFailed = market.refreshError || portfolio.refreshError;

  return (
    <div className="home-shell" ref={rootRef}>
      <HomeRail navigate={navigate} />
      <main className="home-main">
        <header className="home-topbar">
          <label className="home-search">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search cryptocurrencies</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cryptocurrencies" />
          </label>
          <div className="home-topbar__actions">
            <Button className="home-protection-button" variant="ghost" onClick={() => navigate('/portfolio')}>
              <ShieldIcon size={17} /> Protection overview
            </Button>
            <div className="home-avatar" aria-label={demo.data?.displayName ? `Signed in as ${demo.data.displayName}` : 'Alpha user'}>
              {initials(demo.data?.displayName)}
            </div>
          </div>
        </header>

        {marketRefreshingFailed && (
          <Alert tone="warning" title="A live refresh was interrupted">
            The last successful values remain visible. Alpha will retry automatically while this page is open.
          </Alert>
        )}

        <section className="home-portfolio-card" aria-labelledby="home-portfolio-title">
          <div className="home-portfolio-copy">
            <span className="home-eyebrow">
              {portfolio.state === 'ready' && <i className="home-live-dot" />}
              {portfolio.state === 'ready' ? 'Live portfolio' : 'Portfolio'}
            </span>
            <h1 id="home-portfolio-title">Portfolio value</h1>
            {portfolio.state === 'loading' ? (
              <div className="home-value-skeleton" role="status" aria-label="Loading portfolio value" />
            ) : portfolio.state === 'error' ? (
              <div className="home-inline-error">
                <strong>Portfolio value unavailable</strong>
                <button type="button" onClick={retry}>Try again</button>
              </div>
            ) : (
              <>
                <MonoValue as="strong" data-home-value>{formatPortfolioValue(portfolio.data)}</MonoValue>
                <p className={!portfolio.data?.totalValueComplete ? 'is-warning' : undefined}>
                  {portfolioValueCaption(portfolio.data)}
                </p>
              </>
            )}
            <button className="home-text-link" type="button" onClick={() => navigate('/portfolio')}>
              View full portfolio <ArrowIcon size={14} />
            </button>
          </div>
          <div className="home-data-visual" aria-hidden="true">
            <div className="home-data-orbit home-data-orbit--outer">
              <i className="home-data-node home-data-node--one" />
              <i className="home-data-node home-data-node--two" />
              <i className="home-data-node home-data-node--three" />
            </div>
            <div className="home-data-orbit home-data-orbit--inner" />
            <div className="home-data-core"><ShieldIcon size={28} /><span>LIVE</span></div>
          </div>
          <div className="home-portfolio-source">
            <span>VALUATION BASIS</span>
            <strong>Live USDC pricing</strong>
            <small>Displayed balances are simulated</small>
          </div>
        </section>

        <section className="home-trending" aria-labelledby="home-trending-title">
          <div className="home-section-heading home-section-heading--inline">
            <div>
              <h2 id="home-trending-title">Trending now</h2>
              <p>Alpha’s supported assets, ranked by absolute 24-hour movement.</p>
            </div>
            <span>{updateLabel}</span>
          </div>
          {market.state === 'loading' ? (
            <div className="home-trending-skeleton" role="status" aria-label="Loading market trends">
              {[0, 1, 2, 3].map((item) => <i key={item} />)}
            </div>
          ) : market.state === 'error' ? (
            <Alert tone="error" title="Live market trends unavailable" actions={<Button variant="ghost" size="small" onClick={retry}>Try again</Button>}>
              No sample rankings have been substituted.
            </Alert>
          ) : (
            <div className="home-trending-list">
              {trending.map((asset, index) => (
                <button className="home-trending-card" type="button" key={asset.symbol} onClick={() => navigate(`/coin/${asset.symbol}`)}>
                  <MonoValue as="span">#{index + 1}</MonoValue>
                  <AssetLogo symbol={asset.symbol} name={asset.name} size="small" />
                  <span className="home-trending-copy"><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
                  <ChangeChip asset={asset} compact />
                </button>
              ))}
            </div>
          )}
        </section>

        <Card className="home-market-panel">
          <div className="home-section-heading">
            <div>
              <span className="home-eyebrow">Market overview</span>
              <h2>Supported assets</h2>
              <p>Prices and market caps are aggregated USD data. Seven-day trends use Binance USDT candles.</p>
            </div>
            <StatusBadge tone={market.state === 'ready' ? 'live' : 'neutral'}>
              {market.state === 'ready' ? 'Live market data' : market.state === 'loading' ? 'Loading market data' : 'Market unavailable'}
            </StatusBadge>
          </div>

          {market.state === 'loading' ? (
            <div className="home-table-skeleton" role="status" aria-label="Loading cryptocurrencies">
              {[0, 1, 2, 3].map((item) => <i key={item} />)}
            </div>
          ) : market.state === 'error' ? (
            <div className="home-market-error">
              <strong>Market table unavailable</strong>
              <p>The provider did not return real market data. No prices were invented.</p>
              <Button variant="ghost" size="small" onClick={retry}>Try again</Button>
            </div>
          ) : visibleAssets.length === 0 ? (
            <div className="home-market-error">
              <strong>No matching cryptocurrency</strong>
              <p>No supported asset matches “{query}”.</p>
            </div>
          ) : (
            <div className="home-table-scroll">
              <table className="home-market-table">
                <thead><tr><th>Coin</th><th>Price</th><th>24h change</th><th>Market cap</th><th>7d trend (Binance USDT)</th></tr></thead>
                <tbody>
                  {visibleAssets.map((asset) => (
                    <tr className="home-market-row" key={asset.symbol}>
                      <td>
                        <button className="home-coin-link" type="button" onClick={() => navigate(`/coin/${asset.symbol}`)}>
                          <AssetLogo symbol={asset.symbol} name={asset.name} size="small" />
                          <span><strong>{asset.name}</strong><small>{asset.symbol}</small></span>
                        </button>
                      </td>
                      <td className="numeric">{asset.priceLabel}</td>
                      <td><ChangeChip asset={asset} /></td>
                      <td className="numeric">{asset.marketCapLabel}</td>
                      <td><MarketSparkline values={asset.candleCloses} tone={asset.sevenDayTone} symbol={asset.symbol} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {candleFailures.length > 0 && market.state === 'ready' && (
            <p className="home-source-warning">Seven-day trend unavailable for {candleFailures.join(', ')}. No fallback chart is shown.</p>
          )}
        </Card>
      </main>
    </div>
  );
}
