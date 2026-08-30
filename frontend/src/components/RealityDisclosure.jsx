import { useEffect } from 'react';
import { ExternalIcon, ShieldIcon } from './Icons.jsx';

const copy = Object.freeze({
  banner: {
    mock: 'Sample data · nothing will be sent to the blockchain',
    real: 'Live quote · confirming sends a real transaction on Base',
  },
  explore: {
    balance: (balance) => `Simulated: your ${balance}. No deposit needed.`,
    mock: 'Sample: the quote and purchase flow. Nothing will be sent to the blockchain.',
    real: 'Real: the quote, and the purchase we make on Base.',
  },
  confirmation: {
    title: 'Who holds the funds?',
    body: 'The app controls the wallet that buys your protection. Your ETH balance here is simulated — you never deposit anything into this demo.',
    mock: 'Sample mode is on. Confirming here will not send anything to the blockchain.',
    real: 'Live mode is on. Confirming sends a real transaction from the app’s wallet on Base.',
  },
  dashboard: {
    mock: [['Simulated', 'balance'], ['Sample', 'quote'], ['Sample', 'purchase']],
    real: [['Simulated', 'balance'], ['Live', 'market quote'], ['On-chain', 'purchase']],
  },
  footer: {
    mock: 'The balance, quote and purchase shown in this preview are sample data. Nothing is sent to the blockchain.',
    real: 'The balance is simulated. Live quotes and purchases use the app’s dedicated wallet on the user’s behalf.',
    timing: 'Protection is evaluated at the displayed end date and pays in USDC. It does not prevent price changes before that date.',
  },
  transaction: {
    mock: 'Sample only · nothing was sent to Base',
    real: 'Purchased by the app’s wallet',
    link: 'Verify on BaseScan',
  },
  quote: {
    eyebrow: {
      mock: 'Downside protection preview',
      real: 'Live downside protection',
    },
    verification: {
      mock: 'In live mode, completed purchases link to BaseScan.',
      real: 'Every completed purchase links to BaseScan.',
    },
  },
  completion: {
    mock: {
      eyebrow: 'Sample result',
      title: 'This is how your protection will look.',
      summary: (amount, floor, expiry) => `${amount} would be protected at a floor of ${floor} on ${expiry}.`,
    },
    real: {
      eyebrow: 'Protection active',
      title: 'Your downside floor is in place.',
      summary: (amount, floor, expiry) => `${amount} is protected at a floor of ${floor} on ${expiry}.`,
    },
  },
});

let mockWarningShown = false;

export default function RealityDisclosure({
  variant,
  isMock,
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

  if (variant === 'banner') {
    return <div className={`reality-banner ${isMock ? 'mock' : 'real'}`} role="status">{copy.banner[isMock ? 'mock' : 'real']}</div>;
  }

  if (variant === 'explore') {
    return (
      <aside className="reality-card compact" aria-label="What is simulated and what is real">
        <p><strong>Simulated</strong><span>{copy.explore.balance(balance).replace('Simulated: ', '')}</span></p>
        <p><strong>{isMock ? 'Sample' : 'Real'}</strong><span>{copy.explore[isMock ? 'mock' : 'real'].replace(`${isMock ? 'Sample' : 'Real'}: `, '')}</span></p>
      </aside>
    );
  }

  if (variant === 'quoteEyebrow') {
    return <span className="eyebrow">{copy.quote.eyebrow[isMock ? 'mock' : 'real']}</span>;
  }

  if (variant === 'verification') {
    return <small>{copy.quote.verification[isMock ? 'mock' : 'real']}</small>;
  }

  if (variant === 'confirmation') {
    return (
      <aside className="custody-disclosure" aria-labelledby="custody-title">
        <ShieldIcon />
        <div>
          <strong id="custody-title">{copy.confirmation.title}</strong>
          <p>{copy.confirmation.body}</p>
          <small className={isMock ? 'mock' : 'real'}>{copy.confirmation[isMock ? 'mock' : 'real']}</small>
        </div>
      </aside>
    );
  }

  if (variant === 'dashboard') {
    const stages = copy.dashboard[isMock ? 'mock' : 'real'];
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

    return (
      <div className={`transaction-reality real ${compact ? 'compact' : ''}`}>
        <span>{copy.transaction.real}</span>
        <a className={compact ? 'icon-link' : 'primary-button'} href={explorerUrl} target="_blank" rel="noreferrer" aria-label={copy.transaction.link}>
          {!compact && copy.transaction.link} <ExternalIcon />
        </a>
      </div>
    );
  }

  if (variant === 'completion') {
    const content = copy.completion[isMock ? 'mock' : 'real'];
    return (
      <>
        <span className="eyebrow">{content.eyebrow}</span>
        <h1 id="complete-title">{content.title}</h1>
        <p>{content.summary(amount, floor, expiry)}</p>
      </>
    );
  }

  if (variant === 'positionStatus') {
    return <span className={`status-badge ${isMock ? 'sample' : ''}`}>{isMock ? 'Sample' : statusLabel}</span>;
  }

  if (variant === 'footer') {
    return (
      <>
        <p><strong>Prototype boundary.</strong> {copy.footer[isMock ? 'mock' : 'real']}</p>
        <p>{copy.footer.timing}</p>
      </>
    );
  }

  return null;
}
