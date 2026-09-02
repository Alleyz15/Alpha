import { getAssetIdentity } from '../../components/AssetLogo.jsx';
import { formatCurrency, formatUpdatedAt, toOverviewViewModel } from '../coin-detail/coinDetailViewModel.js';

export function toHomeMarketAsset(asset, candles = []) {
  const identity = getAssetIdentity(asset.symbol, asset.name);
  const cleanCloses = candles
    .map((candle) => Number(candle?.close))
    .filter(Number.isFinite);
  const sevenDayChange = cleanCloses.length > 1 && cleanCloses[0] !== 0
    ? ((cleanCloses.at(-1) - cleanCloses[0]) / cleanCloses[0]) * 100
    : null;

  return {
    ...toOverviewViewModel(asset),
    ...identity,
    candleCloses: cleanCloses,
    sevenDayChange,
    sevenDayTone: sevenDayChange > 0 ? 'positive' : sevenDayChange < 0 ? 'negative' : 'neutral',
    marketCapLabel: asset.marketCapUsd == null || !Number.isFinite(Number(asset.marketCapUsd))
      ? 'Unavailable'
      : `${new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          maximumFractionDigits: 2,
        }).format(Number(asset.marketCapUsd))} USD`,
  };
}

export function rankTrendingAssets(assets = []) {
  return [...assets].sort((left, right) => {
    const leftMove = Number.isFinite(Number(left.priceChange24hPct))
      ? Math.abs(Number(left.priceChange24hPct))
      : -1;
    const rightMove = Number.isFinite(Number(right.priceChange24hPct))
      ? Math.abs(Number(right.priceChange24hPct))
      : -1;
    return rightMove - leftMove;
  });
}

export function formatPortfolioValue(portfolio) {
  if (!portfolio || portfolio.totalValueUsdc == null || !Number.isFinite(Number(portfolio.totalValueUsdc))) {
    return 'Unavailable';
  }
  return formatCurrency(portfolio.totalValueUsdc, 'USD').replace(' USD', ' USDC');
}

export function portfolioValueCaption(portfolio) {
  if (!portfolio) return 'Portfolio information unavailable';
  if (portfolio.totalValueComplete) return 'Live USDC prices · simulated holdings';
  const missing = portfolio.unpricedAssets?.filter(Boolean) ?? [];
  return missing.length
    ? `Partial value · ${missing.join(', ')} could not be priced`
    : 'Partial value · one or more holdings could not be priced';
}

export function marketUpdateLabel(assets = []) {
  const latest = assets
    .map((asset) => new Date(asset.updatedAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  return latest ? formatUpdatedAt(new Date(latest).toISOString()) : 'Update time unavailable';
}
