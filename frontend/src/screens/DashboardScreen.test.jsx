import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toPositionViewModel } from '../adapters/quoteViewModel.js';
import DashboardScreen from './DashboardScreen.jsx';

describe('DashboardScreen position roles', () => {
  it('renders an upside position without protection-floor or protected wording', () => {
    const position = toPositionViewModel({
      positionId: 'upside-1',
      asset: 'ETH',
      protectedAmount: 1,
      role: 'upside',
      protectionFloorUsdc: null,
      upsideThresholdUsdc: 2680,
      expiry: '2026-09-04T08:00:00.000Z',
      premiumPaidUsdc: 4.5,
      status: 'active',
      payoutUsdc: null,
      fill: 'onchain',
      paymentStatus: 'none',
      explorerUrl: 'https://basescan.org/tx/0xabc',
    });

    render(
      <DashboardScreen
        positions={[position]}
        state="ready"
        isMock={false}
        reality={{ balance: 'simulated', quote: 'live', fill: 'operator', settlement: 'live' }}
        onExplore={vi.fn()}
      />,
    );

    expect(screen.getByText('Upside threshold')).toBeVisible();
    expect(screen.getByText('$2,680.00 USDC')).toBeVisible();
    expect(screen.getByText('1 ETH upside exposure active')).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Ethereum' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Verify on BaseScan' })).toHaveAttribute('href', 'https://basescan.org/tx/0xabc');
    expect(screen.queryByText('Protection floor')).not.toBeInTheDocument();
    expect(screen.queryByText('1 ETH protected')).not.toBeInTheDocument();
  });

  it('labels an operator request as requested and never exposes a BaseScan link', () => {
    const position = toPositionViewModel({
      positionId: 'pending-avax-1',
      asset: 'AVAX',
      protectedAmount: 2,
      role: 'protection',
      protectionFloorUsdc: 21,
      upsideThresholdUsdc: null,
      expiry: '2026-09-04T08:00:00.000Z',
      premiumPaidUsdc: 0.2,
      status: 'pending_fill',
      payoutUsdc: null,
      fill: 'operator',
      paymentStatus: 'held',
      explorerUrl: null,
    });

    render(
      <DashboardScreen
        positions={[position]}
        state="ready"
        isMock={false}
        reality={{ balance: 'simulated', quote: 'live', fill: 'operator', settlement: 'live' }}
        onExplore={vi.fn()}
      />,
    );

    expect(screen.getByText('2 AVAX protection requested')).toBeVisible();
    expect(screen.getByText('Funds held')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Avalanche' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Verify on BaseScan' })).not.toBeInTheDocument();
  });

  it('describes a refunded failure as finished instead of waiting for execution', () => {
    const position = toPositionViewModel({
      positionId: 'failed-refunded-1', asset: 'ETH', protectedAmount: 0.02,
      role: 'protection', protectionFloorUsdc: 2320, upsideThresholdUsdc: null,
      expiry: '2026-09-04T08:00:00.000Z', premiumPaidUsdc: 0,
      status: 'failed', payoutUsdc: null, fill: 'operator', paymentStatus: 'refunded', explorerUrl: null,
    });

    render(<DashboardScreen positions={[position]} state="ready" isMock={false} reality={{ fill: 'operator' }} onExplore={vi.fn()} />);

    expect(screen.getByText('Execution failed · funds refunded')).toBeVisible();
    expect(screen.queryByText(/Waiting for the app’s operator/i)).not.toBeInTheDocument();
  });

  it('describes an unrefunded failure without claiming a refund', () => {
    const position = toPositionViewModel({
      positionId: 'failed-held-1', asset: 'ETH', protectedAmount: 0.02,
      role: 'protection', protectionFloorUsdc: 2320, upsideThresholdUsdc: null,
      expiry: '2026-09-04T08:00:00.000Z', premiumPaidUsdc: 0,
      status: 'failed', payoutUsdc: null, fill: 'operator', paymentStatus: 'held', explorerUrl: null,
    });

    render(<DashboardScreen positions={[position]} state="ready" isMock={false} reality={{ fill: 'operator' }} onExplore={vi.fn()} />);

    expect(screen.getByText('Execution failed')).toBeVisible();
    expect(screen.queryByText(/funds refunded/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting for the app’s operator/i)).not.toBeInTheDocument();
  });
});
