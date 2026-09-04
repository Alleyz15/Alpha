import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProtectionFlowPage from './ProtectionFlowPage.jsx';

function marketContext(spotUsdc = 77_000) {
  return {
    assets: [
      {
        symbol: 'BTC',
        name: 'Bitcoin',
        spotUsdc,
        holdingUnits: 0.01,
        protectionAvailable: true,
        longestProtectionDays: 2,
        strikesBelowSpot: 7,
        unavailableReason: null,
      },
      {
        symbol: 'ETH', name: 'Ethereum', spotUsdc: 2400, holdingUnits: 0.4,
        protectionAvailable: true, longestProtectionDays: 2, strikesBelowSpot: 8, unavailableReason: null,
      },
      {
        symbol: 'SOL', name: 'Solana', spotUsdc: 101, holdingUnits: 10,
        protectionAvailable: true, longestProtectionDays: 1, strikesBelowSpot: 9, unavailableReason: null,
      },
      {
        symbol: 'BNB', name: 'BNB', spotUsdc: 680, holdingUnits: 1.5,
        protectionAvailable: true, longestProtectionDays: 1, strikesBelowSpot: 11, unavailableReason: null,
      },
    ],
    updatedAt: '2026-09-02T00:10:00.000Z',
    reality: { price: 'live', balance: 'simulated' },
  };
}

function quoteResponse() {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 60_000);
  return {
    quoteId: 'quote-live-1',
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    validForSeconds: 60,
    asset: 'BTC',
    spot: 77_500,
    requested: { units: 0.005, targetDate: new Date(createdAt.getTime() + 86_400_000).toISOString() },
    tiers: [
      {
        tierId: 'tier-balanced',
        recommended: true,
        actual: {
          tier: 'middle', floorUsdc: 70_000, protectionPct: 9.7,
          expiry: new Date(createdAt.getTime() + 86_400_000).toISOString(),
        },
        size: { protectedUnits: 0.005, confirmed: true, unconfirmedReason: null },
        cost: { premiumUsdc: 1.25 },
        maxLoss: { forConfirmation: 38.75 },
        disclosure: {
          sizeReduced: false, unprotectedUnits: 0, unprotectedValueUsdc: 0,
          expiryLaterThanRequested: false,
        },
        settlement: { paysIn: 'USDC' },
        payout: { floorValueUsdc: 350 },
      },
    ],
  };
}

function apiClient(overrides = {}) {
  return {
    getDemoContext: vi.fn().mockResolvedValue({
      reality: { balance: 'simulated', quote: 'live', fill: 'operator', settlement: 'live' },
    }),
    getMarketContext: vi.fn().mockResolvedValue(marketContext()),
    createQuote: vi.fn().mockResolvedValue(quoteResponse()),
    purchaseQuote: vi.fn().mockResolvedValue({
      positionId: 'position-1',
      status: 'pending_fill',
      fill: 'operator',
      paymentStatus: 'held',
      txHash: null,
      explorerUrl: null,
    }),
    ...overrides,
  };
}

