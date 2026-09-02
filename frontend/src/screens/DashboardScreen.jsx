import AssetLogo, { getAssetIdentity } from '../components/AssetLogo.jsx';
import RealityDisclosure from '../components/RealityDisclosure.jsx';
import { ShieldIcon } from '../components/Icons.jsx';

function shortenIdentifier(value) {
  if (!value || value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function PositionCard({ position, isMock }) {
  const identity = getAssetIdentity(position.asset);

  return (
    <article className="position-card">
      <div className="position-identity">
        <AssetLogo symbol={position.asset} name={identity.name} size="medium" />
        <div className="position-identity__copy">
          <span>{position.asset} · {position.positionRoleLabel}</span>
          <strong>{identity.name}</strong>
          <small>{position.amountLabel} {position.amountSummaryLabel}</small>
        </div>
      </div>

      <div className="position-metric position-metric--primary">
        <small>{position.primaryMetricLabel}</small>
        <strong>{position.primaryMetricValueLabel}</strong>
      </div>

      <div className="position-metric">
        <small>Ends</small>
        <strong>{position.expiryLabel}</strong>
      </div>

      <div className="position-metric position-metric--payment">
        <small>Payment</small>
        <strong>{position.premiumPresentation}</strong>
      </div>

      <div className="position-evidence">
        <RealityDisclosure variant="positionStatus" isMock={isMock} statusLabel={position.statusLabel} />
        <RealityDisclosure
          variant="transaction"
          isMock={isMock}
          fill={position.fill}
          status={position.status}
          paymentStatus={position.paymentStatus}
          explorerUrl={position.explorerUrl}
          compact
        />
        <span className="position-request-id" title={position.positionId}>
          Request {shortenIdentifier(position.positionId)}
        </span>
      </div>
    </article>
  );
}

export default function DashboardScreen({ positions, state, isMock, reality, onExplore }) {
  return (
    <section className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">Protection activity</span>
          <h1>Protection and upside</h1>
          <p>Track protection requests, operator fills, and verifiable on-chain positions in one place.</p>
        </div>
        <button className="alpha-button alpha-button--primary" type="button" onClick={onExplore}>
          Explore protection
        </button>
      </header>

      <RealityDisclosure variant="dashboard" isMock={isMock} reality={reality} />

      {state === 'loading' ? (
        <section className="empty-state" aria-live="polite">
          <div className="empty-state-mark"><ShieldIcon /></div>
          <h2>Loading positions</h2>
          <p>Checking the latest status from the live backend.</p>
        </section>
      ) : null}

      {state === 'error' ? (
        <section className="error-message" role="alert">
          <strong>Positions are temporarily unavailable.</strong>
          <span>The live backend could not return your position history. Please try again shortly.</span>
        </section>
      ) : null}

      {state === 'ready' && positions.length === 0 ? (
        <section className="empty-state">
          <div className="empty-state-mark"><ShieldIcon /></div>
          <h2>No protection requests yet</h2>
          <p>Choose an asset to see live protection choices and create your first request.</p>
          <button className="alpha-button alpha-button--primary" type="button" onClick={onExplore}>
            Explore protection
          </button>
        </section>
      ) : null}

      {state === 'ready' && positions.length > 0 ? (
        <section className="dashboard-positions" aria-labelledby="positions-heading">
          <header className="dashboard-section-heading">
            <div>
              <h2 id="positions-heading">Recorded positions</h2>
              <p>Current positions appear first. Completed and failed requests remain below as history; only on-chain fills include a BaseScan link.</p>
            </div>
            <span>{positions.length} {positions.length === 1 ? 'position' : 'positions'}</span>
          </header>

          <div className="position-list">
            {positions.map((position) => (
              <PositionCard key={position.positionId} position={position} isMock={isMock} />
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
