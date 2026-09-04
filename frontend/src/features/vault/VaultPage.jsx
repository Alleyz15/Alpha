import { useCallback, useEffect, useState } from 'react';
import { liveApi } from '../../api/client.js';
import PageBackLink from '../../components/PageBackLink.jsx';
import { AsyncState, RealityBadge } from '../../components/ui/index.js';
import VaultDepositsSection from '../portfolio/VaultDepositsSection.jsx';

export default function VaultPage({ apiClient = liveApi }) {
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

  const usdcAvailable = portfolio?.holdings?.find((holding) => holding.asset === 'USDC')?.amount ?? null;

  return (
    <main className="portfolio-page">
      <div className="portfolio-container">
        <PageBackLink to="/portfolio">Back to My Crypto</PageBackLink>

        <section className="portfolio-heading">
          <div>
            <span className="portfolio-eyebrow">Vault</span>
            <h1>Principal-Protected Vault</h1>
            <p>Deposit USDC and get it back in full, with a share of the upside if the market moves.</p>
          </div>
          {portfolio?.simulated && <RealityBadge kind="simulated" label="Simulated holdings" />}
        </section>

        <AsyncState
          state={state}
          loadingLabel="Loading your vault deposits…"
          errorTitle="Vault could not be loaded"
          errorMessage={error?.message ?? 'Check that the backend is running, then try again.'}
          onRetry={load}
        >
          {portfolio && (
            <VaultDepositsSection apiClient={apiClient} positions={positions} usdcAvailable={usdcAvailable} />
          )}
        </AsyncState>
      </div>
    </main>
  );
}