async function completeConfiguration(user) {
  const amount = await screen.findByLabelText(/Amount to protect/);
  await user.clear(amount);
  await user.type(amount, '0.005');
  const date = screen.getByLabelText(/Target date/);
  await user.type(date, date.min);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ProtectionFlowPage', () => {
  it('rejects unsupported route assets without making a backend call', () => {
    const client = apiClient();
    render(<ProtectionFlowPage symbol="DOGE" apiClient={client} onExit={vi.fn()} />);

    expect(screen.getByText(/cannot configure protection/i)).toBeVisible();
    expect(client.getMarketContext).not.toHaveBeenCalled();
    expect(client.getDemoContext).not.toHaveBeenCalled();
  });

  it('recognizes prepared assets but does not quote one absent from market-context', async () => {
    const client = apiClient();
    render(<ProtectionFlowPage symbol="AVAX" apiClient={client} onExit={vi.fn()} />);

    expect(await screen.findByText(/AVAX protection is not available/i)).toBeVisible();
    expect(client.getMarketContext).toHaveBeenCalledTimes(1);
    expect(client.createQuote).not.toHaveBeenCalled();
  });

  it('configures a prepared asset as soon as market-context offers it', async () => {
    const context = marketContext();
    context.assets.push({
      symbol: 'AVAX', name: 'Avalanche', spotUsdc: 24.12, holdingUnits: 4,
      protectionAvailable: true, longestProtectionDays: 2, strikesBelowSpot: 6, unavailableReason: null,
    });
    const client = apiClient({ getMarketContext: vi.fn().mockResolvedValue(context) });

    render(<ProtectionFlowPage symbol="AVAX" apiClient={client} onExit={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Buy protection for Avalanche' })).toBeVisible();
    expect(screen.getByLabelText('Selected asset')).toHaveTextContent('Avalanche');
  });

  it('uses the route asset as a read-only selection and renders live backend context', async () => {
    const client = apiClient();
    render(<ProtectionFlowPage symbol="BTC" apiClient={client} onExit={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Buy protection for Bitcoin' })).toBeVisible();
    expect(screen.getByLabelText('Selected asset')).toHaveTextContent('Bitcoin');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getAllByText('$77,000.00 USDC').length).toBeGreaterThan(0);
    expect(screen.getByText('0.01 BTC')).toBeVisible();
    expect(screen.getByText('Live market quote')).toBeVisible();
    expect(screen.getByText('Simulated balance')).toBeVisible();
    expect(screen.getByText('On-chain settlement')).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText(/Amount to protect/)).toHaveValue(0.0025));
  });

  it('leaves the amount empty and disables quoting when the holding is zero', async () => {
    const context = marketContext();
    context.assets[0] = { ...context.assets[0], holdingUnits: 0 };
    const client = apiClient({ getMarketContext: vi.fn().mockResolvedValue(context) });

    render(<ProtectionFlowPage symbol="BTC" apiClient={client} onExit={vi.fn()} />);

    const amount = await screen.findByLabelText(/Amount to protect/);
    expect(amount).toHaveValue(null);
    expect(amount).toBeDisabled();
    expect(screen.getByRole('button', { name: /Get live quote/ })).toBeDisabled();
    expect(client.createQuote).not.toHaveBeenCalled();
  });

  it('shows the backend reason and disables quoting when protection is unavailable', async () => {
    const unavailable = marketContext();
    unavailable.assets[0] = {
      ...unavailable.assets[0],
      protectionAvailable: false,
      longestProtectionDays: null,
      unavailableReason: 'no protection is being offered on this asset right now',
    };
    const client = apiClient({ getMarketContext: vi.fn().mockResolvedValue(unavailable) });
    render(<ProtectionFlowPage symbol="BTC" apiClient={client} onExit={vi.fn()} />);

    expect(await screen.findByText('no protection is being offered on this asset right now')).toBeVisible();
    expect(screen.getByRole('button', { name: /Get live quote/ })).toBeDisabled();
    expect(client.createQuote).not.toHaveBeenCalled();
  });

  it('locks the backend quote price, invalidates it after an input change, and resumes polling', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const client = apiClient();
    render(<ProtectionFlowPage symbol="BTC" apiClient={client} onExit={vi.fn()} marketPollInterval={30_000} />);
    await act(async () => Promise.resolve());
    await completeConfiguration(user);

    await user.click(screen.getByRole('button', { name: /Get live quote/ }));
    expect(await screen.findByText('Available choices')).toBeVisible();
    expect((await screen.findAllByText('$77,500.00 USDC')).length).toBeGreaterThan(0);
    expect(client.createQuote).toHaveBeenCalledWith(expect.objectContaining({
      asset: 'BTC', units: 0.005, mode: 'percentage', protectionPct: 10,
    }));

    const callsAfterQuote = client.getMarketContext.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(client.getMarketContext).toHaveBeenCalledTimes(callsAfterQuote);

    const amount = screen.getByLabelText(/Amount to protect/);
    await user.clear(amount);
    await user.type(amount, '0.004');

    expect(screen.getByText('Available choices')).toBeVisible();
    expect(screen.queryByRole('radiogroup', { name: 'Available protection choices' })).not.toBeInTheDocument();
    expect(screen.getByText(/live protection choices will appear here/i)).toBeVisible();
    expect(screen.getByText('Configuration changed')).toBeVisible();
    expect(screen.getAllByText('Current live price').length).toBeGreaterThan(0);

    await act(async () => Promise.resolve());
    await waitFor(() => expect(client.getMarketContext.mock.calls.length).toBeGreaterThan(callsAfterQuote));
  });

  it('reviews a backend tier and submits only its quote and tier identifiers', async () => {
    const user = userEvent.setup();
    const client = apiClient();
    const onViewDashboard = vi.fn();
    render(<ProtectionFlowPage symbol="BTC" apiClient={client} onExit={vi.fn()} onViewDashboard={onViewDashboard} />);
    await completeConfiguration(user);

    await user.click(screen.getByRole('button', { name: /Get live quote/ }));
    await screen.findAllByText('$77,500.00 USDC');
    await user.click(screen.getByRole('button', { name: /Continue to review/ }));

    expect(screen.getByRole('heading', { name: 'Check your BTC protection' })).toBeVisible();
    expect(screen.getAllByText('$77,500.00 USDC').length).toBeGreaterThan(0);
    expect(screen.getByText(/simulated balance/i)).toBeVisible();
    expect(screen.getByText(/operator execution/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Submit purchase request/ }));

    await waitFor(() => expect(client.purchaseQuote).toHaveBeenCalledWith({
      quoteId: 'quote-live-1',
      tierId: 'tier-balanced',
    }));
    expect(await screen.findByRole('heading', { name: 'Your request is waiting for execution.' })).toBeVisible();
    expect(screen.getByText('Funds held')).toBeVisible();
    expect(screen.getByText(/No transaction hash was returned/)).toBeVisible();
    expect(screen.queryByRole('link', { name: /BaseScan/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'View my protection' }));
    expect(onViewDashboard).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['operator_spend_capacity', /could not confirm this amount against the operator’s current USDC spending capacity/i],
    ['capacity_unreadable', /could not read the operator’s current USDC spending capacity/i],
  ])('never labels an unconfirmed %s quote size as protected in Configure or Review', async (unconfirmedReason, expectedMessage) => {
    const user = userEvent.setup();
    const response = quoteResponse();
    response.tiers[0].size.confirmed = false;
    response.tiers[0].size.unconfirmedReason = unconfirmedReason;
    const client = apiClient({ createQuote: vi.fn().mockResolvedValue(response) });
    render(<ProtectionFlowPage symbol="BTC" apiClient={client} onExit={vi.fn()} />);
    await completeConfiguration(user);

    await user.click(screen.getByRole('button', { name: /Get live quote/ }));
    expect((await screen.findAllByText('Computed protection amount')).length).toBeGreaterThan(0);
    expect(screen.getByText(expectedMessage)).toBeVisible();
    expect(screen.queryByText('Protected amount')).not.toBeInTheDocument();
    expect(screen.queryByText('Amount protected')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Continue to review/ }));
    expect(screen.getByText('Computed protection amount')).toBeVisible();
    expect(screen.getByText(expectedMessage)).toBeVisible();
    expect(screen.queryByText('Protected amount')).not.toBeInTheDocument();
    expect(screen.queryByText('Amount protected')).not.toBeInTheDocument();
  });

  it('does not let an expired quote continue to Review', async () => {
    const user = userEvent.setup();
    const expired = quoteResponse();
    expired.expiresAt = new Date(Date.now() - 1_000).toISOString();
    const client = apiClient({ createQuote: vi.fn().mockResolvedValue(expired) });
    render(<ProtectionFlowPage symbol="BTC" apiClient={client} onExit={vi.fn()} />);
    await completeConfiguration(user);

    await user.click(screen.getByRole('button', { name: /Get live quote/ }));
    expect(await screen.findByText('Quote expired')).toBeVisible();
    expect(screen.getByRole('button', { name: /request again above/i })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Check your BTC protection' })).not.toBeInTheDocument();
  });
});
