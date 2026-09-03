import { Link, useLocation } from 'react-router-dom';

export default function SiteNavigation() {
  const { pathname } = useLocation();
  const marketsActive = pathname === '/markets' || pathname.startsWith('/coin/') || pathname.startsWith('/protect/');
  const portfolioActive = pathname === '/portfolio' || pathname.startsWith('/positions/') || pathname.startsWith('/protection/');

  return (
    <header className="site-navigation">
      <div className="site-navigation__inner">
        <Link className="site-navigation__brand" to="/" aria-label="Alpha home">
          <span aria-hidden="true">α</span>
          <strong>ALPHA</strong>
        </Link>
        <nav aria-label="Primary navigation">
          <Link
            to="/markets"
            className={marketsActive ? 'is-active' : undefined}
            aria-current={marketsActive ? 'page' : undefined}
          >
            Markets
          </Link>
          <Link
            to="/portfolio"
            className={portfolioActive ? 'is-active' : undefined}
            aria-current={portfolioActive ? 'page' : undefined}
          >
            My Portfolio
          </Link>
        </nav>
      </div>
    </header>
  );
}
