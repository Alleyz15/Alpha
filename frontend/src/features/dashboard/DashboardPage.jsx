import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toPositionViewModel } from '../../adapters/quoteViewModel.js';
import { liveApi } from '../../api/client.js';
import AppHeader from '../../components/AppHeader.jsx';
import RealityDisclosure from '../../components/RealityDisclosure.jsx';
import DashboardScreen from '../../screens/DashboardScreen.jsx';

export default function DashboardPage({ apiClient = liveApi, assetFilter = null }) {
  const navigate = useNavigate();
  const [demoContext, setDemoContext] = useState(null);
  const [positions, setPositions] = useState([]);
  const [positionsState, setPositionsState] = useState('loading');

  const load = useCallback(async () => {
    setPositionsState('loading');

    const [contextResult, positionsResult] = await Promise.allSettled([
      apiClient.getDemoContext(),
      apiClient.getPositions(),
    ]);

    setDemoContext(contextResult.status === 'fulfilled' ? contextResult.value : null);

    if (positionsResult.status === 'fulfilled') {
      setPositions(positionsResult.value.positions
        .filter((position) => !assetFilter || (
          position.asset === assetFilter
          && ['active', 'pending', 'pending_fill', 'pending_verification'].includes(position.status)
          && position.paymentStatus !== 'refunded'
        ))
        .map(toPositionViewModel));
      setPositionsState('ready');
    } else {
      setPositions([]);
      setPositionsState('error');
    }
  }, [apiClient, assetFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function navigateLegacyHeader(view) {
    navigate(view === 'dashboard' ? '/portfolio' : '/markets');
  }

  return (
    <div className="app-shell dashboard-shell">
      <AppHeader activeView="dashboard" onNavigate={navigateLegacyHeader} demoContext={demoContext} />

      <main>
        <DashboardScreen
          positions={positions}
          state={positionsState}
          isMock={false}
          reality={demoContext?.reality}
          onExplore={() => navigate('/markets')}
        />
      </main>

      <footer className="site-footer">
        <RealityDisclosure variant="footer" isMock={false} reality={demoContext?.reality} />
      </footer>
    </div>
  );
}
