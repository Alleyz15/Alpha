import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CoinDetailPage from './CoinDetailPage.jsx';

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

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

function overviewResponse() {
  return {
    source: 'CoinGecko', quoteCurrency: 'USD', updatedAt: '2026-09-02T10:00:00.000Z',
    assets: [{
      symbol: 'ETH', name: 'Ethereum', priceUsd: 2415.57, priceChange24hPct: -2.07,
      marketCapUsd: null, volume24hUsd: 42_000_000_000, circulatingSupply: 120_000_000,
      allTimeHighUsd: 4878.26, allTimeHighDate: '2021-11-10T00:00:00.000Z',
      quoteCurrency: 'USD', source: 'CoinGecko', updatedAt: '2026-09-02T10:00:00.000Z',
    }],
  };
}

function orderBookResponse() {
  const rows = Array.from({ length: 7 }, (_, index) => ({ price: 2411.63 + index * 0.01, quantity: 10 + index }));
  return {
    symbol: 'ETH', pair: 'ETHUSDT', quoteCurrency: 'USDT', bids: rows, asks: rows,
    venue: 'Binance', scope: 'single-exchange', source: 'Binance',
    scopeStatement: "This is Binance's ETH/USDT order book, not a global market view.",
    updatedAt: '2026-09-02T10:00:01.000Z',
  };
}

function candlesResponse(range = '1D') {
  return {
    symbol: 'ETH', pair: 'ETHUSDT', quoteCurrency: 'USDT', range, interval: range === '1H' ? '1m' : '5m',
    candles: [{ timestamp: 1788310800000, open: 2410, high: 2420, low: 2405, close: 2415, volume: 100 }],
    source: 'Binance', updatedAt: '2026-09-02T10:00:00.000Z',
  };
}

function client(overrides = {}) {
  return {
    getAssetsOverview: vi.fn().mockResolvedValue(overviewResponse()),
    getAssetCandles: vi.fn((symbol, range) => Promise.resolve(candlesResponse(range))),
    getAssetOrderBook: vi.fn().mockResolvedValue(orderBookResponse()),
    ...overrides,
  };
}

describe('CoinDetailPage', () => {
  it('keeps USD, USDT and USDC sources distinct and never formats null as zero', async () => {
    const apiClient = client();
    render(
      <CoinDetailPage
        symbol="ETH" apiClient={apiClient} onBack={vi.fn()} onDashboard={vi.fn()} onProtect={vi.fn()}
        orderBookPollInterval={999_999}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Ethereum' })).toBeVisible();
    expect(screen.getByText('$2,415.57 USD')).toBeVisible();
    expect(screen.getByText('Unavailable')).toBeVisible();
    expect(screen.getByText('ETH/USDT')).toBeVisible();
    expect(await screen.findByText("This is Binance's ETH/USDT order book, not a global market view.")).toBeVisible();
    expect(screen.getByText(/Alpha protection quotes use USDC from Thetanuts/)).toBeVisible();
    expect(screen.queryByText('$0.00 USD')).not.toBeInTheDocument();
    expect(apiClient.getAssetOrderBook).toHaveBeenCalledWith('ETH');
  });

  it('shows an honest unavailable state and removes book rows when Binance fails', async () => {
    const apiClient = client({ getAssetOrderBook: vi.fn().mockRejectedValue(new Error('offline')) });
    render(
      <CoinDetailPage
        symbol="ETH" apiClient={apiClient} onBack={vi.fn()} onDashboard={vi.fn()} onProtect={vi.fn()}
        orderBookPollInterval={999_999}
      />,
    );

    expect(await screen.findByText('Order book temporarily unavailable')).toBeVisible();
    expect(screen.getByText(/No empty or cached order book has been shown as current/)).toBeVisible();
    expect(screen.queryByText('2411.63 USDT')).not.toBeInTheDocument();
  });

  it('does not poll the order book while hidden and refreshes when the page becomes visible', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const apiClient = client();
    render(
      <CoinDetailPage
        symbol="ETH" apiClient={apiClient} onBack={vi.fn()} onDashboard={vi.fn()} onProtect={vi.fn()}
        orderBookPollInterval={20}
      />,
    );

    await screen.findByRole('heading', { name: 'Ethereum' });
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(apiClient.getAssetOrderBook).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(apiClient.getAssetOrderBook).toHaveBeenCalledTimes(1));
  });

  it('connects the protection CTA without pretending to buy the underlying asset', async () => {
    const user = userEvent.setup();
    const onProtect = vi.fn();
    render(
      <CoinDetailPage
        symbol="ETH" apiClient={client()} onBack={vi.fn()} onDashboard={vi.fn()} onProtect={onProtect}
        orderBookPollInterval={999_999}
      />,
    );

    await screen.findByRole('heading', { name: 'Ethereum' });
    await user.click(screen.getByRole('button', { name: 'Protect ETH' }));
    expect(onProtect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Buy ETH/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sell ETH/i })).not.toBeInTheDocument();
  });

  it('loads Binance candles for each supported timeframe without relabelling USDT', async () => {
    const user = userEvent.setup();
    const apiClient = client();
    render(
      <CoinDetailPage
        symbol="ETH" apiClient={apiClient} onBack={vi.fn()} onDashboard={vi.fn()} onProtect={vi.fn()}
        orderBookPollInterval={999_999}
      />,
    );

    expect(await screen.findByText('Source: Binance · 5m candles')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '1H' }));
    await waitFor(() => expect(apiClient.getAssetCandles).toHaveBeenLastCalledWith('ETH', '1H'));
    expect(await screen.findByText('Source: Binance · 1m candles')).toBeVisible();
    expect(screen.getByText(/Chart prices are USDT from Binance/)).toBeVisible();
  });

  it('removes stale candle data when Binance returns an error', async () => {
    const apiClient = client({ getAssetCandles: vi.fn().mockRejectedValue(new Error('offline')) });
    render(
      <CoinDetailPage
        symbol="ETH" apiClient={apiClient} onBack={vi.fn()} onDashboard={vi.fn()} onProtect={vi.fn()}
        orderBookPollInterval={999_999}
      />,
    );

    expect(await screen.findByText('Chart temporarily unavailable')).toBeVisible();
    expect(screen.getByText(/No previous or sample chart is shown/)).toBeVisible();
    expect(screen.queryByLabelText('Candlestick chart')).not.toBeInTheDocument();
  });

  it('reports an asset absent from the live overview instead of inventing it', async () => {
    render(
      <CoinDetailPage
        symbol="DOGE" apiClient={client()} onBack={vi.fn()} onDashboard={vi.fn()} onProtect={vi.fn()}
        orderBookPollInterval={999_999}
      />,
    );

    expect(await screen.findByText('DOGE market detail is not offered')).toBeVisible();
  });
});
