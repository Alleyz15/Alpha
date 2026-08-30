import { ShieldIcon, WalletIcon } from './Icons.jsx';

export default function AppHeader({ activeView, onNavigate, demoContext }) {
  const balance = demoContext?.balances?.find((item) => item.asset === 'ETH');

  return (
    <header className="app-header">
      <button className="brand" type="button" onClick={() => onNavigate('explore')} aria-label="Alpha home">
        <span className="brand-mark"><ShieldIcon size={21} /></span>
        <span>Alpha</span>
      </button>

      <nav className="primary-nav" aria-label="Primary navigation">
        <button className={activeView === 'dashboard' ? 'active' : ''} type="button" onClick={() => onNavigate('dashboard')}>
          My protection
        </button>
        <button className={activeView === 'explore' ? 'active' : ''} type="button" onClick={() => onNavigate('explore')}>
          Explore
        </button>
      </nav>

      <div className="demo-balance" title="This balance is simulated for the prototype">
        <WalletIcon />
        <span>
          <strong>{demoContext?.displayName ?? 'Demo User'}</strong>
          <small>{balance ? `${balance.amount} ${balance.asset}` : 'Loading balance'} · simulated</small>
        </span>
      </div>
    </header>
  );
}
