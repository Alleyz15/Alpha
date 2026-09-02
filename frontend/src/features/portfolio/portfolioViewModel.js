import { getAssetIdentity } from '../../components/AssetLogo.jsx';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const amount = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 6,
});

const date = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const pendingStatuses = new Set(['pending', 'pending_fill', 'pending_verification']);

export function formatUsdc(value) {
  if (value === null || value === undefined || value === '') return '—';
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${money.format(numericValue)} USDC` : '—';
}

export function formatUnits(value, symbol) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${amount.format(Number(value))} ${symbol}`;
}

export function formatDate(value, includeTime = false) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return (includeTime ? dateTime : date).format(parsed);
}

export function getProtectionState(position) {
  if (!position || position.role !== 'protection') return 'none';
  if (position.status === 'active' && position.verifiedOnChain === true) return 'active';
  if (
    pendingStatuses.has(position.status)
    || position.executionState === 'requested'
    || position.executionState === 'broadcast'
    || (position.status === 'active' && position.verifiedOnChain !== true)
  ) return 'pending';
  return 'none';
}

function positionPriority(position) {
  const state = getProtectionState(position);
  if (state === 'active') return 0;
  if (state === 'pending') return 1;
  return 2;
}

export function buildPortfolioRows(holdings = [], positions = []) {
  return holdings
    .filter((holding) => holding.asset !== 'USDC')
    .map((holding) => {
      const identity = getAssetIdentity(holding.asset);
      const matchingPositions = positions
        .filter((position) => position.asset === holding.asset && position.role === 'protection')
        .sort((a, b) => {
          const priorityDifference = positionPriority(a) - positionPriority(b);
          if (priorityDifference !== 0) return priorityDifference;
          return String(a.expiry ?? '').localeCompare(String(b.expiry ?? ''));
        });
      const position = matchingPositions.find((candidate) => getProtectionState(candidate) !== 'none') ?? null;
      const protectionState = getProtectionState(position);

      return {
        ...holding,
        ...identity,
        holdingsLabel: formatUnits(holding.amount, holding.asset),
        priceLabel: formatUsdc(holding.priceUsdc),
        valueLabel: formatUsdc(holding.valueUsdc),
        protectionState,
        protectionLabel: protectionState === 'active'
          ? 'Protected'
          : protectionState === 'pending'
            ? 'Being set up'
            : 'Not protected',
        expiryLabel: position ? formatDate(position.expiry) : '—',
        positionId: position?.positionId ?? null,
      };
    });
}

export function getTimeLeft(expiry, now = Date.now()) {
  const expiryTime = new Date(expiry).getTime();
  if (!Number.isFinite(expiryTime)) return { label: '—', caption: 'Expiry unavailable' };
  const milliseconds = Math.max(0, expiryTime - now);
  const days = Math.floor(milliseconds / 86_400_000);
  const hours = Math.floor((milliseconds % 86_400_000) / 3_600_000);

  if (milliseconds === 0) return { label: 'Ended', caption: `Expired ${formatDate(expiry)}` };
  if (days > 0) return { label: `${days}d ${hours}h`, caption: `Ends ${formatDate(expiry)}` };
  return { label: `${hours}h`, caption: `Ends ${formatDate(expiry)}` };
}

export function formatIdentifier(value, front = 8, back = 6) {
  if (!value) return '—';
  const text = String(value);
  return text.length > front + back + 1 ? `${text.slice(0, front)}…${text.slice(-back)}` : text;
}

const statusLabels = {
  active: 'Active',
  pending: 'Processing',
  pending_fill: 'Waiting for execution',
  pending_verification: 'Confirming on-chain',
  settled: 'Settled',
  expired_worthless: 'Ended — protection not needed',
  needs_review: 'Needs review',
  failed: 'Failed',
};

const timelineLabels = {
  requested: 'Protection requested',
  operator_execution: 'Operator started execution',
  confirmed_onchain: 'Confirmed on-chain',
  needs_review: 'Marked for review',
  settled: 'Settled',
  failed: 'Execution failed',
};

export function toProtectionDetailViewModel(position) {
  const identity = getAssetIdentity(position.asset);
  const isProtection = position.role === 'protection';
  const strike = isProtection ? position.protectionFloorUsdc : position.upsideThresholdUsdc;
  const timeLeft = getTimeLeft(position.expiry);
  const paymentStatus = position.paymentStatus;

  let premium = {
    label: 'Premium',
    value: '—',
    caption: 'Payment information unavailable',
  };
  if (paymentStatus === 'none') {
    premium = {
      label: 'Payment',
      value: 'No payment',
      caption: 'Purchased directly by the operator',
    };
  } else if (paymentStatus === 'held') {
    premium = {
      label: 'Premium held',
      value: formatUsdc(position.chargedUsdc),
      caption: 'Held from the simulated USDC balance',
    };
  } else if (paymentStatus === 'refunded') {
    premium = {
      label: 'Premium refunded',
      value: formatUsdc(position.refundedUsdc),
      caption: 'Returned to the simulated USDC balance',
    };
  } else if (paymentStatus === 'paid') {
    premium = {
      label: 'Premium paid',
      value: formatUsdc(position.chargedUsdc ?? position.premiumPaidUsdc),
      caption: 'Paid from the simulated USDC balance',
    };
  }

  return {
    ...position,
    ...identity,
    isProtection,
    title: isProtection ? `${identity.symbol} Protection` : `${identity.symbol} Upside Position`,
    contractType: isProtection ? 'Downside protection' : 'Upside exposure',
    strikeLabel: formatUsdc(strike),
    entryPriceLabel: formatUsdc(position.entryPriceUsdc),
    quantityLabel: formatUnits(position.protectedAmount, position.asset),
    purchaseDateLabel: position.purchasedAt ? formatDate(position.purchasedAt) : 'Not confirmed',
    expiryLabel: formatDate(position.expiry),
    orderCreatedLabel: formatDate(position.createdAt, true),
    statusLabel: statusLabels[position.status] ?? position.status ?? 'Unknown',
    orderIdLabel: formatIdentifier(position.orderId),
    walletLabel: formatIdentifier(position.account?.walletAddress),
    buyerName: position.buyer?.displayName ?? '—',
    settlementTypeLabel: position.order?.settlementType === 'automatic_at_expiry'
      ? 'Automatic at expiry'
      : position.order?.settlementType ?? '—',
    paymentMethodLabel: position.order?.paymentMethod === 'simulated_usdc_balance'
      ? 'Simulated USDC balance'
      : position.order?.paymentMethod === 'operator_no_user_payment'
        ? 'Operator purchase — no user payment'
        : position.order?.paymentMethod ?? '—',
    premium,
    timeLeft,
    timeline: (position.timeline ?? []).map((event) => ({
      ...event,
      label: timelineLabels[event.event] ?? event.event,
      dateLabel: formatDate(event.at, true),
    })),
  };
}
