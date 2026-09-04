import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { liveApi } from '../../api/client.js';
import AssetLogo from '../../components/AssetLogo.jsx';
import { ArrowIcon, ClockIcon, ShieldIcon, WalletIcon } from '../../components/Icons.jsx';
import { Alert, AsyncState, Button, Card, MonoValue, RealityBadge, StatusBadge } from '../../components/ui/index.js';
import VaultDepositsSection from './VaultDepositsSection.jsx';
import LendingEntryCard from './LendingEntryCard.jsx';
import { buildPortfolioRows, formatDate, formatUsdc } from './portfolioViewModel.js';

export default function PortfolioPage({ apiClient = liveApi }) {
  const navigate = useNavigate();
  const [state, setState] = useState('loading');
  const [portfolio, setPortfolio] = useState(null);
  const [positions, setPositions] = useState([]);
  const [error, setError] = useState(null);

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
  const usdcAvailable = portfolio?.holdings?.find((holding) => holding.asset === 'USDC')?.amount ?? null;

  return (
    <main className="portfolio-page">
      <div className="portfolio-container">
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
                    <small>Confirmed downside protection</small>
                    {Number(portfolio.pendingProtectionCount) > 0 && (
                      <em>{portfolio.pendingProtectionCount} being set up</em>
                    )}
                  </div>
                </Card>
                <Card className="portfolio-stat-card portfolio-stat-card--expiry">
                  <div className="portfolio-stat-icon"><ClockIcon size={22} /></div>
                  <div>
                    <span>Next protection end</span>
                    <MonoValue
                      as={portfolio.nextExpiry ? 'time' : 'strong'}
                      dateTime={portfolio.nextExpiry || undefined}
                      className={portfolio.nextExpiry ? '' : 'portfolio-stat-empty'}
                    >
                      {portfolio.nextExpiry ? formatDate(portfolio.nextExpiry) : 'No active protection'}
                    </MonoValue>
                    <small>Earliest confirmed protection end date</small>
                  </div>
                </Card>

                {/*
                  USDC had no home on this page. The only place a balance
                  appeared was a hint inside the vault deposit form, which a
                  user only sees after opening the form - so the answer to
                  "have I got anything to deposit?" was behind the button that
                  asks you to deposit.

                  The logo comes through `imageUrl` rather than by registering
                  USDC in ASSET_IDENTITIES: AssetPicker derives the vault's
                  selectable assets from that object's keys, so registering
                  USDC there would offer a USDC-denominated vault deposit.
                */}
                <Card className="portfolio-stat-card">
                  <AssetLogo symbol="USDC" name="USD Coin" imageUrl="/assets/coins/usdc.svg" size="large" />
                  <div>
                    <span>USDC available</span>
                    <MonoValue as="strong">{formatUsdc(usdcAvailable) ?? '—'}</MonoValue>
                    <small>Ready to deposit into the vault · simulated balance</small>
                  </div>
                </Card>
              </section>

              <LendingEntryCard apiClient={apiClient} />

              <VaultDepositsSection apiClient={apiClient} positions={positions} usdcAvailable={usdcAvailable} />

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
                ) : (
                  <div className="portfolio-table-scroll">
                    <table className="portfolio-table">
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Holdings</th>
                          <th>Current price</th>
                          <th>Protection</th>
                          <th>Protection ends</th>
                          <th><span className="sr-only">Action</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
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
                              <div className="portfolio-action-group">
                                {row.protectable && (
                                  <Button size="small" onClick={() => navigate(`/protect/${row.symbol}`)}>
                                    Buy protection
                                  </Button>
                                )}
                                {row.hasPositionHistory && (
                                  <Button
                                    variant="ghost"
                                    size="small"
                                    className="portfolio-secondary-button"
                                    onClick={() => navigate(`/positions/${row.symbol}`)}
                                  >
                                    View history <ArrowIcon size={14} />
                                  </Button>
                                )}
                                {!row.protectable && !row.hasPositionHistory && <span aria-hidden="true">—</span>}
                              </div>
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
