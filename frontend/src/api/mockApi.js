const wait = (milliseconds = 450) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const quoteSessions = new Map();

const demoContext = {
  displayName: 'Demo User',
  balances: [{ asset: 'ETH', amount: 0.4 }],
  simulated: true,
};

const positions = [];

function apiError(code, message, details, status = 400) {
  const error = new Error(message);
  error.status = status;
  error.payload = { error: { code, message, ...(details ? { details } : {}) } };
  return error;
}

function tier({
  id,
  label,
  recommended,
  floor,
  protection,
  protectedUnits,
  contractsRaw,
  boundBy,
  cost,
  premiumPerContractUsdc,
  premiumPctOfSpot,
  maxLoss,
  wholeHoldingLoss,
  unprotectedUnits,
  unprotectedValueUsdc,
  floorValueUsdc,
  maxPayoutUsdc,
}) {
  return {
    tierId: id,
    recommended,
    actual: {
      tier: label,
      floorUsdc: floor,
      protectionPct: protection,
      expiry: '2026-09-25T08:00:00.000Z',
      daysToExpiry: 25.6,
      expiryGapDays: 0.6,
    },
    size: {
      contracts: protectedUnits,
      contractsRaw,
      protectedUnits,
      boundBy,
    },
    cost: {
      premiumUsdc: cost,
      premiumPerContractUsdc,
      premiumPctOfSpot,
    },
    maxLoss: {
      onProtection: cost,
      onProtectedPortion: maxLoss,
      onWholeHolding: wholeHoldingLoss,
      forConfirmation: maxLoss,
    },
    disclosure: {
      expiryLaterThanRequested: false,
      sizeReduced: boundBy !== 'requested',
      unprotectedUnits,
      unprotectedValueUsdc,
      strikesAvailableAtExpiry: 8,
    },
    payout: {
      floorValueUsdc,
      maxPayoutUsdc,
    },
    settlement: { style: 'european', paysIn: 'USDC' },
  };
}

export async function getDemoContext() {
  await wait(220);
  return structuredClone(demoContext);
}

export async function createQuote(request) {
  await wait(650);

  if (!request.asset || !Number.isFinite(request.units) || request.units <= 0) {
    throw apiError('INVALID_REQUEST', 'The quote request is invalid.');
  }

  const balance = demoContext.balances.find((item) => item.asset === request.asset)?.amount ?? 0;
  if (request.units > balance) {
    throw apiError(
      'BALANCE_EXCEEDED',
      'The requested amount is larger than the recorded balance.',
      { requested: request.units, balance, asset: request.asset },
    );
  }

  if (request.mode === 'goal' && request.targetDate > '2026-09-25') {
    throw apiError(
      'NO_EXPIRY',
      'No expiry is available on or after the requested date.',
      {
        longestAvailableDate: '2026-09-25T08:00:00.000Z',
        shortfallDays: 36.4,
      },
      404,
    );
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 60_000);
  const quoteId = crypto.randomUUID();
  const quote = {
    quoteId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    validForSeconds: 60,
    asset: request.asset,
    spot: 2508.13,
    requested: {
      units: request.units,
      targetDate: request.targetDate
        ? new Date(`${request.targetDate}T08:00:00.000Z`).toISOString()
        : '2026-09-24T08:00:00.000Z',
    },
    tiers: [
      tier({ id: crypto.randomUUID(), label: 'highest', recommended: false, floor: 2300, protection: 8.3, protectedUnits: 0.1412, contractsRaw: '141200', boundBy: 'premiumCap', cost: 5, premiumPerContractUsdc: 35.410765, premiumPctOfSpot: 1.4118, maxLoss: 34.4, wholeHoldingLoss: 683.49, unprotectedUnits: 0.2588, unprotectedValueUsdc: 649.09, floorValueUsdc: 324.76, maxPayoutUsdc: 324.76 }),
      tier({ id: crypto.randomUUID(), label: 'middle', recommended: true, floor: 2150, protection: 14.3, protectedUnits: 0.321531, contractsRaw: '321531', boundBy: 'premiumCap', cost: 5, premiumPerContractUsdc: 15.550606, premiumPctOfSpot: 0.62, maxLoss: 120.15, wholeHoldingLoss: 317, unprotectedUnits: 0.078469, unprotectedValueUsdc: 196.81, floorValueUsdc: 691.29, maxPayoutUsdc: 691.29 }),
      tier({ id: crypto.randomUUID(), label: 'lowest', recommended: false, floor: 1950, protection: 22.3, protectedUnits: 0.4, contractsRaw: '400000', boundBy: 'requested', cost: 2.26, premiumPerContractUsdc: 5.65, premiumPctOfSpot: 0.2253, maxLoss: 225.51, wholeHoldingLoss: 225.51, unprotectedUnits: 0, unprotectedValueUsdc: 0, floorValueUsdc: 780, maxPayoutUsdc: 780 }),
    ],
  };

  quoteSessions.set(quoteId, quote);
  return structuredClone(quote);
}

export async function purchaseQuote({ quoteId, tierId }) {
  await wait(850);
  const quote = quoteSessions.get(quoteId);

  if (!quote || Date.now() >= new Date(quote.expiresAt).getTime()) {
    throw apiError('QUOTE_EXPIRED', 'The quote has expired.', { quoteId }, 409);
  }

  const selectedTier = quote.tiers.find((item) => item.tierId === tierId);
  if (!selectedTier) {
    throw apiError('INVALID_REQUEST', 'The selected tier does not belong to this quote.');
  }

  const position = {
    positionId: crypto.randomUUID(),
    asset: quote.asset,
    protectedAmount: selectedTier.size.protectedUnits,
    protectionFloorUsdc: selectedTier.actual.floorUsdc,
    expiry: selectedTier.actual.expiry,
    premiumPaidUsdc: selectedTier.cost.premiumUsdc,
    status: 'active',
    payoutUsdc: null,
    explorerUrl: 'https://basescan.org',
  };

  positions.unshift(position);

  return {
    positionId: position.positionId,
    txHash: `0x${crypto.randomUUID().replaceAll('-', '').padEnd(64, '0')}`,
    explorerUrl: position.explorerUrl,
    optionAddress: '0x0000000000000000000000000000000000000000',
    status: 'active',
  };
}

export async function getPositions() {
  await wait(350);
  return { positions: structuredClone(positions) };
}
