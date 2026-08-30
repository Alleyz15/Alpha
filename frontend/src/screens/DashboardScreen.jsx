import { ShieldIcon } from '../components/Icons.jsx';
import RealityDisclosure from '../components/RealityDisclosure.jsx';

export default function DashboardScreen({ positions, state, isMock, onExplore }) {
  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <div className="dashboard-heading">
        <div><span className="eyebrow">Your coverage</span><h1 id="dashboard-title">My protection</h1><p>Track each floor, end date and current status in one place.</p></div>
        <button className="primary-button compact" type="button" onClick={onExplore}>Add protection</button>
      </div>

      <RealityDisclosure variant="dashboard" isMock={isMock} />

      {state === 'loading' && <div className="empty-state">Loading your protection…</div>}
      {state === 'error' && <div className="error-message">We could not load your protection right now.</div>}
      {state === 'ready' && positions.length === 0 && (
        <div className="empty-state">
          <span className="empty-state-mark"><ShieldIcon size={38} /></span>
          <span className="eyebrow">A clean slate</span>
          <h2>No protection here yet</h2>
          <p>Your first protection will appear here with its floor, end date and status.</p>
          <button className="primary-button compact" type="button" onClick={onExplore}>Explore protection choices</button>
        </div>
      )}

      {state === 'ready' && positions.length > 0 && (
        <div className="position-list">
          {positions.map((position) => (
            <article className="position-card" key={position.positionId}>
              <div className="asset-token">Ξ</div>
              <div className="position-title"><span>Ethereum</span><strong>{position.amountLabel} protected</strong></div>
              <div className="position-metric"><small>Protection floor</small><strong>{position.floorLabel}</strong></div>
              <div className="position-metric"><small>End date</small><strong>{position.expiryLabel}</strong></div>
              <div className="position-metric"><small>Cost paid</small><strong>{position.premiumLabel}</strong></div>
              <RealityDisclosure variant="positionStatus" isMock={isMock} statusLabel={position.statusLabel} />
              <RealityDisclosure variant="transaction" isMock={isMock} explorerUrl={position.explorerUrl} compact />
            </article>
          ))}
        </div>
      )}

      <div className="dashboard-note">
        <ShieldIcon />
        <p><strong>Protection is checked at the end date.</strong><span>Price movement before then does not trigger a payout. Results appear here after the protocol settles them.</span></p>
      </div>
    </section>
  );
}
