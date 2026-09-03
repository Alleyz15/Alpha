import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WelcomePage from './WelcomePage.jsx';

function marketContext() {
  return {
    assets: [
      {
        symbol: 'ETH', name: 'Ethereum', spotUsdc: 2850, holdingUnits: 0.4,
        protectionAvailable: true, longestProtectionDays: 2, unavailableReason: null,
      },
      {
        symbol: 'BTC', name: 'Bitcoin', spotUsdc: 77487.38, holdingUnits: 0.01,
        protectionAvailable: true, longestProtectionDays: 2, unavailableReason: null,
      },
      {
        symbol: 'SOL', name: 'Solana', spotUsdc: 101.25, holdingUnits: 10,
        protectionAvailable: false, longestProtectionDays: null,
        unavailableReason: 'No qualifying SOL protection is available right now.',
      },
      {
        symbol: 'BNB', name: 'BNB', spotUsdc: 680, holdingUnits: 1.5,
        protectionAvailable: true, longestProtectionDays: 1, unavailableReason: null,
      },
    ],
    updatedAt: '2026-09-02T04:12:12.000Z',
    reality: { price: 'live', balance: 'simulated' },
  };
}

describe('WelcomePage', () => {
  it('renders the approved message and live backend market values without sample choices', async () => {
    const client = { getMarketContext: vi.fn().mockResolvedValue(marketContext()) };
    render(<WelcomePage apiClient={client} marketPollInterval={999_999} />);

    expect(screen.getByRole('heading', { name: /Crypto moves.*Your plans should not have to/i })).toBeVisible();
    expect(await screen.findAllByText('$2,850.00 USDC')).toHaveLength(2);
    expect(screen.getAllByText('0.01 BTC').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Protection available up to 2 days').length).toBeGreaterThan(0);
    expect(screen.getByText('Alpha simulates the user holding—not the live protection market.')).toBeVisible();
    expect(screen.queryByText('Balanced')).not.toBeInTheDocument();
    expect(screen.queryByText('Basic')).not.toBeInTheDocument();
    expect(screen.queryByText('Enhanced')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get Started' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'How Alpha works' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'How it works' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Live market' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Product reality' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Markets' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'My Portfolio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Footer' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Protection without the trading-language barrier' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Protection should feel like a plan, not a trading terminal.' })).toBeVisible();
    expect(client.getMarketContext).toHaveBeenCalledTimes(1);
  });

  it('switches the hero snapshot between assets while preserving backend values', async () => {
    const user = userEvent.setup();
    const client = { getMarketContext: vi.fn().mockResolvedValue(marketContext()) };
    render(<WelcomePage apiClient={client} marketPollInterval={999_999} />);
    await screen.findAllByText('$2,850.00 USDC');

    await user.click(screen.getByRole('tab', { name: 'BTC' }));
    expect(screen.getByRole('tab', { name: 'BTC' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByText('$77,487.38 USDC').length).toBeGreaterThan(1);
    expect(screen.getAllByText('0.01 BTC').length).toBeGreaterThan(0);
  });

  it('renders every asset returned by market-context without a fixed four-asset limit', async () => {
    const context = marketContext();
    context.assets.push(
      {
        symbol: 'AVAX', name: 'Avalanche', spotUsdc: 24.12, holdingUnits: null,
        protectionAvailable: false, longestProtectionDays: null, unavailableReason: 'Not offered yet.',
      },
      {
        symbol: 'XRP', name: 'XRP', spotUsdc: 1.98, holdingUnits: null,
        protectionAvailable: true, longestProtectionDays: 1, unavailableReason: null,
      },
    );
    const client = { getMarketContext: vi.fn().mockResolvedValue(context) };

    render(<WelcomePage apiClient={client} marketPollInterval={999_999} />);

    expect(await screen.findByRole('tab', { name: 'AVAX' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'XRP' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Avalanche' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'XRP' })).toBeVisible();
  });

  it('shows the backend reason for an unavailable asset instead of hiding it', async () => {
    const client = { getMarketContext: vi.fn().mockResolvedValue(marketContext()) };
    render(<WelcomePage apiClient={client} marketPollInterval={999_999} />);

    expect(await screen.findByRole('heading', { name: 'Solana' })).toBeVisible();
    expect(screen.getByText('No qualifying SOL protection is available right now.')).toBeVisible();
    expect(screen.getAllByText('Protection unavailable').length).toBeGreaterThan(0);
  });

  it('reports an initial live API failure and never substitutes fake market values', async () => {
    const client = { getMarketContext: vi.fn().mockRejectedValue(new Error('offline')) };
    render(<WelcomePage apiClient={client} marketPollInterval={999_999} />);

    await waitFor(() => expect(screen.getAllByText('Live market information is temporarily unavailable')).toHaveLength(2));
    expect(screen.getAllByText('Alpha could not reach the market right now. No sample values have been substituted.')).toHaveLength(2);
    expect(screen.queryByText(/\$77,487/)).not.toBeInTheDocument();
  });

  it('keeps the last successful snapshot visible when a background refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = { getMarketContext: vi.fn()
      .mockResolvedValueOnce(marketContext())
      .mockRejectedValueOnce(new Error('refresh failed')) };
    render(<WelcomePage apiClient={client} marketPollInterval={30_000} />);

    await act(async () => Promise.resolve());
    expect(screen.getAllByText('$77,487.38 USDC').length).toBeGreaterThan(0);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(await screen.findByText('Live update paused. Showing the last successful market snapshot.')).toBeVisible();
    expect(screen.getAllByText('$77,487.38 USDC').length).toBeGreaterThan(0);
    vi.useRealTimers();
  });
});
