import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import HomePage from './HomePage.jsx';

const assets = [
  { symbol: 'ETH', name: 'Ethereum', priceUsd: 2400, priceChange24hPct: 1.5, marketCapUsd: 280_000_000_000, quoteCurrency: 'USD', updatedAt: '2026-09-03T01:00:00Z' },
  { symbol: 'BTC', name: 'Bitcoin', priceUsd: 77_000, priceChange24hPct: -4.2, marketCapUsd: 1_500_000_000_000, quoteCurrency: 'USD', updatedAt: '2026-09-03T01:00:00Z' },
  { symbol: 'SOL', name: 'Solana', priceUsd: 100, priceChange24hPct: 2.8, marketCapUsd: 50_000_000_000, quoteCurrency: 'USD', updatedAt: '2026-09-03T01:00:00Z' },
  { symbol: 'BNB', name: 'BNB', priceUsd: 680, priceChange24hPct: -0.4, marketCapUsd: 95_000_000_000, quoteCurrency: 'USD', updatedAt: '2026-09-03T01:00:00Z' },
];

function apiClient(overrides = {}) {
  return {
    getDemoContext: vi.fn().mockResolvedValue({ displayName: 'Demo User' }),
    getPortfolio: vi.fn().mockResolvedValue({
      totalValueUsdc: 4703.2, totalValueComplete: true, unpricedAssets: [], simulated: true,
    }),
    getAssetsOverview: vi.fn().mockResolvedValue({ assets, source: 'CoinGecko', quoteCurrency: 'USD' }),
    getAssetCandles: vi.fn((symbol) => Promise.resolve({
      symbol, source: 'Binance', quoteCurrency: 'USDT',
      candles: [{ close: 100 }, { close: symbol === 'BTC' ? 90 : 110 }],
    })),
    ...overrides,
  };
}

function renderHome(client) {
  return render(
    <MemoryRouter initialEntries={['/markets']}>
      <Routes>
        <Route path="/markets" element={<HomePage apiClient={client} />} />
        <Route path="/portfolio" element={<div>Portfolio route</div>} />
        <Route path="/coin/:symbol" element={<div>Coin detail route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HomePage', () => {
  it('renders only the approved real-data Home content and labels its sources', async () => {
    const client = apiClient();
    renderHome(client);

    expect(await screen.findByText('$4,703.20 USDC')).toBeVisible();
    expect(screen.getByText('Live USDC prices · simulated holdings')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Trending now' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Supported assets' })).toBeVisible();
    expect(screen.getByText(/Alpha’s supported assets/)).toBeVisible();
    expect(screen.getByText(/aggregated USD data.*Binance USDT candles/i)).toBeVisible();
    expect(await screen.findAllByLabelText(/seven-day Binance USDT trend/)).toHaveLength(4);
    expect(client.getAssetCandles).toHaveBeenCalledTimes(4);
    expect(client.getAssetCandles).toHaveBeenCalledWith('ETH', { interval: '1h', limit: 168 });

    expect(screen.queryByText(/Good Morning/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI Market Brief/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Favorites|Watchlist|Estimated Payout|Protection Coverage|Market Movers/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search cryptocurrencies')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Protection overview/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Signed in as/i)).not.toBeInTheDocument();
    expect(client.getDemoContext).not.toHaveBeenCalled();
  });

  it('ranks Trending Now by absolute movement and links it to Coin Detail', async () => {
    const user = userEvent.setup();
    renderHome(apiClient());

    const trending = await screen.findByRole('region', { name: 'Trending now' });
    const cards = within(trending).getAllByRole('button');
    expect(cards[0]).toHaveTextContent('#1');
    expect(cards[0]).toHaveTextContent('BTC');
    await user.click(cards[0]);
    expect(screen.getByText('Coin detail route')).toBeVisible();
  });

  it('shows every supported asset without the removed header search', async () => {
    renderHome(apiClient());
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(5);
    expect(within(table).getByText('Solana')).toBeVisible();
    expect(within(table).getByText('Bitcoin')).toBeVisible();
    expect(screen.queryByPlaceholderText('Search cryptocurrencies')).not.toBeInTheDocument();
  });

  it('shows a qualified partial portfolio value', async () => {
    renderHome(apiClient({
      getPortfolio: vi.fn().mockResolvedValue({
        totalValueUsdc: 1000, totalValueComplete: false, unpricedAssets: ['AVAX', 'XRP'], simulated: true,
      }),
    }));
    expect(await screen.findByText('$1,000.00 USDC')).toBeVisible();
    expect(screen.getByText('Partial value · AVAX, XRP could not be priced')).toBeVisible();
  });

  it('keeps the portfolio visible when market data fails and substitutes no rankings', async () => {
    renderHome(apiClient({ getAssetsOverview: vi.fn().mockRejectedValue(new Error('offline')) }));
    expect(await screen.findByText('$4,703.20 USDC')).toBeVisible();
    expect(await screen.findByText('Live market trends unavailable')).toBeVisible();
    expect(screen.getByText('No sample rankings have been substituted.')).toBeVisible();
    expect(screen.getByText('Market table unavailable')).toBeVisible();
  });

  it('keeps one failed seven-day trend unavailable instead of drawing a fallback', async () => {
    const client = apiClient({
      getAssetCandles: vi.fn((symbol) => symbol === 'SOL'
        ? Promise.reject(new Error('offline'))
        : Promise.resolve({ candles: [{ close: 100 }, { close: 110 }] })),
    });
    renderHome(client);
    expect(await screen.findByText('Seven-day trend unavailable for SOL. No fallback chart is shown.')).toBeVisible();
    expect(screen.getAllByText('Unavailable')).toHaveLength(1);
  });

  it('opens Coin Detail by clicking anywhere in an asset row', async () => {
    const user = userEvent.setup();
    renderHome(apiClient());
    const row = await screen.findByRole('row', { name: 'View Ethereum coin details' });
    await user.click(within(row).getByText('$2,400.00 USD'));
    expect(screen.getByText('Coin detail route')).toBeVisible();
  });

  it('opens Coin Detail from a focused asset row with the keyboard', async () => {
    const user = userEvent.setup();
    renderHome(apiClient());
    const row = await screen.findByRole('row', { name: 'View Bitcoin coin details' });
    row.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Coin detail route')).toBeVisible();
  });
});

