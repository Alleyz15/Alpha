import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VaultPage from './VaultPage.jsx';

const portfolio = {
  totalValueUsdc: 1830,
  totalValueComplete: true,
  simulated: true,
  holdings: [
    { asset: 'USDC', amount: 246.46, priceUsdc: 1, valueUsdc: 246.46 },
  ],
};

function apiClient(overrides = {}) {
  return {
    getPortfolio: vi.fn().mockResolvedValue(portfolio),
    getPositions: vi.fn().mockResolvedValue({ positions: [] }),
    getVaults: vi.fn().mockResolvedValue({ vaults: [] }),
    ...overrides,
  };
}

describe('VaultPage', () => {
  it('loads the portfolio and positions, then renders the vault deposits section', async () => {
    const client = apiClient();
    render(<VaultPage apiClient={client} />);

    expect(await screen.findByRole('heading', { name: 'Principal-Protected Vault' })).toBeVisible();
    expect(await screen.findByText("You haven't made any vault deposits yet")).toBeVisible();
    expect(client.getPortfolio).toHaveBeenCalledTimes(1);
    expect(client.getPositions).toHaveBeenCalledTimes(1);
  });

  it('shows an honest error state and can retry when the backend fails', async () => {
    const client = apiClient({ getPortfolio: vi.fn().mockRejectedValue(new Error('offline')) });
    render(<VaultPage apiClient={client} />);

    expect(await screen.findByText('Vault could not be loaded')).toBeVisible();
    expect(screen.getByText('offline')).toBeVisible();
  });
});
