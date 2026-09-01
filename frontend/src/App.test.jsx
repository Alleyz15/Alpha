import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const liveApi = vi.hoisted(() => ({
  getDemoContext: vi.fn(),
  getMarketContext: vi.fn(),
  getPositions: vi.fn(),
  createQuote: vi.fn(),
  purchaseQuote: vi.fn(),
}));

vi.mock('./api/client.js', () => ({ liveApi }));

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

describe('application routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    liveApi.getMarketContext.mockResolvedValue(marketContext);
    liveApi.getDemoContext.mockResolvedValue(demoContext);
    liveApi.getPositions.mockResolvedValue({ positions: [] });
  });

  it('opens /dashboard directly on the live position list instead of Legacy Explore', async () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Protection and upside' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: /Build your protection/i })).not.toBeInTheDocument();
    expect(liveApi.getPositions).toHaveBeenCalledTimes(1);
  });

  it('navigates from the selected Welcome asset into its protection flow without a reload', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

    await screen.findAllByText('$77,487.38 USDC');
    await user.click(screen.getByRole('tab', { name: 'ETH' }));
    await user.click(screen.getAllByRole('button', { name: 'Protect ETH' })[0]);

    expect(await screen.findByRole('heading', { name: 'Buy protection for Ethereum' })).toBeVisible();
  });

  it('navigates from Welcome to My protection', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: 'My protection' }));

    expect(await screen.findByRole('heading', { name: 'Protection and upside' })).toBeVisible();
    expect(liveApi.getPositions).toHaveBeenCalledTimes(1);
  });
});
