import { Link } from 'react-router-dom';
import { ShieldIcon } from './Icons.jsx';

export default function SiteHeader() {
  return (
    <header className="alpha-site-header">
      <div className="alpha-site-header__inner">
        <Link className="alpha-site-brand" to="/" aria-label="Alpha home">
          <span className="alpha-site-brand__mark" aria-hidden="true">
            <ShieldIcon size={18} />
          </span>
          <strong>ALPHA</strong>
        </Link>
      </div>
    </header>
  );
}
