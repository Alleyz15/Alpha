import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import PortfolioPage from './PortfolioPage.jsx';
import ProtectionDetailsPage from './ProtectionDetailsPage.jsx';

const portfolio = {
  totalValueUsdc: 1830,
  totalValueComplete: true,
  unpricedAssets: [],
  activeProtectionCount: 1,
  pendingProtectionCount: 0,
  nextExpiry: '2026-09-05T00:00:00Z',
  simulated: true,
  holdings: [
    { asset: 'BTC', amount: 0.01, priceUsdc: 77_000, valueUsdc: 770 },
    { asset: 'ETH', amount: 0.4, priceUsdc: 2400, valueUsdc: 960 },
    { asset: 'USDC', amount: 100, priceUsdc: 1, valueUsdc: 100 },
  ],
};

const protectedPosition = {
  positionId: 'put-1', asset: 'BTC', role: 'protection', optionType: 'put',
  protectedAmount: 0.01, protectionFloorUsdc: 70_000, upsideThresholdUsdc: null,
  entryPriceUsdc: 77_500, status: 'active', expiry: '2026-09-05T00:00:00Z',
  premiumPaidUsdc: 12, paymentStatus: 'paid', chargedUsdc: 12, refundedUsdc: 0,
  verifiedOnChain: true, executionState: 'confirmed', orderId: 'quote-123456789',
  createdAt: '2026-09-01T10:00:00Z', purchasedAt: '2026-09-01T10:02:00Z',
  buyer: { displayName: 'Demo User' },
  account: { walletAddress: '0x1234567890abcdef1234567890abcdef', controlledBy: 'operator' },
  order: { settlementType: 'automatic_at_expiry', paymentMethod: 'simulated_usdc_balance' },
  timeline: [{ event: 'confirmed_onchain', at: '2026-09-01T10:02:00Z' }],
  explorerUrl: 'https://basescan.org/tx/0xabc',
};

describe('Phase 6 pages', () => {
  it('shows one truthful action per holding and excludes cash from protection rows', async () => {
    const user = userEvent.setup();
    const apiClient = {
      getPortfolio: vi.fn().mockResolvedValue(portfolio),
      getPositions: vi.fn().mockResolvedValue({ positions: [protectedPosition] }),
    };
    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <Routes>
          <Route path="/portfolio" element={<PortfolioPage apiClient={apiClient} />} />
          <Route path="/protection/:positionId" element={<div>Opened protection</div>} />
          <Route path="/protect/:symbol" element={<div>Opened checkout</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).queryByText('USDC')).not.toBeInTheDocument();
    expect(within(table).getAllByRole('button')).toHaveLength(2);
    expect(within(table).getByRole('button', { name: /View/ })).toBeVisible();
    expect(within(table).getByRole('button', { name: 'Buy protection' })).toBeVisible();

    await user.click(within(table).getByRole('button', { name: /View/ }));
    expect(screen.getByText('Opened protection')).toBeVisible();
  });

  it('renders the requested contract and order sections without payout or PnL cards', async () => {
    const apiClient = {
      getPositionDetail: vi.fn().mockResolvedValue(protectedPosition),
      getAssetCandles: vi.fn().mockResolvedValue({
        candles: [
          { timestamp: 1, close: 76_000 },
          { timestamp: 2, close: 75_500 },
          { timestamp: 3, close: 76_200 },
        ],
      }),
    };
    render(
      <MemoryRouter initialEntries={['/protection/put-1']}>
        <Routes><Route path="/protection/:positionId" element={<ProtectionDetailsPage apiClient={apiClient} />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'BTC Protection' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Contract overview' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Live tracking' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Order details' })).toBeVisible();
    expect(screen.getByText('Automatic at expiry')).toBeVisible();
    expect(await screen.findByLabelText(/Price tracking chart/)).toBeVisible();
    expect(screen.queryByText('Estimated payout')).not.toBeInTheDocument();
    expect(screen.queryByText('Current PnL')).not.toBeInTheDocument();
    expect(screen.queryByText('Net result')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Claim|Settle/ })).not.toBeInTheDocument();
  });

  it('keeps contract details visible when the live chart feed is unavailable', async () => {
    const apiClient = {
      getPositionDetail: vi.fn().mockResolvedValue({ ...protectedPosition, asset: 'AVAX' }),
      getAssetCandles: vi.fn().mockRejectedValue(new Error('not supported')),
    };
    render(
      <MemoryRouter initialEntries={['/protection/put-1']}>
        <Routes><Route path="/protection/:positionId" element={<ProtectionDetailsPage apiClient={apiClient} />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'AVAX Protection' })).toBeVisible();
    expect(await screen.findByText('Live chart feed unavailable')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Order details' })).toBeVisible();
    expect(screen.getByText(/No price path has been invented/)).toBeVisible();
  });

  it('does not claim a failed, refunded request has protection or a price floor', async () => {
    const failedPosition = {
      ...protectedPosition,
      status: 'failed',
      paymentStatus: 'refunded',
      verifiedOnChain: false,
      executionState: 'failed',
      purchasedAt: null,
      explorerUrl: null,
    };
    const apiClient = {
      getPositionDetail: vi.fn().mockResolvedValue(failedPosition),
      getAssetCandles: vi.fn().mockResolvedValue({ candles: [] }),
    };
    render(
      <MemoryRouter initialEntries={['/protection/put-1']}>
        <Routes><Route path="/protection/:positionId" element={<ProtectionDetailsPage apiClient={apiClient} />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No protection became active. Execution failed and the held funds were refunded.')).toBeVisible();
    const meaningSection = screen.getByRole('heading', { name: 'What this means for you' }).closest('.pd-meaning-card');
    expect(within(meaningSection).queryByText(/price floor/i)).not.toBeInTheDocument();
  });
});
