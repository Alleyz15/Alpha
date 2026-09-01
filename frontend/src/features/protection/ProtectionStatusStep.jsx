import { ExternalIcon, ShieldIcon } from '../../components/Icons.jsx';
import { Button, Card, MonoValue, RealityBadge, StatusBadge } from '../../components/ui/index.js';
import { formatUsdc, toPaymentStatusLabel } from '../../adapters/quoteViewModel.js';
import ProtectionProgress from './ProtectionProgress.jsx';
import { purchaseStatusView } from './protectionFlowUtils.js';

export default function ProtectionStatusStep({ asset, quote, tier, purchase, onExit, onViewDashboard }) {
  const status = purchaseStatusView(purchase);
  const hasExplorerLink = purchase.fill === 'onchain' && Boolean(purchase.explorerUrl);

  return (
    <>
      <ProtectionProgress current="Status" />

      <Card variant="glass" className="protection-status-card" aria-labelledby="protection-status-title">
        <span className={`protection-status-mark protection-status-mark--${status.tone}`}><ShieldIcon size={42} /></span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <h1 id="protection-status-title">{status.title}</h1>
        <p>{status.message}</p>

        <dl className="protection-status-details">
          <div><dt>Request ID</dt><dd><MonoValue>{purchase.positionId ?? 'Not supplied'}</MonoValue></dd></div>
          <div><dt>Asset</dt><dd>{asset.name} ({asset.symbol})</dd></div>
          <div><dt>Amount protected</dt><dd>{tier.protectedAmount}</dd></div>
          <div><dt>Protection floor</dt><dd className="numeric">{tier.floor}</dd></div>
          <div><dt>Price when quoted</dt><dd className="numeric">{quote.spot}</dd></div>
          <div><dt>Premium</dt><dd className="numeric">{formatUsdc(purchase.premiumUsdc) === '—' ? tier.cost : formatUsdc(purchase.premiumUsdc)}</dd></div>
          <div><dt>Payment status</dt><dd>{toPaymentStatusLabel(purchase.paymentStatus)}</dd></div>
          <div><dt>Execution</dt><dd>{purchase.fill === 'onchain' ? 'Completed on Base' : 'Application operator'}</dd></div>
        </dl>

        <div className="protection-status-reality">
          <RealityBadge kind={purchase.fill === 'onchain' ? 'live' : 'operator'} label={purchase.fill === 'onchain' ? 'On-chain purchase' : 'Operator executes purchase'} />
          <p>{purchase.fill === 'onchain'
            ? 'An on-chain transaction identifier was returned by the backend.'
            : 'No transaction hash was returned because this request has not yet been executed on-chain.'}</p>
        </div>

        <div className="protection-status-actions">
          {hasExplorerLink && (
            <a className="alpha-button alpha-button--primary alpha-button--default" href={purchase.explorerUrl} target="_blank" rel="noreferrer">
              Verify on BaseScan <ExternalIcon />
            </a>
          )}
          <Button variant={hasExplorerLink ? 'ghost' : 'primary'} onClick={onViewDashboard}>View my protection</Button>
          <Button variant="ghost" onClick={onExit}>Back to Welcome</Button>
        </div>

        <small className="protection-authority-note">Position status and on-chain evidence are loaded from Alpha’s live backend.</small>
      </Card>
    </>
  );
}
