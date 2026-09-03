import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toPositionViewModel } from '../../adapters/quoteViewModel.js';
import { liveApi } from '../../api/client.js';
import AppHeader from '../../components/AppHeader.jsx';
import RealityDisclosure from '../../components/RealityDisclosure.jsx';
import DashboardScreen from '../../screens/DashboardScreen.jsx';

const historyPriority = {
  active: 0,
  pending: 0,
  pending_fill: 0,
  pending_verification: 0,
  needs_review: 1,
  settled: 2,
  expired_worthless: 2,
  failed: 3,
};

function orderPositionHistory(positions) {
  return positions
    .map((position, index) => ({ position, index }))
    .sort((left, right) => {
      const priorityDifference = (historyPriority[left.position.status] ?? 1)
        - (historyPriority[right.position.status] ?? 1);
      return priorityDifference || left.index - right.index;
    })
    .map(({ position }) => position);
}

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
      setPositions(orderPositionHistory(positionsResult.value.positions
        .filter((position) => !assetFilter || position.asset === assetFilter)
        .map(toPositionViewModel)));
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
