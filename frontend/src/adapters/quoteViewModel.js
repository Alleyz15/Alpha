const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

const tierCopy = {
  highest: { name: 'More protection', description: 'A higher floor with broader coverage.' },
  middle: { name: 'Balanced', description: 'A practical balance of cost and protection.' },
  lowest: { name: 'Lower cost', description: 'A lower floor with a smaller upfront cost.' },
};

const errorCopy = {
  QUOTE_EXPIRED: {
    title: 'Your quote has expired',
    message: 'Get a fresh quote and review the updated protection before confirming.',
  },
  BALANCE_EXCEEDED: {
    title: 'That is more than your demo balance',
    message: 'Reduce the amount so it does not exceed the balance shown above.',
  },
  NO_EXPIRY: {
    title: 'That date is not available',
    message: 'No protection currently lasts as long as the date you selected.',
  },
  NO_TIERS: {
    title: 'No protection choices right now',
    message: 'The live market does not have a suitable choice for this request. Try again later.',
  },
  INVALID_REQUEST: {
    title: 'Check your details',
    message: 'Correct the highlighted information and request a new quote.',
  },
  UPSTREAM_ERROR: {
    title: 'Live pricing is unavailable',
    message: 'We could not reach the market right now. Wait a moment and try again.',
  },
};

export function formatUsdc(value) {
  return `${currency.format(value)} USDC`;
}

export function formatDate(iso) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function toApiErrorViewModel(error, requestContext = {}) {
  const apiError = error?.payload?.error;
  const code = apiError?.code ?? 'UPSTREAM_ERROR';
  const fallback = errorCopy[code] ?? errorCopy.UPSTREAM_ERROR;

  if (code === 'NO_EXPIRY' && apiError?.details?.longestAvailableDate && requestContext.targetDate) {
    const requestedDate = requestContext.targetDate.includes('T')
      ? requestContext.targetDate
      : `${requestContext.targetDate}T00:00:00Z`;

    return {
      code,
      title: 'Your date is beyond the available market',
      message: `The longest available protection ends ${formatDate(apiError.details.longestAvailableDate)}, but you selected ${formatDate(requestedDate)}. Choose an earlier date to continue.`,
    };
  }

  return { code, ...fallback };
}

export function toQuoteViewModel(dto) {
  const tiers = dto.tiers.map((tier, index) => {
    const copy = tierCopy[tier.actual.tier] ?? {
      name: `Protection choice ${index + 1}`,
      description: 'An available protection choice for this request.',
    };

    return {
      tierId: tier.tierId,
      recommended: Boolean(tier.recommended),
      name: copy.name,
      description: copy.description,
      floor: formatUsdc(tier.actual.floorUsdc),
      protectionDrop: `${tier.actual.protectionPct.toFixed(1)}% below today`,
      expiry: formatDate(tier.actual.expiry),
      protectedAmount: `${number.format(tier.size.protectedUnits)} ${dto.asset}`,
      cost: formatUsdc(tier.cost.premiumUsdc),
      maximumLoss: formatUsdc(tier.maxLoss.forConfirmation),
      sizeReduced: Boolean(tier.disclosure.sizeReduced),
      unprotectedAmount: `${number.format(tier.disclosure.unprotectedUnits)} ${dto.asset}`,
      unprotectedValue: formatUsdc(tier.disclosure.unprotectedValueUsdc),
      expiryLaterThanRequested: Boolean(tier.disclosure.expiryLaterThanRequested),
      paysIn: tier.settlement.paysIn,
      protectedValueAtFloor: formatUsdc(tier.payout.floorValueUsdc),
      raw: tier,
    };
  });

  const recommended = tiers.find((tier) => tier.recommended) ?? tiers[0] ?? null;

  return {
    quoteId: dto.quoteId,
    asset: dto.asset,
    spot: formatUsdc(dto.spot),
    requestedAmount: `${number.format(dto.requested.units)} ${dto.asset}`,
    targetDate: formatDate(dto.requested.targetDate),
    createdAt: dto.createdAt,
    expiresAt: dto.expiresAt,
    tiers,
    defaultTierId: recommended?.tierId ?? null,
    raw: dto,
  };
}

export function toPositionViewModel(position) {
  const statusCopy = {
    active: 'Active',
    settled: 'Paid out',
    expired_worthless: 'Not needed',
    pending: 'Processing',
    pending_verification: 'Verifying',
    needs_review: 'Under review',
    failed: 'Failed',
  };

  return {
    ...position,
    statusLabel: statusCopy[position.status] ?? position.status,
    amountLabel: `${number.format(position.protectedAmount)} ${position.asset}`,
    floorLabel: formatUsdc(position.protectionFloorUsdc),
    premiumLabel: formatUsdc(position.premiumPaidUsdc),
    payoutLabel: position.payoutUsdc == null ? null : formatUsdc(position.payoutUsdc),
    expiryLabel: formatDate(position.expiry),
  };
}
