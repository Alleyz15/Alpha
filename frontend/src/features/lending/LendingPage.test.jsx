import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import LendingPage from './LendingPage.jsx';

const activePosition = {
  positionId: 'pos-1', asset: 'ETH', role: 'protection', optionType: 'put',
  status: 'active', verifiedOnChain: true, executionState: 'confirmed',
  protectionFloorUsdc: 2360, upsideThresholdUsdc: null, expiry: '2026-09-04T08:00:00Z',
};

const offer = {
  positionId: 'pos-1',
  protectionFloorUsdc: 2360,
  numContracts: 0.109011,
  protectedValueUsdc: 257.26596,
  interestReservedUsdc: 0.028205,
  creditLimitUsdc: 257.237755,
  annualRatePct: 5,
  termDays: 0.8,
  dueAt: '2026-09-04T08:00:00Z',
  borrowableNowUsdc: 55.686223,
  boundBy: 'credit_limit',
  walletUsdc: 300,
  walletShortfallUsdc: null,
  checks: [],
  sent: false,
};

const activeLoan = {
  loanId: 'loan-1', positionId: 'pos-1', status: 'active',
  principalUsdc: 5, creditLimitUsdc: 257.237755, annualRatePct: 5, collateralContracts: 0.109011,
  recipientAddress: '0xc169c7c0000000000000000000000000000000',
  createdAt: '2026-09-01T10:00:00Z', dueAt: '2026-09-04T08:00:00Z',
  disbursementTx: '0xabc', disbursementUrl: 'https://basescan.org/tx/0xabc',
  repaymentExpectedUsdc: null, repaymentRequestedAt: null, repaymentTx: null, repaymentUrl: null,
  owed: { principalUsdc: 5, interestUsdc: 0.002, totalUsdc: 5.002, termDays: 2, annualRatePct: 5 },
};

function apiClient(overrides = {}) {
  return {
    getPositions: vi.fn().mockResolvedValue({ positions: [activePosition] }),
    getLoans: vi.fn().mockResolvedValue({ loans: [] }),
    getLoanOffer: vi.fn().mockResolvedValue(offer),
    postLoan: vi.fn(),
    postRepaymentRequest: vi.fn(),
    postRepay: vi.fn(),
    ...overrides,
  };
}

