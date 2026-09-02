import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { liveApi } from './api/client.js';
import { Card } from './components/ui/index.js';
import DashboardPage from './features/dashboard/DashboardPage.jsx';
import ProtectionFlowPage from './features/protection/ProtectionFlowPage.jsx';
import WelcomePage from './features/welcome/WelcomePage.jsx';

function WelcomeRoute() {
  const navigate = useNavigate();

  return (
    <WelcomePage
      apiClient={liveApi}
      onProtect={(symbol) => navigate(`/protect/${symbol}`)}
      onDashboard={() => navigate('/dashboard')}
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
      onViewDashboard={() => navigate('/dashboard')}
    />
  );
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
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/protect/:symbol" element={<ProtectionRoute />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
