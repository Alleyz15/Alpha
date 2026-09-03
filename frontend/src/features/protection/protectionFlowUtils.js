export const KNOWN_ASSETS = Object.freeze(['ETH', 'BTC', 'BNB', 'SOL', 'AVAX', 'XRP']);

export function isKnownAsset(symbol) {
  return KNOWN_ASSETS.includes(symbol);
}

const CONTRACT_UNIT_DECIMALS = 6;

export function defaultProtectionUnits(holdingUnits) {
  const numericHolding = Number(holdingUnits);
  if (!Number.isFinite(numericHolding) || numericHolding <= 0) return '';

  const quarterHolding = Math.round(numericHolding * 0.25 * (10 ** CONTRACT_UNIT_DECIMALS))
    / (10 ** CONTRACT_UNIT_DECIMALS);
  if (quarterHolding <= 0) return '';

  return quarterHolding.toFixed(CONTRACT_UNIT_DECIMALS).replace(/\.?0+$/, '');
}

export function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(date, days) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() + days);
  return result;
}

export function getDateBounds(longestProtectionDays, now = new Date()) {
  const minimum = dateInputValue(now);
  const safeDays = Number.isInteger(longestProtectionDays) && longestProtectionDays >= 0
    ? longestProtectionDays
    : 0;

  return {
    minimum,
    maximum: dateInputValue(addCalendarDays(now, safeDays)),
  };
}

export function validateConfiguration({ units, protectionPct, targetDate, asset, dateBounds }) {
  const errors = {};
  const numericUnits = Number(units);
  const numericProtectionPct = Number(protectionPct);

  if (!units || !Number.isFinite(numericUnits) || numericUnits <= 0) {
    errors.units = 'Enter an amount greater than zero.';
  } else if (numericUnits > asset.holdingUnits) {
    errors.units = `You can protect up to your recorded holding of ${asset.holdingLabel}.`;
  }

  if (!protectionPct || !Number.isFinite(numericProtectionPct) || numericProtectionPct <= 0 || numericProtectionPct >= 100) {
    errors.protectionPct = 'Enter a percentage between 1 and 99.';
  }

  if (!targetDate) {
    errors.targetDate = 'Choose a target date.';
  } else if (targetDate < dateBounds.minimum || targetDate > dateBounds.maximum) {
    errors.targetDate = dateBounds.minimum === dateBounds.maximum
      ? 'The live market currently offers protection ending today only.'
      : `Choose a date from ${dateBounds.minimum} through ${dateBounds.maximum}.`;
  }

  return errors;
}

export function purchaseStatusView(purchase) {
  if (purchase?.status === 'failed') {
    return {
      tone: 'danger',
      label: 'Request failed',
      title: 'The protection request was not completed.',
      message: 'No active protection was created. Review the message below before trying again.',
    };
  }

  if (purchase?.fill === 'onchain' && purchase?.txHash) {
    return {
      tone: 'success',
      label: 'Active on Base',
      title: 'Your protection is active.',
      message: 'The purchase has been executed by the application wallet and can be verified on BaseScan.',
    };
  }

  return {
    tone: 'warning',
    label: 'Waiting for operator',
    title: 'Your request is waiting for execution.',
    message: 'Alpha recorded the request and held the funds. The application operator will execute it on Base after the safety checks pass.',
  };
}
