import { ShieldIcon } from '../components/Icons.jsx';
import RealityDisclosure from '../components/RealityDisclosure.jsx';

export default function DashboardScreen({ positions, state, isMock, reality, onExplore }) {
  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <div className="dashboard-heading">
        <div><span className="eyebrow">Your positions</span><h1 id="dashboard-title">Protection and upside</h1><p>Track each position’s purpose, threshold, end date and current status.</p></div>
        <button className="primary-button compact" type="button" onClick={onExplore}>Add protection</button>
      </div>

      <RealityDisclosure variant="dashboard" isMock={isMock} reality={reality} />

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
              <div className="position-title">
                <span>Ethereum</span>
                <strong>{position.amountLabel} {position.amountSummaryLabel}</strong>
                <small>{position.positionRoleLabel}</small>
              </div>
              <div className="position-metric"><small>{position.primaryMetricLabel}</small><strong>{position.primaryMetricValueLabel}</strong></div>
              <div className="position-metric"><small>End date</small><strong>{position.expiryLabel}</strong></div>
              <div className="position-metric">
                <small>Payment status</small>
                <strong>
                  {isMock ? 'Sample · ' : ''}{position.paymentStatusLabel}
                  {position.paymentStatus === 'paid' ? ` · ${position.premiumLabel}` : ''}
                </strong>
              </div>
              <RealityDisclosure variant="positionStatus" isMock={isMock} statusLabel={position.statusLabel} />
              <RealityDisclosure variant="transaction" isMock={isMock} reality={reality} fill={position.fill} explorerUrl={position.explorerUrl} compact />
            </article>
          ))}
        </div>
      )}

      <div className="dashboard-note">
        <ShieldIcon />
        <p><strong>Read each position by its displayed purpose.</strong><span>Protection floors cover downside at expiry. Upside thresholds describe separate exposure and are never presented as protection.</span></p>
      </div>
    </section>
  );
}
