import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { toPositionViewModel } from '../adapters/quoteViewModel.js';
import DashboardScreen from './DashboardScreen.jsx';

// The cards link to /protection/:positionId, so every render needs a router.
function renderScreen(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

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

    renderScreen(
      <DashboardScreen
        positions={[position]}
        state="ready"
        isMock={false}
        reality={{ balance: 'simulated', quote: 'live', fill: 'operator', settlement: 'live' }}
      />,
    );

    expect(screen.getByText('Upside threshold')).toBeVisible();
    expect(screen.getByText('$2,680.00 USDC')).toBeVisible();
    expect(screen.getByText('1 ETH upside exposure active')).toBeVisible();
    expect(screen.getByText('No user payment')).toBeVisible();
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

    renderScreen(
      <DashboardScreen
        positions={[position]}
        state="ready"
        isMock={false}
        reality={{ balance: 'simulated', quote: 'live', fill: 'operator', settlement: 'live' }}
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

    renderScreen(<DashboardScreen positions={[position]} state="ready" isMock={false} reality={{ fill: 'operator' }} />);

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

    renderScreen(<DashboardScreen positions={[position]} state="ready" isMock={false} reality={{ fill: 'operator' }} />);

    expect(screen.getByText('Execution failed')).toBeVisible();
    expect(screen.queryByText(/funds refunded/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting for the app’s operator/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The way into a position's full record.
// ---------------------------------------------------------------------------
//
// /protection/:positionId holds the entry price, the order, and the event
// timeline with real timestamps. Nothing on this page linked to it, so those
// were unreachable from the only page that lists positions.

describe('PositionCard detail link', () => {
  function cardFor(overrides = {}) {
    return toPositionViewModel({
      positionId: 'efa8d071-444c-46f5-a0e6-8b7915f6c778',
      asset: 'ETH',
      protectedAmount: 0.001999,
      role: 'protection',
      protectionFloorUsdc: 2300,
      upsideThresholdUsdc: null,
      expiry: '2026-09-03T08:00:00.000Z',
      premiumPaidUsdc: 0.0766,
      status: 'expired_worthless',
      payoutUsdc: 0,
      fill: 'onchain',
      paymentStatus: 'paid',
      explorerUrl: 'https://basescan.org/tx/0x64e37010',
      ...overrides,
    });
  }

  it('links each card to that position, by id', () => {
    renderScreen(
      <DashboardScreen
        positions={[cardFor()]}
        state="ready"
        isMock={false}
        reality={{ fill: 'operator' }}
      />,
    );

    const link = screen.getByRole('link', { name: /View contract/ });
    expect(link).toHaveAttribute('href', '/protection/efa8d071-444c-46f5-a0e6-8b7915f6c778');
  });

  it('keeps the BaseScan link separate, going somewhere else entirely', () => {
    // This is why the card is not one big clickable region. Two independent
    // links sit in the same card: opening the transaction must not also
    // navigate into the detail page, and the only way to guarantee that
    // without stopPropagation on a shared component is to not nest them.
    renderScreen(
      <DashboardScreen
        positions={[cardFor()]}
        state="ready"
        isMock={false}
        reality={{ fill: 'operator' }}
      />,
    );

    const card = screen.getByRole('link', { name: /View contract/ }).closest('.position-card');
    const links = [...within(card).getAllByRole('link')];
    const hrefs = links.map((a) => a.getAttribute('href'));

    expect(links.length).toBe(2);
    expect(hrefs).toContain('/protection/efa8d071-444c-46f5-a0e6-8b7915f6c778');
    expect(hrefs).toContain('https://basescan.org/tx/0x64e37010');
    // Two destinations, never the same one twice.
    expect(new Set(hrefs).size).toBe(2);
    // And the card itself is not a link wrapping them.
    expect(card.tagName).not.toBe('A');
  });

  it('offers the link on a failed position too', () => {
    // Every status has something to show. A failed position keeps its
    // timeline, and that is where the reason it failed is recorded.
    renderScreen(
      <DashboardScreen
        positions={[cardFor({
          positionId: '910c0e0f-a4ab-4066-96b7-4a4a73793e8d',
          status: 'failed',
          paymentStatus: 'refunded',
          explorerUrl: null,
        })]}
        state="ready"
        isMock={false}
        reality={{ fill: 'operator' }}
      />,
    );

    expect(screen.getByRole('link', { name: /View contract/ }))
      .toHaveAttribute('href', '/protection/910c0e0f-a4ab-4066-96b7-4a4a73793e8d');
  });
});
