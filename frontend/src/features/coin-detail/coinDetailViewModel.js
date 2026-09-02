const currencyFormatters = new Map();

function currencyFormatter(currency) {
  if (!currencyFormatters.has(currency)) {
    currencyFormatters.set(currency, new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }));
  }
  return currencyFormatters.get(currency);
}

export function formatCurrency(value, currency = 'USD') {
  if (value == null || !Number.isFinite(Number(value))) return 'Unavailable';
  return `${currencyFormatter(currency).format(Number(value))} ${currency}`;
}

export function formatCompact(value, suffix = '') {
  if (value == null || !Number.isFinite(Number(value))) return 'Unavailable';
  const formatted = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(Number(value));
  return suffix ? `${formatted} ${suffix}` : formatted;
}

export function formatChange(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'Unavailable';
  const numeric = Number(value);
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(2)}%`;
}

export function formatUpdatedAt(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return 'Update time unavailable';
  return `Updated ${new Intl.DateTimeFormat(undefined, {
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  }).format(date)}`;
}

export function toOverviewViewModel(asset) {
  return {
    ...asset,
    priceLabel: formatCurrency(asset.priceUsd, asset.quoteCurrency || 'USD'),
    changeLabel: formatChange(asset.priceChange24hPct),
    changeTone: Number(asset.priceChange24hPct) > 0 ? 'positive' : Number(asset.priceChange24hPct) < 0 ? 'negative' : 'neutral',
    marketCapLabel: formatCurrency(asset.marketCapUsd, 'USD'),
    volumeLabel: formatCurrency(asset.volume24hUsd, 'USD'),
    supplyLabel: formatCompact(asset.circulatingSupply, asset.symbol),
    allTimeHighLabel: formatCurrency(asset.allTimeHighUsd, 'USD'),
    updatedAtLabel: formatUpdatedAt(asset.updatedAt),
  };
}
