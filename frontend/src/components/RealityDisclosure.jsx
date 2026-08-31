import { useEffect } from 'react';
import { ExternalIcon, ShieldIcon } from './Icons.jsx';

const copy = Object.freeze({
  banner: {
    mock: 'Sample data · nothing will be sent to the blockchain',
    operator: 'Live market quote · confirming creates a request for the app’s operator',
    automatic: 'Live market quote · confirming sends a transaction from the app’s wallet',
  },
  confirmation: {
    title: 'Who holds the funds?',
    body: 'The app controls the wallet that buys your protection. Your ETH balance here is simulated — you never deposit anything into this demo.',
    mock: 'Sample mode is on. Confirming here will not send anything to the blockchain.',
    operator: 'Confirming creates a pending request. The app’s operator executes it on Base only after the safety checks pass.',
    automatic: 'Confirming sends a real transaction from the app’s wallet on Base.',
  },
  transaction: {
    mock: 'Sample only · nothing was sent to Base',
    operator: 'Waiting for the app’s operator to execute on Base',
    onchain: 'Purchased by the app’s wallet',
    link: 'Verify on BaseScan',
  },
  completion: {
    mock: {
      eyebrow: 'Sample request',
      title: 'This is how a purchase request will look.',
      summary: (amount, floor, expiry) => `${amount} would be requested at a floor of ${floor} on ${expiry}.`,
    },
    operator: {
      eyebrow: 'Request received',
      title: 'Your purchase is waiting for execution.',
      summary: (amount, floor, expiry) => `${amount} is pending execution at a floor of ${floor} on ${expiry}.`,
    },
    onchain: {
      eyebrow: 'Protection active',
      title: 'Your downside floor is in place.',
      summary: (amount, floor, expiry) => `${amount} is protected at a floor of ${floor} on ${expiry}.`,
    },
  },
});

let mockWarningShown = false;

function realityFill(isMock, reality) {
  if (isMock) return 'mock';
  return reality?.fill === 'automatic' ? 'automatic' : 'operator';
}

function dashboardStages(isMock, reality) {
  if (isMock) {
    return [['Simulated', 'balance'], ['Sample', 'quote'], ['Sample', 'purchase request'], ['Sample', 'settlement']];
  }

  return [
    [reality?.balance === 'simulated' ? 'Simulated' : 'Recorded', 'balance'],
    [reality?.quote === 'live' ? 'Live' : 'Unavailable', 'market quote'],
    [reality?.fill === 'automatic' ? 'Automatic' : 'Operator', 'executes purchase'],
    [reality?.settlement === 'live' ? 'On-chain' : 'Recorded', 'settlement'],
  ];
}

export default function RealityDisclosure({
  variant,
  isMock,
  reality,
  fill,
  balance = '0.4 ETH',
  explorerUrl,
  compact = false,
  amount,
  floor,
  expiry,
  statusLabel,
}) {
  useEffect(() => {
    if (isMock && !mockWarningShown) {
      console.warn('[MOCK MODE] No transactions are being sent. Set VITE_USE_MOCK_API=false');
      mockWarningShown = true;
    }
  }, [isMock]);

  const globalFill = realityFill(isMock, reality);

  if (variant === 'banner') {
    return <div className={`reality-banner ${isMock ? 'mock' : 'real'}`} role="status">{copy.banner[globalFill]}</div>;
  }

  if (variant === 'explore') {
    return (
      <aside className="reality-card compact" aria-label="What is simulated and what is real">
        <p><strong>Simulated</strong><span>your {balance}. No deposit needed.</span></p>
        <p><strong>{isMock ? 'Sample' : 'Live'}</strong><span>{isMock ? 'the quote and purchase flow. Nothing will be sent to the blockchain.' : 'the quote comes from the current market.'}</span></p>
        {!isMock && <p><strong>Operator</strong><span>executes the purchase on Base after safety checks.</span></p>}
      </aside>
    );
  }

  if (variant === 'quoteEyebrow') {
    return <span className="eyebrow">{isMock ? 'Downside protection preview' : 'Live downside protection'}</span>;
  }

  if (variant === 'verification') {
    return <small>{isMock ? 'In live mode, completed purchases link to BaseScan.' : 'Completed on-chain purchases link to BaseScan.'}</small>;
  }

  if (variant === 'confirmation') {
    return (
      <aside className="custody-disclosure" aria-labelledby="custody-title">
        <ShieldIcon />
        <div>
          <strong id="custody-title">{copy.confirmation.title}</strong>
          <p>{copy.confirmation.body}</p>
          <small className={isMock ? 'mock' : 'real'}>{copy.confirmation[globalFill]}</small>
        </div>
      </aside>
    );
  }

  if (variant === 'dashboard') {
    const stages = dashboardStages(isMock, reality);
    return (
      <div className="reality-strip" aria-label="Prototype reality boundary">
        {stages.map(([emphasis, label], index) => (
          <span className="reality-stage" key={`${emphasis}-${label}`}>
            {index > 0 && <i className="line" />}
            <span><b>{emphasis}</b> {label}</span>
          </span>
        ))}
      </div>
    );
  }

  if (variant === 'transaction') {
    if (isMock) {
      return <div className={`transaction-reality mock ${compact ? 'compact' : ''}`}>{copy.transaction.mock}</div>;
    }

    const isOnchain = fill === 'onchain' && Boolean(explorerUrl);
    if (!isOnchain) {
      return <div className={`transaction-reality operator ${compact ? 'compact' : ''}`}>{copy.transaction.operator}</div>;
    }

    return (
      <div className={`transaction-reality real ${compact ? 'compact' : ''}`}>
        <span>{copy.transaction.onchain}</span>
        <a className={compact ? 'icon-link' : 'primary-button'} href={explorerUrl} target="_blank" rel="noreferrer" aria-label={copy.transaction.link}>
          {!compact && copy.transaction.link} <ExternalIcon />
        </a>
      </div>
    );
  }

  if (variant === 'completion') {
    const state = isMock ? 'mock' : fill === 'onchain' ? 'onchain' : 'operator';
    const content = copy.completion[state];
    return (
      <>
        <span className="eyebrow">{content.eyebrow}</span>
        <h1 id="complete-title">{content.title}</h1>
        <p>{content.summary(amount, floor, expiry)}</p>
      </>
    );
  }

  if (variant === 'positionStatus') {
    return <span className={`status-badge ${isMock ? 'sample' : ''}`}>{isMock ? `Sample · ${statusLabel}` : statusLabel}</span>;
  }

  if (variant === 'footer') {
    const boundary = isMock
      ? 'The balance, quote and purchase shown in this preview are sample data. Nothing is sent to the blockchain.'
      : globalFill === 'operator'
        ? 'The balance is simulated and quotes are live. Purchase requests are executed on Base by the app’s operator after safety checks.'
        : 'The balance is simulated. Live quotes and purchases use the app’s dedicated wallet on the user’s behalf.';
    return (
      <>
        <p><strong>Prototype boundary.</strong> {boundary}</p>
        <p>Protection is evaluated at the displayed end date and pays in USDC. It does not prevent price changes before that date.</p>
      </>
    );
  }

  return null;
}
