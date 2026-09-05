import { Link } from 'react-router-dom';
import AssetLogo, { getAssetIdentity } from '../components/AssetLogo.jsx';
import RealityDisclosure from '../components/RealityDisclosure.jsx';
import { ArrowIcon, ShieldIcon } from '../components/Icons.jsx';

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
        {/*
          The only way into /protection/:positionId from this page. The detail
          view has the full record - entry price, the order, and the event
          timeline with real timestamps - and nothing linked to it, so a
          position could be read here and nowhere else.

          A plain link rather than making the whole card clickable: the card
          already contains an independent link (the BaseScan icon, rendered by
          the shared RealityDisclosure), and one clickable region wrapping
          another needs stopPropagation on a component other pages also use.
          Two sibling links going to two different places is unambiguous, and
          a real <a> is keyboard-reachable without any handler of its own.

          Offered for every status. Verified against a failed position: the
          page renders in full, and its timeline is where the reason lives.
        */}
        <Link className="position-card__detail-link" to={`/protection/${position.positionId}`}>
          View contract <ArrowIcon size={14} />
        </Link>
      </div>
    </article>
  );
}

export default function DashboardScreen({ positions, state, isMock, reality }) {
  return (
    <section className="dashboard-page">
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">Protection activity</span>
          <h1>Protection and upside</h1>
          <p>Track protection requests, operator fills, and verifiable on-chain positions in one place.</p>
        </div>
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
