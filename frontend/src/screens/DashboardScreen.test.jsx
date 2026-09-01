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
    expect(screen.getByText('Not charged to demo balance')).toBeVisible();
    expect(screen.queryByText('Protection floor')).not.toBeInTheDocument();
    expect(screen.queryByText('1 ETH protected')).not.toBeInTheDocument();
  });
});
