import { describe, expect, it } from 'vitest';
import { formatPortfolioValue, portfolioValueCaption, rankTrendingAssets, toHomeMarketAsset } from './homeViewModel.js';

describe('Home view model', () => {
  it('ranks assets by absolute 24-hour movement without inventing missing changes', () => {
    const ranked = rankTrendingAssets([
      { symbol: 'ETH', priceChange24hPct: 2 },
      { symbol: 'BTC', priceChange24hPct: -5 },
      { symbol: 'SOL', priceChange24hPct: null },
    ]);
    expect(ranked.map((asset) => asset.symbol)).toEqual(['BTC', 'ETH', 'SOL']);
  });

  it('derives a seven-day direction only from returned candle closes', () => {
    const view = toHomeMarketAsset({
      symbol: 'ETH', name: 'Ethereum', priceUsd: 2400, priceChange24hPct: 1,
      marketCapUsd: 280_000_000_000, quoteCurrency: 'USD', updatedAt: '2026-09-03T00:00:00Z',
    }, [{ close: 2000 }, { close: 2200 }]);
    expect(view.sevenDayChange).toBe(10);
    expect(view.sevenDayTone).toBe('positive');
    expect(view.marketCapLabel).toBe('$280B USD');
  });

  it('qualifies an incomplete portfolio value with the unpriced assets', () => {
    const portfolio = { totalValueUsdc: 1000, totalValueComplete: false, unpricedAssets: ['AVAX', 'XRP'] };
    expect(formatPortfolioValue(portfolio)).toBe('$1,000.00 USDC');
    expect(portfolioValueCaption(portfolio)).toBe('Partial value · AVAX, XRP could not be priced');
  });
});

