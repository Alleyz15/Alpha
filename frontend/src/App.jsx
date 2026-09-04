import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { liveApi } from './api/client.js';
import PageBackLink from './components/PageBackLink.jsx';
import SiteHeader from './components/SiteHeader.jsx';
import { Card } from './components/ui/index.js';
import CoinDetailPage from './features/coin-detail/CoinDetailPage.jsx';
import DashboardPage from './features/dashboard/DashboardPage.jsx';
import HomePage from './features/home/HomePage.jsx';
import LendingPage from './features/lending/LendingPage.jsx';
import PortfolioPage from './features/portfolio/PortfolioPage.jsx';
import ProtectionDetailsPage from './features/portfolio/ProtectionDetailsPage.jsx';
import ProtectionFlowPage from './features/protection/ProtectionFlowPage.jsx';
import VaultPage from './features/vault/VaultPage.jsx';
import WelcomePage from './features/welcome/WelcomePage.jsx';

function WelcomeRoute() {
  const navigate = useNavigate();

  return (
    <WelcomePage
      apiClient={liveApi}
      onViewAsset={(symbol) => navigate(`/coin/${symbol}`)}
      onGetStarted={() => navigate('/markets')}
      onExploreLending={() => navigate('/lending')}
      onExploreVault={() => navigate('/vault')}
    />
  );
}

function ProtectionRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { symbol = '' } = useParams();
  const normalizedSymbol = decodeURIComponent(symbol).toUpperCase();
  const origin = new URLSearchParams(location.search).get('from');
  const returnDestination = origin === 'coin'
    ? { label: `Back to ${normalizedSymbol} details`, path: `/coin/${encodeURIComponent(normalizedSymbol)}` }
    : { label: 'Back to My Crypto', path: '/portfolio' };

  return (
    <ProtectionFlowPage
      symbol={normalizedSymbol}
      apiClient={liveApi}
      exitLabel={returnDestination.label}
      exitTo={returnDestination.path}
      onViewDashboard={() => navigate('/portfolio')}
    />
  );
}

function CoinDetailRoute() {
  const navigate = useNavigate();
  const { symbol = '' } = useParams();
  const normalizedSymbol = decodeURIComponent(symbol).toUpperCase();

  return (
    <CoinDetailPage
      symbol={normalizedSymbol}
      apiClient={liveApi}
      onBack={() => navigate('/markets')}
      onProtect={() => navigate(`/protect/${normalizedSymbol}?from=coin`)}
    />
  );
}

function AssetPositionsRoute() {
  const { symbol = '' } = useParams();
  return <DashboardPage assetFilter={decodeURIComponent(symbol).toUpperCase()} />;
}

function NotFoundPage() {
  return (
    <main className="protection-flow">
      <div className="protection-container protection-container--state">
        <Card variant="glass" className="protection-route-error">
          <span className="protection-eyebrow">Page not found</span>
          <h1>Alpha could not find this page.</h1>
          <p>Return to the Welcome page to choose a supported path.</p>
          <PageBackLink to="/">Back to Welcome</PageBackLink>
        </Card>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <div className="alpha-app-shell">
      <SiteHeader />
      <Routes>
        <Route path="/" element={<WelcomeRoute />} />
        <Route path="/markets" element={<HomePage />} />
        <Route path="/dashboard" element={<Navigate replace to="/markets" />} />
        <Route path="/home" element={<Navigate replace to="/markets" />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/vault" element={<VaultPage />} />
        <Route path="/lending" element={<LendingPage />} />
        <Route path="/positions/:symbol" element={<AssetPositionsRoute />} />
        <Route path="/protection/:positionId" element={<ProtectionDetailsPage />} />
        <Route path="/coin/:symbol" element={<CoinDetailRoute />} />
        <Route path="/protect/:symbol" element={<ProtectionRoute />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}
