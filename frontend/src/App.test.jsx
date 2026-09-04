import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const liveApi = vi.hoisted(() => ({
  getDemoContext: vi.fn(),
  getMarketContext: vi.fn(),
  getAssetsOverview: vi.fn(),
  getAssetCandles: vi.fn(),
  getAssetOrderBook: vi.fn(),
  getPositions: vi.fn(),
  getPortfolio: vi.fn(),
  getVaults: vi.fn(),
  getLoans: vi.fn(),
  createQuote: vi.fn(),
  purchaseQuote: vi.fn(),
}));

vi.mock('./api/client.js', () => ({ liveApi }));

vi.mock('lightweight-charts', () => ({
  CandlestickSeries: {},
  ColorType: { Solid: 'solid' },
  createChart: () => ({
    addSeries: () => ({ setData: vi.fn() }),
    applyOptions: vi.fn(),
    remove: vi.fn(),
    timeScale: () => ({ fitContent: vi.fn() }),
  }),
}));

import App from './App.jsx';

const marketContext = {
  assets: [
    { symbol: 'BTC', name: 'Bitcoin', spotUsdc: 77_487.38, holdingUnits: 0.01, protectionAvailable: true, longestProtectionDays: 2, unavailableReason: null },
    { symbol: 'ETH', name: 'Ethereum', spotUsdc: 2_850, holdingUnits: 0.4, protectionAvailable: true, longestProtectionDays: 2, unavailableReason: null },
    { symbol: 'SOL', name: 'Solana', spotUsdc: 101.25, holdingUnits: 10, protectionAvailable: false, longestProtectionDays: null, unavailableReason: 'Unavailable now.' },
    { symbol: 'BNB', name: 'BNB', spotUsdc: 680, holdingUnits: 1.5, protectionAvailable: true, longestProtectionDays: 1, unavailableReason: null },
  ],
  updatedAt: '2026-09-02T04:12:12.000Z',
  reality: { price: 'live', balance: 'simulated' },
};

const demoContext = {
  displayName: 'Demo User',
  balances: [{ asset: 'ETH', amount: 0.4 }],
  reality: { balance: 'simulated', quote: 'live', fill: 'operator', settlement: 'live' },
};

const assetOverview = {
  assets: [{
    symbol: 'ETH', name: 'Ethereum', priceUsd: 2415.57, priceChange24hPct: 1.2,
    marketCapUsd: 280_000_000_000, volume24hUsd: 20_000_000_000,
    circulatingSupply: 120_000_000, allTimeHighUsd: 4878.26,
    quoteCurrency: 'USD', source: 'CoinGecko', updatedAt: '2026-09-02T04:12:12.000Z',
  }],
  source: 'CoinGecko', quoteCurrency: 'USD', updatedAt: '2026-09-02T04:12:12.000Z',
};

const orderBook = {
  symbol: 'ETH', pair: 'ETHUSDT', quoteCurrency: 'USDT',
  bids: [{ price: 2411.63, quantity: 4 }], asks: [{ price: 2411.64, quantity: 3 }],
  venue: 'Binance', source: 'Binance', updatedAt: '2026-09-02T04:12:12.000Z',
  scopeStatement: "This is Binance's ETH/USDT order book, not a global market view.",
};

const candles = {
  symbol: 'ETH', pair: 'ETHUSDT', quoteCurrency: 'USDT', interval: '5m',
  candles: [{ timestamp: 1788310800000, open: 2410, high: 2420, low: 2405, close: 2415, volume: 100 }],
  source: 'Binance', updatedAt: '2026-09-02T04:12:12.000Z',
};

describe('application routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    liveApi.getMarketContext.mockResolvedValue(marketContext);
    liveApi.getDemoContext.mockResolvedValue(demoContext);
    liveApi.getPositions.mockResolvedValue({ positions: [] });
    liveApi.getPortfolio.mockResolvedValue({
      totalValueUsdc: 4703.2,
      totalValueComplete: true,
      unpricedAssets: [],
      activeProtectionCount: 2,
      pendingProtectionCount: 0,
      nextExpiry: '2026-09-03T08:00:00.000Z',
      holdings: [],
      simulated: true,
    });
    liveApi.getAssetsOverview.mockResolvedValue(assetOverview);
    liveApi.getAssetCandles.mockResolvedValue(candles);
    liveApi.getAssetOrderBook.mockResolvedValue(orderBook);
    liveApi.getVaults.mockResolvedValue({ vaults: [] });
    liveApi.getLoans.mockResolvedValue({ loans: [] });
  });

  it('opens /markets directly on the real-data markets page', async () => {
    render(<MemoryRouter initialEntries={['/markets']}><App /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Portfolio value' })).toBeVisible();
    expect(screen.getByText('$4,703.20 USDC')).toBeVisible();
    expect(screen.queryByRole('heading', { name: /Build your protection/i })).not.toBeInTheDocument();
    expect(liveApi.getPortfolio).toHaveBeenCalledTimes(1);
  });

  it('navigates from Welcome to Markets through Get Started', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'Get Started' }));

    expect(await screen.findByRole('heading', { name: 'Portfolio value' })).toBeVisible();
    expect(liveApi.getPortfolio).toHaveBeenCalledTimes(1);
  });

  it('redirects the legacy /dashboard route to Markets', async () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Portfolio value' })).toBeVisible();
    expect(liveApi.getPortfolio).toHaveBeenCalledTimes(1);
  });

  it('navigates from a Welcome market card to Coin Detail without a reload', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

    const ethereumHeading = await screen.findByRole('heading', { name: 'Ethereum' });
    await user.click(within(ethereumHeading.closest('article')).getByRole('button', { name: 'Market details' }));

    expect(await screen.findByRole('heading', { name: 'Ethereum' })).toBeVisible();
    expect(screen.getByText('$2,415.57 USD')).toBeVisible();
    expect(liveApi.getAssetsOverview).toHaveBeenCalledTimes(1);
  });

  it('shows the shared Alpha home logo and returns to Welcome without a reload', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/markets']}><App /></MemoryRouter>);

    await screen.findByRole('heading', { name: 'Portfolio value' });
    expect(screen.queryByRole('link', { name: 'Back to Welcome' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Alpha home' }));

    expect(await screen.findByRole('button', { name: 'Get Started' })).toBeVisible();
  });

  it('returns Buy Protection to the originating Coin Detail page', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/coin/ETH']}><App /></MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: 'Protect ETH' }));
    const backLink = await screen.findByRole('link', { name: 'Back to ETH details' });
    expect(backLink).toHaveClass('page-back-link');
    await user.click(backLink);

    expect(await screen.findByText('$2,415.57 USD')).toBeVisible();
  });

  it('uses My Crypto as the safe Buy Protection return destination', async () => {
    render(<MemoryRouter initialEntries={['/protect/ETH?from=portfolio']}><App /></MemoryRouter>);

    const backLink = await screen.findByRole('link', { name: 'Back to My Crypto' });
    expect(backLink).toHaveClass('page-back-link');
    expect(backLink).toHaveAttribute('href', '/portfolio');
  });
});
