import { useEffect, useState } from 'react';
import { api, useMockApi } from './api/client.js';
import { toPositionViewModel } from './adapters/quoteViewModel.js';
import AppHeader from './components/AppHeader.jsx';
import RealityDisclosure from './components/RealityDisclosure.jsx';
import QuoteScreen from './screens/QuoteScreen.jsx';
import ConfirmationScreen from './screens/ConfirmationScreen.jsx';
import DashboardScreen from './screens/DashboardScreen.jsx';

export default function App() {
  const [activeView, setActiveView] = useState('explore');
  const [flow, setFlow] = useState({ step: 'quote', quote: null, tier: null, purchase: null });
  const [demoContext, setDemoContext] = useState(null);
  const [positions, setPositions] = useState([]);
  const [positionsState, setPositionsState] = useState('loading');

  async function loadPositions() {
    setPositionsState('loading');
    try {
      const response = await api.getPositions();
      setPositions(response.positions.map(toPositionViewModel));
      setPositionsState('ready');
    } catch {
      setPositionsState('error');
    }
  }

  useEffect(() => {
    api.getDemoContext().then(setDemoContext).catch(() => setDemoContext(null));
    loadPositions();
  }, []);

  function navigate(view) {
    setActiveView(view);
    if (view === 'explore') {
      setFlow({ step: 'quote', quote: null, tier: null, purchase: null });
    }
    if (view === 'dashboard') loadPositions();
  }

  function reviewQuote(quote, tier) {
    setFlow({ step: 'confirmation', quote, tier, purchase: null });
  }

  function returnToQuote() {
    setFlow({ step: 'quote', quote: null, tier: null, purchase: null });
  }

  function finishPurchase(purchase) {
    setFlow((current) => ({ ...current, step: 'complete', purchase }));
  }

  return (
    <div className="app-shell">
      <AppHeader activeView={activeView} onNavigate={navigate} demoContext={demoContext} />

      <RealityDisclosure variant="banner" isMock={useMockApi} reality={demoContext?.reality} />

      <main>
        {activeView === 'explore' && flow.step === 'quote' && (
          <QuoteScreen demoContext={demoContext} isMock={useMockApi} reality={demoContext?.reality} onReview={reviewQuote} />
        )}

        {activeView === 'explore' && flow.step !== 'quote' && (
          <ConfirmationScreen
            step={flow.step}
            quote={flow.quote}
            tier={flow.tier}
            purchase={flow.purchase}
            isMock={useMockApi}
            reality={demoContext?.reality}
            onBack={returnToQuote}
            onComplete={finishPurchase}
            onViewDashboard={() => navigate('dashboard')}
          />
        )}

        {activeView === 'dashboard' && (
          <DashboardScreen positions={positions} state={positionsState} isMock={useMockApi} reality={demoContext?.reality} onExplore={() => navigate('explore')} />
        )}
      </main>

      <footer className="site-footer">
        <RealityDisclosure variant="footer" isMock={useMockApi} reality={demoContext?.reality} />
      </footer>
    </div>
  );
}