function renderLending(client) {
  return render(
    <MemoryRouter initialEntries={['/lending']}>
      <Routes>
        <Route path="/lending" element={<LendingPage apiClient={client} />} />
        <Route path="/markets" element={<div>Opened Markets</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LendingPage', () => {
  it('shows an empty state pointing to /markets when there is no confirmed protection', async () => {
    const client = apiClient({ getPositions: vi.fn().mockResolvedValue({ positions: [] }) });
    renderLending(client);

    expect(await screen.findByText('No confirmed protection to borrow against yet')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Browse protection choices' })).toHaveAttribute('href', '/markets');
  });

  it('shows the offer equation and a successful borrow result', async () => {
    const user = userEvent.setup();
    const client = apiClient({
      postLoan: vi.fn().mockResolvedValue({
        loanId: 'loan-1', principalUsdc: 5, txHash: '0xdef', explorerUrl: 'https://basescan.org/tx/0xdef', sent: true,
      }),
    });
    renderLending(client);

    await user.click(await screen.findByRole('button', { name: 'Use as collateral' }));
    expect(client.getLoanOffer).toHaveBeenCalledWith('pos-1');
    expect(await screen.findByText('$257.24 USDC')).toBeVisible();

    await user.type(screen.getByLabelText('Amount to borrow (USDC)'), '5');
    await user.click(screen.getByRole('button', { name: /Borrow 5 USDC/ }));

    expect(client.postLoan).toHaveBeenCalledWith('pos-1', 5);
    expect(await screen.findByText('Loan disbursed')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View on BaseScan' })).toHaveAttribute('href', 'https://basescan.org/tx/0xdef');
  });

  it('shows the backend INSUFFICIENT_FLOAT message verbatim, framed as our limit not the user\'s', async () => {
    const user = userEvent.setup();
    const message = 'We cannot fund 5 USDC right now. This is our limit, not yours — your protection still supports 257.237755 USDC. The most we can send today is 55.686223 USDC.';
    const error = Object.assign(new Error(message), { payload: { error: { code: 'INSUFFICIENT_FLOAT' } } });
    const client = apiClient({ postLoan: vi.fn().mockRejectedValue(error) });
    renderLending(client);

    await user.click(await screen.findByRole('button', { name: 'Use as collateral' }));
    await screen.findByText('$257.24 USDC');
    await user.type(screen.getByLabelText('Amount to borrow (USDC)'), '5');
    await user.click(screen.getByRole('button', { name: /Borrow 5 USDC/ }));

    expect(await screen.findByText('Our funds are short right now — not your credit')).toBeVisible();
    expect(screen.getByText(message)).toBeVisible();
  });

  it('lists existing loans, preferring the fixed repaymentExpectedUsdc once set', async () => {
    const client = apiClient({
      getLoans: vi.fn().mockResolvedValue({
        loans: [{ ...activeLoan, repaymentExpectedUsdc: 5.05 }],
      }),
    });
    renderLending(client);

    expect(await screen.findByText('$5.00 USDC')).toBeVisible();
    expect(await screen.findByText('$5.05 USDC')).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start repayment' })).toBeVisible();
  });

  it('completes the two-step repayment flow', async () => {
    const user = userEvent.setup();
    const client = apiClient({
      getLoans: vi.fn().mockResolvedValue({ loans: [activeLoan] }),
      postRepaymentRequest: vi.fn().mockResolvedValue({
        loan: { ...activeLoan, status: 'repaying', repaymentExpectedUsdc: 5.002 },
        transfer: {
          token: '0x8335', tokenSymbol: 'USDC', from: '0xc169c7c0', to: '0x4fB77837',
          amountUsdc: 5.002, amountRaw: '5002000',
        },
        alreadyFixed: false,
      }),
      postRepay: vi.fn().mockResolvedValue({
        loan: { ...activeLoan, status: 'repaid', repaymentUrl: 'https://basescan.org/tx/0xrepay' },
        checks: [], repaid: true,
      }),
    });
    renderLending(client);

    await user.click(await screen.findByRole('button', { name: 'Start repayment' }));
    expect(client.postRepaymentRequest).toHaveBeenCalledWith('loan-1');
    expect(await screen.findByText('Send exactly')).toBeVisible();
    expect(await screen.findByLabelText('Your transaction hash')).toBeVisible();

    await user.type(screen.getByLabelText('Your transaction hash'), '0xrepaytxhash');
    await user.click(screen.getByRole('button', { name: 'Submit repayment' }));

    expect(client.postRepay).toHaveBeenCalledWith('loan-1', '0xrepaytxhash');
    expect(await screen.findByText('Repayment recorded')).toBeVisible();
  });

  it('shows which specific check failed on REPAYMENT_UNVERIFIED', async () => {
    const user = userEvent.setup();
    const unverified = Object.assign(new Error('That transaction does not settle this loan. Nothing was recorded.'), {
      payload: {
        error: {
          code: 'REPAYMENT_UNVERIFIED',
          details: { checks: [{ label: 'sent by the borrower to the lender', pass: false, detail: 'expected 0xc169c7c0 -> 0x4fB77837, not found' }] },
        },
      },
    });
    const client = apiClient({
      getLoans: vi.fn().mockResolvedValue({ loans: [activeLoan] }),
      postRepaymentRequest: vi.fn().mockResolvedValue({
        loan: { ...activeLoan, status: 'repaying' },
        transfer: { to: '0x4fB77837', amountUsdc: 5.002 },
        alreadyFixed: false,
      }),
      postRepay: vi.fn().mockRejectedValue(unverified),
    });
    renderLending(client);

    await user.click(await screen.findByRole('button', { name: 'Start repayment' }));
    await user.type(await screen.findByLabelText('Your transaction hash'), '0xwrong');
    await user.click(screen.getByRole('button', { name: 'Submit repayment' }));

    expect(await screen.findByText(/sent by the borrower to the lender/)).toBeVisible();
    expect(screen.getByText(/expected 0xc169c7c0 -> 0x4fB77837, not found/)).toBeVisible();
  });
});
