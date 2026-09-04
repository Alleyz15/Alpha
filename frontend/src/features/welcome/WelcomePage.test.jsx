import { act, render, screen, waitFor, within } from '@testing-library/react';
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

  // -------------------------------------------------------------------------
  // The lending and vault cards carry a three-step summary.
  // -------------------------------------------------------------------------

  it('summarises the lending and vault flows in three numbered steps each', async () => {
    const client = { getMarketContext: vi.fn().mockResolvedValue(marketContext()) };
    render(<WelcomePage apiClient={client} marketPollInterval={999_999} />);
    await act(async () => Promise.resolve());

    const lending = screen.getByRole('heading', { name: 'Borrow against your protection' }).closest('article');
    const vault = screen.getByRole('heading', { name: 'A deposit that comes back whole' }).closest('article');

    // An ordered list, because the point is the sequence.
    for (const card of [lending, vault]) {
      expect(within(card).getByRole('list').tagName).toBe('OL');
      expect(within(card).getAllByRole('listitem')).toHaveLength(3);
      // The numerals decorate the ordering rather than restating it.
      expect(within(card).getAllByText(/^0[123]$/)).toHaveLength(3);
    }

    expect(within(lending).getByText('Start with protection you hold')).toBeVisible();
    expect(within(lending).getByText('See what your floor supports')).toBeVisible();
    expect(within(lending).getByText('Borrow and repay on Base')).toBeVisible();

    expect(within(vault).getByText('Deposit USDC')).toBeVisible();
    expect(within(vault).getByText('Part of it buys a real position')).toBeVisible();
    expect(within(vault).getByText('Get the whole deposit back')).toBeVisible();
  });

  it('keeps the vault promise honest: the deposit is guaranteed, the upside is not', async () => {
    // Principal protection is a guarantee; participation is not. An interface
    // that promised both would look like it had failed on the day the market
    // did not move - which is the expected day.
    const client = { getMarketContext: vi.fn().mockResolvedValue(marketContext()) };
    render(<WelcomePage apiClient={client} marketPollInterval={999_999} />);
    await act(async () => Promise.resolve());

    expect(screen.getByText(/The deposit is guaranteed; the share of the rise is not/)).toBeVisible();
  });

  it('says none of it in trading language (BR-3)', async () => {
    // Whole words, compared as a set. Matching on substrings would fire on
    // "optional" and "called"; the word list is what BR-3 actually forbids.
    const FORBIDDEN = ['strike', 'premium', 'expiry', 'put', 'call', 'option', 'exercise'];
    const wordsIn = (text) => new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);

    const client = { getMarketContext: vi.fn().mockResolvedValue(marketContext()) };
    const { container } = render(<WelcomePage apiClient={client} marketPollInterval={999_999} />);
    await act(async () => Promise.resolve());

    const cards = [...container.querySelectorAll('.welcome-beyond-card')].map((c) => c.textContent).join(' ');
    const found = (text) => FORBIDDEN.filter((word) => wordsIn(text).has(word));

    // Guard the guard. A "must not appear" assertion passes just as happily
    // on an empty string, or with a pattern that cannot match anything - the
    // first version of this test shipped green with the word "put" in the
    // copy, because an escaping slip had left it anchored to a control
    // character. So: prove there is text, and prove the check can fail.
    expect(cards.length).toBeGreaterThan(200);
    expect(found('a premium put at the strike')).toEqual(['strike', 'premium', 'put']);

    expect(found(cards)).toEqual([]);
  });
});
