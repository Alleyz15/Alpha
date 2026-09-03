import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PortfolioPage from './PortfolioPage.jsx';
import ProtectionDetailsPage from './ProtectionDetailsPage.jsx';
import DashboardPage from '../dashboard/DashboardPage.jsx';

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
  it('shows truthful buy and history actions and excludes cash from protection rows', async () => {
    const user = userEvent.setup();
    const secondProtection = {
      ...protectedPosition,
      positionId: 'put-2',
      protectionFloorUsdc: 69_000,
    };
    const upsidePosition = {
      ...protectedPosition,
      positionId: 'call-1',
      role: 'upside',
      optionType: 'call',
      protectionFloorUsdc: null,
      upsideThresholdUsdc: 80_000,
    };
    const failedPosition = {
      ...protectedPosition,
      positionId: 'failed-1',
      status: 'failed',
      paymentStatus: 'refunded',
      verifiedOnChain: false,
    };
    const completedPosition = {
      ...protectedPosition,
      positionId: 'ccdcbf28',
      status: 'expired_worthless',
      paymentStatus: 'none',
      premiumPaidUsdc: null,
    };
    const positions = [failedPosition, completedPosition, protectedPosition, secondProtection, upsidePosition];
    const apiClient = {
      getPortfolio: vi.fn().mockResolvedValue(portfolio),
      getPositions: vi.fn().mockResolvedValue({ positions }),
      getDemoContext: vi.fn().mockResolvedValue({ reality: { fill: 'operator' } }),
      getVaults: vi.fn().mockResolvedValue({ vaults: [] }),
      getLoans: vi.fn().mockResolvedValue({ loans: [] }),
    };
    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <Routes>
          <Route path="/portfolio" element={<PortfolioPage apiClient={apiClient} />} />
          <Route path="/markets" element={<div>Opened Home</div>} />
          <Route path="/positions/:symbol" element={<DashboardPage apiClient={apiClient} assetFilter="BTC" />} />
          <Route path="/protection/:positionId" element={<div>Opened protection</div>} />
          <Route path="/protect/:symbol" element={<div>Opened checkout</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const table = await screen.findByRole('table');
    const summary = screen.getByRole('region', { name: 'Portfolio summary' });
    expect(within(summary).getByText('Next protection end')).toBeVisible();
    expect(within(summary).getByText('5 Sept 2026')).toBeVisible();
    expect(screen.queryByPlaceholderText('Search your holdings')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to Alpha Welcome' })).not.toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).queryByText('USDC')).not.toBeInTheDocument();
    expect(within(table).getAllByRole('button')).toHaveLength(3);
    expect(within(table).getByText('Protected · 2 positions')).toBeVisible();
    expect(within(table).getByRole('button', { name: /View history/ })).toBeVisible();
    expect(within(table).getAllByRole('button', { name: 'Buy protection' })).toHaveLength(2);
    expect(screen.getByText(/Open an asset to see its complete history, including settled and failed requests/)).toBeVisible();

    await user.click(within(table).getByRole('button', { name: /View history/ }));
    expect(await screen.findByRole('heading', { name: 'Recorded positions' })).toBeVisible();
    expect(screen.getByText('5 positions')).toBeVisible();
    expect(screen.getByText('Not needed')).toBeVisible();
    expect(screen.getByText('Failed')).toBeVisible();
    expect(screen.getByText('No user payment')).toBeVisible();

    const cards = screen.getAllByRole('article').map((card) => card.textContent);
    expect(cards.findIndex((text) => text.includes('Not needed')))
      .toBeGreaterThan(cards.findLastIndex((text) => text.includes('Active')));
    expect(cards.findIndex((text) => text.includes('Failed')))
      .toBeGreaterThan(cards.findIndex((text) => text.includes('Not needed')));
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
    expect(screen.getByText('Automatic on the end date')).toBeVisible();
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

function vaultApiClient(overrides = {}) {
  return {
    getPortfolio: vi.fn().mockResolvedValue(portfolio),
    getPositions: vi.fn().mockResolvedValue({ positions: [] }),
    getDemoContext: vi.fn().mockResolvedValue({ reality: { fill: 'operator' } }),
    getVaults: vi.fn().mockResolvedValue({ vaults: [] }),
    getLoans: vi.fn().mockResolvedValue({ loans: [] }),
    getDepositPreflight: vi.fn(),
    postVaultDeposit: vi.fn(),
    ...overrides,
  };
}

function renderPortfolio(apiClient) {
  return render(
    <MemoryRouter initialEntries={['/portfolio']}>
      <Routes>
        <Route path="/portfolio" element={<PortfolioPage apiClient={apiClient} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const depositPreview = {
  asset: 'ETH',
  principalUsdc: 5,
  yieldPortionUsdc: 4.9,
  optionPortionUsdc: 0.1,
  yieldIsSimulated: true,
  participationPct: 22.5,
  exposureUsdc: 1.1,
  spotUsdc: 2400,
  upsideThresholdUsdc: 2580,
  maturity: '2026-09-06T08:00:00Z',
  daysToMaturity: 2.8,
  premiumPerContractUsdc: 3.6,
  contracts: 0.0003,
  pass: true,
  checks: [],
  availableUsdc: 100,
  affordable: true,
  wouldSend: true,
  sent: false,
};

describe('Vault Deposits section', () => {
  it("shows an empty state with a New Deposit action when there are no vault deposits", async () => {
    const apiClient = vaultApiClient();
    renderPortfolio(apiClient);

    expect(await screen.findByText("You haven't made any vault deposits yet")).toBeVisible();
    expect(screen.getByRole('button', { name: '+ New Deposit' })).toBeVisible();
  });

  it('lists existing vaults joined with their backing position asset', async () => {
    const apiClient = vaultApiClient({
      getPositions: vi.fn().mockResolvedValue({
        positions: [{ positionId: 'call-1', asset: 'ETH', role: 'upside' }],
      }),
      getVaults: vi.fn().mockResolvedValue({
        vaults: [{
          vaultId: 'vault-1', positionId: 'call-1', status: 'active',
          principalUsdc: 3, participationPct: 27.8451, maturity: '2026-09-06T08:00:00Z',
        }],
      }),
    });
    renderPortfolio(apiClient);

    const section = await screen.findByRole('region', { name: 'Vault deposits' });
    expect(await within(section).findByText('Ethereum')).toBeVisible();
    expect(within(section).getByText('$3.00 USDC')).toBeVisible();
    expect(within(section).getByText('27.85%')).toBeVisible();
    expect(within(section).getByText('Active')).toBeVisible();
    expect(screen.getByRole('button', { name: '+ New Deposit' })).toBeVisible();
  });

  it('disables Preview until a positive amount is entered, defaulting the asset to ETH', async () => {
    const user = userEvent.setup();
    const apiClient = vaultApiClient();
    renderPortfolio(apiClient);

    await user.click(await screen.findByRole('button', { name: '+ New Deposit' }));

    expect(screen.getByLabelText('Asset')).toHaveTextContent('Ethereum (ETH)');
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();

    await user.type(screen.getByLabelText('Principal amount (USDC)'), '5');
    expect(screen.getByRole('button', { name: 'Preview' })).toBeEnabled();
  });

  it('shows the preview breakdown and a Confirm Deposit action on a passing preview', async () => {
    const user = userEvent.setup();
    const apiClient = vaultApiClient({
      getDepositPreflight: vi.fn().mockResolvedValue(depositPreview),
    });
    renderPortfolio(apiClient);

    await user.click(await screen.findByRole('button', { name: '+ New Deposit' }));
    await user.type(screen.getByLabelText('Principal amount (USDC)'), '5');
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(apiClient.getDepositPreflight).toHaveBeenCalledWith('ETH', 5);
    expect(await screen.findByText('22.5%')).toBeVisible();
    expect(screen.getByText('$1.10 USDC')).toBeVisible();
    expect(screen.getByText('$2,580.00 USDC')).toBeVisible();
    expect(screen.getByText('$4.90 USDC')).toBeVisible();
    expect(screen.getByText('$0.10 USDC')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirm Deposit' })).toBeVisible();
  });

  it('shows an asset-specific message on NO_BUYABLE_CALLS and keeps the form editable', async () => {
    const user = userEvent.setup();
    const noBuyable = Object.assign(new Error('no calls'), { payload: { error: { code: 'NO_BUYABLE_CALLS' } } });
    const apiClient = vaultApiClient({
      getDepositPreflight: vi.fn().mockRejectedValue(noBuyable),
    });
    renderPortfolio(apiClient);

    await user.click(await screen.findByRole('button', { name: '+ New Deposit' }));
    await user.type(screen.getByLabelText('Principal amount (USDC)'), '5');
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('ETH has no available upside options right now — try a different asset')).toBeVisible();
    expect(screen.getByLabelText('Asset')).toBeEnabled();
    expect(screen.getByLabelText('Principal amount (USDC)')).toHaveValue(5);
    expect(screen.queryByRole('button', { name: 'Confirm Deposit' })).not.toBeInTheDocument();
  });

  it('shows a generic message on any other preview error without clearing the form', async () => {
    const user = userEvent.setup();
    const apiClient = vaultApiClient({
      getDepositPreflight: vi.fn().mockRejectedValue(new Error('offline')),
    });
    renderPortfolio(apiClient);

    await user.click(await screen.findByRole('button', { name: '+ New Deposit' }));
    await user.type(screen.getByLabelText('Principal amount (USDC)'), '5');
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('Something went wrong previewing this deposit, please try again')).toBeVisible();
    expect(screen.getByLabelText('Principal amount (USDC)')).toHaveValue(5);
  });

  it('clears a stale successful preview when the input changes', async () => {
    const user = userEvent.setup();
    const apiClient = vaultApiClient({
      getDepositPreflight: vi.fn().mockResolvedValue(depositPreview),
    });
    renderPortfolio(apiClient);

    await user.click(await screen.findByRole('button', { name: '+ New Deposit' }));
    await user.type(screen.getByLabelText('Principal amount (USDC)'), '5');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('button', { name: 'Confirm Deposit' })).toBeVisible();

    await user.type(screen.getByLabelText('Principal amount (USDC)'), '0');
    expect(screen.queryByRole('button', { name: 'Confirm Deposit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeVisible();
  });

  describe('confirming a deposit and polling for the result', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('polls GET /api/vault until the new deposit leaves pending, then stops', async () => {
      const user = userEvent.setup({ delay: null });
      const backingPosition = { positionId: 'call-9', asset: 'ETH', role: 'upside' };
      const pendingVault = {
        vaultId: 'vault-new', positionId: 'call-9', status: 'pending',
        principalUsdc: 5, participationPct: 20, maturity: '2026-09-10T00:00:00Z',
      };
      const activeVault = { ...pendingVault, status: 'active' };

      const getVaults = vi.fn()
        .mockResolvedValueOnce({ vaults: [] })
        .mockResolvedValueOnce({ vaults: [pendingVault] })
        .mockResolvedValue({ vaults: [activeVault] });
      const getPositions = vi.fn().mockResolvedValue({ positions: [backingPosition] });

      const apiClient = vaultApiClient({
        getVaults,
        getPositions,
        getDepositPreflight: vi.fn().mockResolvedValue(depositPreview),
        postVaultDeposit: vi.fn().mockResolvedValue({
          accepted: true, started: true, sent: null,
          depositJob: { state: 'running', startedAt: new Date().toISOString(), elapsedSeconds: 0, error: null },
          pollUrl: '/api/vault', expectedSeconds: 30,
        }),
      });
      renderPortfolio(apiClient);

      await user.click(await screen.findByRole('button', { name: '+ New Deposit' }));
      await user.type(screen.getByLabelText('Principal amount (USDC)'), '5');
      await user.click(screen.getByRole('button', { name: 'Preview' }));
      await screen.findByRole('button', { name: 'Confirm Deposit' });

      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Confirm Deposit' }));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(apiClient.postVaultDeposit).toHaveBeenCalledWith('ETH', 5);

      expect(await screen.findByText('Deposit submitted, processing…')).toBeVisible();
      const section = screen.getByRole('region', { name: 'Vault deposits' });
      expect(within(section).getByText('Pending')).toBeVisible();

      await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });

      expect(within(section).getByText('Active')).toBeVisible();
      expect(screen.queryByText('Deposit submitted, processing…')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '+ New Deposit' })).toBeVisible();
    });

    it('stops polling and shows a message after 60 seconds stuck pending', async () => {
      const user = userEvent.setup({ delay: null });
      const pendingVault = {
        vaultId: 'vault-stuck', positionId: null, status: 'pending',
        principalUsdc: 5, participationPct: 20, maturity: '2026-09-10T00:00:00Z',
      };

      const apiClient = vaultApiClient({
        getVaults: vi.fn().mockResolvedValue({ vaults: [pendingVault] }),
        getDepositPreflight: vi.fn().mockResolvedValue(depositPreview),
        postVaultDeposit: vi.fn().mockResolvedValue({
          accepted: true, started: true, sent: null,
          depositJob: { state: 'running', startedAt: new Date().toISOString(), elapsedSeconds: 0, error: null },
          pollUrl: '/api/vault', expectedSeconds: 30,
        }),
      });
      renderPortfolio(apiClient);

      await user.click(await screen.findByRole('button', { name: '+ New Deposit' }));
      await user.type(screen.getByLabelText('Principal amount (USDC)'), '5');
      await user.click(screen.getByRole('button', { name: 'Preview' }));
      await screen.findByRole('button', { name: 'Confirm Deposit' });
      await act(async () => {
        await user.click(screen.getByRole('button', { name: 'Confirm Deposit' }));
        await vi.advanceTimersByTimeAsync(0);
      });

      await act(async () => { await vi.advanceTimersByTimeAsync(64_000); });

      expect(await screen.findByText('This is taking longer than expected, refresh to check status')).toBeVisible();
    });
  });
});

// ---------------------------------------------------------------------------
// The lending entry on the portfolio.
// ---------------------------------------------------------------------------
//
// /lending had nothing linking to it: the only ways in were a card near the
// bottom of the welcome page or typing the URL. This card is an entry point
// carrying two real figures - it is deliberately NOT a second lending UI.

const openLoan = {
  loanId: 'loan-1',
  status: 'active',
  principalUsdc: 5,
  repaymentExpectedUsdc: null,
  owed: { principalUsdc: 5, interestUsdc: 0.000547, totalUsdc: 5.000547 },
};

describe('Lending entry card', () => {
  it('links to /lending and shows the open loan count and outstanding total', async () => {
    const apiClient = vaultApiClient({
      getLoans: vi.fn().mockResolvedValue({
        loans: [
          openLoan,
          { ...openLoan, loanId: 'loan-2', status: 'repaying', repaymentExpectedUsdc: 2.5 },
          // Closed loans are neither counted nor owed.
          { ...openLoan, loanId: 'loan-3', status: 'repaid' },
        ],
      }),
    });
    renderPortfolio(apiClient);

    const link = await screen.findByRole('link', { name: 'Open Lending' });
    expect(link).toHaveAttribute('href', '/lending');

    // The link renders before the loans request resolves, so the figures have
    // to be awaited - asserting on them straight after finding the link races
    // the fetch and passes or fails on timing.
    const card = link.closest('.lending-entry-card');
    expect(await within(card).findByText('2')).toBeVisible();
    expect(within(card).getByText('Active loans')).toBeVisible();
    // 5.000547 live + 2.5 fixed = 7.500547, rendered by formatUsdc at 2dp.
    expect(within(card).getByText(/\$7\.50 USDC/)).toBeVisible();
  });

  it('prefers the fixed repayment figure over the live owed total', async () => {
    // Once a borrower has been quoted a number, that number is what binds.
    const apiClient = vaultApiClient({
      getLoans: vi.fn().mockResolvedValue({
        loans: [{ ...openLoan, repaymentExpectedUsdc: 9.999999 }],
      }),
    });
    renderPortfolio(apiClient);

    const card = (await screen.findByRole('link', { name: 'Open Lending' })).closest('.lending-entry-card');
    expect(await within(card).findByText(/\$10\.00 USDC/)).toBeVisible();
    expect(within(card).queryByText(/\$5\.00 USDC/)).toBeNull();
  });

  it('withholds the total when a loan could not be priced, but still counts it', async () => {
    // A total that silently drops a loan reads as the whole debt and is
    // smaller than it. The count does not need the figure, so it stays exact.
    const apiClient = vaultApiClient({
      getLoans: vi.fn().mockResolvedValue({
        loans: [openLoan, { ...openLoan, loanId: 'loan-2', repaymentExpectedUsdc: null, owed: null }],
      }),
    });
    renderPortfolio(apiClient);

    const card = (await screen.findByRole('link', { name: 'Open Lending' })).closest('.lending-entry-card');
    expect(await within(card).findByText(/could not be priced/)).toBeVisible();
    expect(within(card).getByText('2')).toBeVisible();
    expect(within(card).queryByText(/\$5\.00 USDC/)).toBeNull();
  });

  it('still offers the link when the loans request fails', async () => {
    // Hiding the entry because a number failed would remove the only route to
    // the page that could explain the failure.
    const apiClient = vaultApiClient({
      getLoans: vi.fn().mockRejectedValue(new Error('backend down')),
    });
    renderPortfolio(apiClient);

    const link = await screen.findByRole('link', { name: 'Open Lending' });
    expect(link).toHaveAttribute('href', '/lending');
    expect(await screen.findByText(/Loan figures could not be loaded/)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// The USDC balance on the portfolio.
// ---------------------------------------------------------------------------
//
// The balance existed only as a hint inside the vault deposit form, so the
// answer to "have I got anything to deposit?" sat behind the button that asks
// you to deposit. It is now a stat card, reading the same holdings the vault
// section reads - one request, one number, no chance of the two disagreeing.

describe('USDC available card', () => {
  it('shows the USDC holding from the portfolio, with its logo', async () => {
    const apiClient = vaultApiClient();
    renderPortfolio(apiClient);

    const label = await screen.findByText('USDC available');
    const card = label.closest('.portfolio-stat-card');

    // The fixture holds 100 USDC.
    expect(within(card).getByText(/\$100\.00 USDC/)).toBeVisible();

    // A real image, not AssetLogo's initial-letter fallback.
    const logo = within(card).getByRole('img', { name: 'USD Coin' });
    expect(logo.tagName).toBe('IMG');
    expect(logo).toHaveAttribute('src', '/assets/coins/usdc.svg');

    // No extra request: the portfolio call already carries it.
    expect(apiClient.getPortfolio).toHaveBeenCalledTimes(1);
  });

  it('says what the balance is for, and that it is simulated', async () => {
    // "Available" rather than "balance": this card answers a different
    // question from Portfolio value above it - what can I move, not what do I
    // own - which is also why the two figures overlapping is not confusing.
    renderPortfolio(vaultApiClient());

    const card = (await screen.findByText('USDC available')).closest('.portfolio-stat-card');
    expect(within(card).getByText(/Ready to deposit into the vault/)).toBeVisible();
    expect(within(card).getByText(/simulated balance/)).toBeVisible();
  });

  it('shows a dash rather than zero when there is no USDC holding', async () => {
    // Zero is a real balance and would read as "you have nothing". A missing
    // holding is not the same fact, and must not be rendered as one.
    const apiClient = vaultApiClient({
      getPortfolio: vi.fn().mockResolvedValue({
        ...portfolio,
        holdings: portfolio.holdings.filter((h) => h.asset !== 'USDC'),
      }),
    });
    renderPortfolio(apiClient);

    const card = (await screen.findByText('USDC available')).closest('.portfolio-stat-card');
    expect(within(card).getByText('—')).toBeVisible();
    expect(within(card).queryByText(/\$0\.00 USDC/)).toBeNull();
  });
});
