import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { liveApi } from './api/client.js';
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
      onProtect={(symbol) => navigate(`/protect/${symbol}`)}
      onViewAsset={(symbol) => navigate(`/coin/${symbol}`)}
      onGetStarted={() => navigate('/markets')}
      onExploreLending={() => navigate('/lending')}
      onExploreVault={() => navigate('/vault')}
    />
  );
}

function ProtectionRoute() {
  const navigate = useNavigate();
  const { symbol = '' } = useParams();

  return (
    <ProtectionFlowPage
      symbol={decodeURIComponent(symbol).toUpperCase()}
      apiClient={liveApi}
      onExit={() => navigate('/')}
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
      onProtect={() => navigate(`/protect/${normalizedSymbol}`)}
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
          <Link className="alpha-button alpha-button--primary alpha-button--default" to="/">Back to Welcome</Link>
        </Card>
      </div>
    </main>
  );
}

export default function App() {
  return (
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
  );
}
