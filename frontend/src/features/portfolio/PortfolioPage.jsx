import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { liveApi } from '../../api/client.js';
import AssetLogo from '../../components/AssetLogo.jsx';
import { ArrowIcon, ShieldIcon, WalletIcon } from '../../components/Icons.jsx';
import { Alert, AsyncState, Button, Card, MonoValue, RealityBadge, StatusBadge } from '../../components/ui/index.js';
import { buildPortfolioRows, formatDate, formatUsdc } from './portfolioViewModel.js';

export default function PortfolioPage({ apiClient = liveApi }) {
  const navigate = useNavigate();
  const [state, setState] = useState('loading');
  const [portfolio, setPortfolio] = useState(null);
  const [positions, setPositions] = useState([]);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const [portfolioResponse, positionsResponse] = await Promise.all([
        apiClient.getPortfolio(),
        apiClient.getPositions(),
      ]);
      setPortfolio(portfolioResponse);
      setPositions(positionsResponse.positions ?? []);
      setState('ready');
    } catch (loadError) {
      setError(loadError);
      setState('error');
    }
  }, [apiClient]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () => buildPortfolioRows(portfolio?.holdings, positions),
    [portfolio, positions],
  );
  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rows;
    return rows.filter((row) => `${row.name} ${row.symbol}`.toLowerCase().includes(normalizedQuery));
  }, [query, rows]);

  return (
    <main className="portfolio-page">
      <div className="portfolio-container">
        <header className="portfolio-topbar">
          <button className="portfolio-brand" type="button" onClick={() => navigate('/')} aria-label="Go to Alpha Welcome">
            <span>α</span> ALPHA
          </button>
          <label className="portfolio-search">
            <span className="sr-only">Search holdings</span>
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your holdings" />
          </label>
        </header>

        <section className="portfolio-heading">
          <div>
            <span className="portfolio-eyebrow">Portfolio</span>
            <h1>My Crypto</h1>
            <p>See what you hold and whether each asset has confirmed downside protection.</p>
          </div>
          {portfolio?.simulated && <RealityBadge kind="simulated" label="Simulated holdings" />}
        </section>

        <AsyncState
          state={state}
          loadingLabel="Loading your real portfolio data…"
          errorTitle="Portfolio could not be loaded"
          errorMessage={error?.message ?? 'Check that the backend is running, then try again.'}
          onRetry={load}
        >
          {portfolio && (
            <>
              {!portfolio.totalValueComplete && (
                <Alert tone="warning" title="Portfolio value is incomplete">
                  {portfolio.unpricedAssets?.length
                    ? `${portfolio.unpricedAssets.join(', ')} could not be priced. The value below includes only the assets with live prices.`
                    : 'One or more holdings could not be priced. The value below is only a partial total.'}
                </Alert>
              )}

              <section className="portfolio-stats" aria-label="Portfolio summary">
                <Card className="portfolio-stat-card">
                  <div className="portfolio-stat-icon"><WalletIcon /></div>
                  <div>
                    <span>{portfolio.totalValueComplete ? 'Portfolio value' : 'Priced holdings value'}</span>
                    <MonoValue as="strong">{formatUsdc(portfolio.totalValueUsdc) ?? '—'}</MonoValue>
                    <small>Live USDC prices · simulated holdings</small>
                  </div>
                </Card>
                <Card className="portfolio-stat-card">
                  <div className="portfolio-stat-icon"><ShieldIcon /></div>
                  <div>
                    <span>Active protections</span>
                    <MonoValue as="strong">{portfolio.activeProtectionCount ?? '—'}</MonoValue>
                    <small>{portfolio.nextExpiry
                      ? `Next confirmed protection ends ${formatDate(portfolio.nextExpiry)}`
                      : 'No protection active'}</small>
                    {Number(portfolio.pendingProtectionCount) > 0 && (
                      <em>{portfolio.pendingProtectionCount} being set up</em>
                    )}
                  </div>
                </Card>
              </section>

              <Card className="portfolio-overview-card">
                <div className="portfolio-section-heading">
                  <div>
                    <span className="portfolio-eyebrow">Holdings</span>
                    <h2>Protection overview</h2>
                    <p>Only confirmed on-chain positions are labelled protected.</p>
                  </div>
                  <StatusBadge tone="live">Live prices</StatusBadge>
                </div>

                {rows.length === 0 ? (
                  <AsyncState
                    state="empty"
                    emptyTitle="No crypto holdings yet"
                    emptyMessage="Your non-USDC holdings will appear here when the backend returns them."
                  />
                ) : visibleRows.length === 0 ? (
                  <AsyncState
                    state="empty"
                    emptyTitle="No matching holding"
                    emptyMessage={`No asset matches “${query}”.`}
                  />
                ) : (
                  <div className="portfolio-table-scroll">
                    <table className="portfolio-table">
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Holdings</th>
                          <th>Current price</th>
                          <th>Protection</th>
                          <th>Expiry</th>
                          <th><span className="sr-only">Action</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((row) => (
                          <tr key={row.asset}>
                            <td>
                              <div className="portfolio-coin-cell">
                                <AssetLogo symbol={row.symbol} name={row.name} size="small" />
                                <span><strong>{row.name}</strong><small>{row.symbol} · {row.valueLabel}</small></span>
                              </div>
                            </td>
                            <td className="numeric">{row.holdingsLabel}</td>
                            <td className="numeric">{row.priceLabel}</td>
                            <td>
                              <StatusBadge tone={row.protectionState === 'active' ? 'success' : row.protectionState === 'pending' ? 'warning' : 'danger'}>
                                {row.protectionLabel}
                              </StatusBadge>
                            </td>
                            <td>{row.expiryLabel}</td>
                            <td className="portfolio-action-cell">
                              {row.positionId ? (
                                <Button
                                  variant="ghost"
                                  size="small"
                                  onClick={() => navigate(row.currentPositionCount > 1 ? `/positions/${row.symbol}` : `/protection/${row.positionId}`)}
                                >
                                  {row.currentPositionCount > 1 ? 'View positions' : 'View'} <ArrowIcon size={14} />
                                </Button>
                              ) : (
                                <Button size="small" onClick={() => navigate(`/protect/${row.symbol}`)}>
                                  Buy protection
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="portfolio-position-scope">
                  This holdings summary counts active and pending positions. Open an asset to see its complete history, including settled and failed requests.
                </p>
              </Card>
            </>
          )}
        </AsyncState>
      </div>
    </main>
  );
}
