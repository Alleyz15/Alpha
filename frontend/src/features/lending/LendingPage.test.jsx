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
  // boundBy 'credit_limit' means the protection is the ceiling, so the
  // borrowable figure IS the limit. The two disagreeing would be impossible.
  borrowableNowUsdc: 257.237755,
  boundBy: 'credit_limit',
  walletUsdc: 300,
  walletShortfallUsdc: null,
  // Server-side constant. The client never sends it, but it is shown before
  // borrowing because it is the address repayment must come FROM.
  recipientAddress: '0xc169c7c000cAA28807Ab2585D707C7A6457d718E',
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

  // ---------------------------------------------------------------------
  // Recovering a repayment that is already in flight.
  // ---------------------------------------------------------------------
  //
  // The transfer instruction lives only in `repayFlows`, which is in-memory.
  // A refresh empties it, and the loan is by then `repaying` rather than
  // `active` - so the old gate hid both the instruction AND the button that
  // could bring it back. In real use that left an empty action cell and the
  // only way out was calling the API by hand.

  const repayingLoan = {
    ...activeLoan,
    status: 'repaying',
    repaymentExpectedUsdc: 5.000547,
    repaymentRequestedAt: '2026-09-03T19:48:36Z',
  };

  const fixedTransfer = {
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    tokenSymbol: 'USDC',
    from: '0xc169c7c000cAA28807Ab2585D707C7A6457d718E',
    to: '0x4fB77837bf2A0B86D167627Ded2E894f92F15127',
    amountUsdc: 5.000547,
    amountRaw: '5000547',
  };

  it('a repaying loan can recover its instruction after the page state is lost', async () => {
    // No repayFlows entry - exactly what a refresh leaves behind.
    const user = userEvent.setup();
    const client = apiClient({
      getLoans: vi.fn().mockResolvedValue({ loans: [repayingLoan] }),
      postRepaymentRequest: vi.fn().mockResolvedValue({
        loan: repayingLoan, transfer: fixedTransfer, alreadyFixed: true,
      }),
    });
    renderLending(client);

    const button = await screen.findByRole('button', { name: 'View repayment instructions' });
    expect(button).toBeVisible();
    expect(screen.queryByText('Send exactly')).toBeNull();

    await user.click(button);

    expect(client.postRepaymentRequest).toHaveBeenCalledWith('loan-1');
    expect(await screen.findByText('Send exactly')).toBeVisible();
    expect(await screen.findByLabelText('Your transaction hash')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit repayment' })).toBeVisible();
  });

  it('shows all four transfer fields, with the source address present', async () => {
    // `from` and `token` were missing. A transfer correct in every other
    // respect but sent from the wrong address is refused by the backend, so
    // the address the user must send FROM is the one field they cannot guess.
    const user = userEvent.setup();
    const client = apiClient({
      getLoans: vi.fn().mockResolvedValue({ loans: [repayingLoan] }),
      postRepaymentRequest: vi.fn().mockResolvedValue({
        loan: repayingLoan, transfer: fixedTransfer, alreadyFixed: true,
      }),
    });
    renderLending(client);

    await user.click(await screen.findByRole('button', { name: 'View repayment instructions' }));

    expect(await screen.findByText('From this address')).toBeVisible();
    expect(screen.getByText('Token')).toBeVisible();
    expect(screen.getByText(fixedTransfer.from)).toBeVisible();
    expect(screen.getByText(fixedTransfer.to)).toBeVisible();
    expect(screen.getByText(fixedTransfer.token)).toBeVisible();
    // Addresses are for copying: they must appear whole, not truncated.
    expect(screen.getByText(fixedTransfer.from).textContent).toBe(fixedTransfer.from);
  });

  it('says the transfer must come from that address, not from "your own wallet"', async () => {
    // The old copy read "Send this from your own wallet", which has no
    // direction at all when the user controls more than one address.
    const user = userEvent.setup();
    const client = apiClient({
      getLoans: vi.fn().mockResolvedValue({ loans: [repayingLoan] }),
      postRepaymentRequest: vi.fn().mockResolvedValue({
        loan: repayingLoan, transfer: fixedTransfer, alreadyFixed: true,
      }),
    });
    renderLending(client);

    await user.click(await screen.findByRole('button', { name: 'View repayment instructions' }));

    expect(await screen.findByText(/It must come from the address above/)).toBeVisible();
    expect(screen.getByText(/will not be accepted/)).toBeVisible();
    expect(screen.queryByText(/from your own wallet/)).toBeNull();
  });

  it('a failed request offers a retry rather than dead-ending', async () => {
    // Once repayFlows has an entry the row's own button is hidden, so a
    // failure with no retry is the same trap in a different place.
    const user = userEvent.setup();
    const postRepaymentRequest = vi.fn()
      .mockRejectedValueOnce(new Error('The service could not complete this request.'))
      .mockResolvedValueOnce({ loan: repayingLoan, transfer: fixedTransfer, alreadyFixed: true });

    const client = apiClient({
      getLoans: vi.fn().mockResolvedValue({ loans: [repayingLoan] }),
      postRepaymentRequest,
    });
    renderLending(client);

    await user.click(await screen.findByRole('button', { name: 'View repayment instructions' }));
    expect(await screen.findByText('Could not start repayment')).toBeVisible();

    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry).toBeVisible();
    await user.click(retry);

    expect(postRepaymentRequest).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Send exactly')).toBeVisible();
  });

  // ---------------------------------------------------------------------
  // On-chain evidence in the loan list.
  // ---------------------------------------------------------------------
  //
  // Disbursement and repayment are two separate transactions. Showing the
  // status alone asks the reader to take our word for it; the links let them
  // check both halves on BaseScan.

  it('links the disbursement and the repayment separately', async () => {
    const repaid = {
      ...activeLoan,
      status: 'repaid',
      repaymentExpectedUsdc: 5.000547,
      repaymentTx: '0xecdc6816',
      repaymentUrl: 'https://basescan.org/tx/0xecdc6816',
    };
    renderLending(apiClient({ getLoans: vi.fn().mockResolvedValue({ loans: [repaid] }) }));

    const borrowed = await screen.findByRole('link', { name: 'View the borrowing transaction on BaseScan' });
    const repaidLink = screen.getByRole('link', { name: 'View the repayment transaction on BaseScan' });

    // Two different transactions, so two different destinations.
    expect(borrowed).toHaveAttribute('href', 'https://basescan.org/tx/0xabc');
    expect(repaidLink).toHaveAttribute('href', 'https://basescan.org/tx/0xecdc6816');
    expect(borrowed.getAttribute('href')).not.toBe(repaidLink.getAttribute('href'));

    expect(borrowed).toHaveTextContent('Borrowed');
    expect(repaidLink).toHaveTextContent('Repaid');
    // Opening BaseScan must not navigate the app away from the loan list.
    expect(borrowed).toHaveAttribute('target', '_blank');
    expect(borrowed).toHaveAttribute('rel', 'noreferrer');
  });

  it('shows only the disbursement link while there is no repayment yet', async () => {
    // activeLoan has repaymentUrl: null. A link to a transaction that does not
    // exist is worse than no link - it reads as a claim that it happened.
    renderLending(apiClient({ getLoans: vi.fn().mockResolvedValue({ loans: [activeLoan] }) }));

    expect(await screen.findByRole('link', { name: 'View the borrowing transaction on BaseScan' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'View the repayment transaction on BaseScan' })).toBeNull();
  });

  it('shows a dash, not an empty cell, when a loan has no transaction yet', async () => {
    // A row written before the transfer is broadcast (BR-14) carries neither
    // hash. An empty cell cannot be told apart from a cell that failed to
    // render; a dash says "nothing here yet" on purpose.
    const pending = { ...activeLoan, disbursementTx: null, disbursementUrl: null };
    renderLending(apiClient({ getLoans: vi.fn().mockResolvedValue({ loans: [pending] }) }));

    expect(await screen.findByText('On chain')).toBeVisible();
    expect(screen.queryByRole('link', { name: /transaction on BaseScan/ })).toBeNull();

    // Located by its header rather than a fixed index, so adding a column
    // does not silently point this assertion at a different cell.
    const table = screen.getByText('On chain').closest('table');
    const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    const cell = table.querySelectorAll('tbody tr')[0].querySelectorAll('td')[headers.indexOf('On chain')];
    expect(cell.textContent).toBe('—');
  });

  // ---------------------------------------------------------------------
  // What the borrow form promises.
  // ---------------------------------------------------------------------

  const walletBound = {
    ...offer,
    boundBy: 'wallet',
    walletUsdc: 55.686223,
    borrowableNowUsdc: 55.686223,
    walletShortfallUsdc: 201.551532,
  };

  async function openBorrowForm(client) {
    const user = userEvent.setup();
    renderLending(client);
    await user.click(await screen.findByRole('button', { name: 'Use as collateral' }));
    return user;
  }

  it('caps the amount at what can be funded today, not at the credit limit', async () => {
    // The alert above the field already says we can only fund 55.69 of a
    // 257.24 limit. A field offering 257.24 contradicts it and hands the user
    // an amount that fails on submit.
    await openBorrowForm(apiClient({ getLoanOffer: vi.fn().mockResolvedValue(walletBound) }));

    const input = await screen.findByLabelText(/Amount to borrow/);
    expect(input).toHaveAttribute('max', '55.686223');
    // Both numbers are present, and it is clear which one is today's.
    expect(screen.getByText(/Up to \$55\.69 USDC today/)).toBeVisible();
    expect(screen.getByText(/your limit is \$257\.24 USDC/)).toBeVisible();
  });

  it('refuses an amount above what we can fund, and says why', async () => {
    // `max` on a number input does not stop anyone typing past it, so the gate
    // has to be the submit condition. Gating on the credit limit let an amount
    // through that the backend refuses with INSUFFICIENT_FLOAT.
    const user = await openBorrowForm(apiClient({ getLoanOffer: vi.fn().mockResolvedValue(walletBound) }));
    await user.type(await screen.findByLabelText(/Amount to borrow/), '100');

    expect(await screen.findByText('More than we can send today')).toBeVisible();
    expect(screen.getByText(/The most we can send right now is \$55\.69 USDC/)).toBeVisible();
    expect(screen.getByText(/not your credit limit/)).toBeVisible();
    expect(screen.getByRole('button', { name: /^Borrow 100 USDC/ })).toBeDisabled();
  });

  it('allows an amount inside the fundable ceiling', async () => {
    const user = await openBorrowForm(apiClient({ getLoanOffer: vi.fn().mockResolvedValue(walletBound) }));
    await user.type(await screen.findByLabelText(/Amount to borrow/), '50');

    expect(screen.queryByText('More than we can send today')).toBeNull();
    expect(screen.getByRole('button', { name: /^Borrow 50 USDC/ })).toBeEnabled();
  });

  it('shows one figure when the protection, not our float, is the ceiling', async () => {
    await openBorrowForm(apiClient());

    const input = await screen.findByLabelText(/Amount to borrow/);
    expect(input).toHaveAttribute('max', '257.237755');
    expect(screen.getByText('Up to $257.24 USDC')).toBeVisible();
    expect(screen.queryByText(/today/)).toBeNull();
  });

  it('names the payout address, and never calls it the wallet of the borrower', async () => {
    // Disbursement goes to a wallet the team controls. Calling it "you" cost a
    // real repayment: it was sent back from the wrong address and refused.
    await openBorrowForm(apiClient());

    expect(await screen.findByText(offer.recipientAddress)).toBeVisible();
    expect(screen.getByText(/held by the Alpha team, not by you/)).toBeVisible();
    expect(screen.getByText(/from that same/)).toBeVisible();
    expect(screen.queryByText(/operator wallet to you/)).toBeNull();
    expect(screen.queryByText(/your wallet/i)).toBeNull();
  });

  it('shows nothing owed on a repaid loan', async () => {
    // repaymentExpectedUsdc survives repayment as a record of what was quoted.
    // Reading it after settlement left a closed loan still asking for money.
    const repaid = { ...activeLoan, status: 'repaid', repaymentExpectedUsdc: 4.599411 };
    renderLending(apiClient({ getLoans: vi.fn().mockResolvedValue({ loans: [repaid] }) }));

    const row = (await screen.findByText('Repaid')).closest('tr');
    // Zero, not a dash: what is owed is known exactly, and it is nothing.
    expect(within(row).getByText('$0.00 USDC')).toBeVisible();
    expect(within(row).queryByText('$4.60 USDC')).toBeNull();
  });

  it('keeps showing the amount owed while a repayment is still unverified', async () => {
    // `repaying` is not settled - the transfer has been quoted, not verified.
    const repaying = { ...activeLoan, status: 'repaying', repaymentExpectedUsdc: 4.599411 };
    renderLending(apiClient({ getLoans: vi.fn().mockResolvedValue({ loans: [repaying] }) }));

    const row = (await screen.findByText('Repaying')).closest('tr');
    expect(within(row).getByText('$4.60 USDC')).toBeVisible();
  });

  // ---------------------------------------------------------------------
  // Which protection a loan is drawn against, and what it will cost.
  // ---------------------------------------------------------------------

  it('names the protection behind each loan and links to it', async () => {
    // The page is called "Borrow Against Your Protection" and the list showed
    // no sign of which protection. Two loans on two floors were identical.
    renderLending(apiClient({ getLoans: vi.fn().mockResolvedValue({ loans: [activeLoan] }) }));

    const link = await screen.findByRole('link', { name: 'ETH · $2,360.00 USDC floor' });
    expect(link).toHaveAttribute('href', '/protection/pos-1');
  });

  it('still links to the protection when the position is not in hand', async () => {
    // "Cannot name it" and "has no collateral" are different facts. The
    // protection page fetches by id, so the link works regardless.
    const orphan = { ...activeLoan, positionId: 'pos-gone' };
    renderLending(apiClient({ getLoans: vi.fn().mockResolvedValue({ loans: [orphan] }) }));

    const link = await screen.findByRole('link', { name: 'View protection' });
    expect(link).toHaveAttribute('href', '/protection/pos-gone');
  });

  it('shows what a typed amount would cost to repay, marked as an estimate', async () => {
    const user = await openBorrowForm(apiClient());
    await user.type(await screen.findByLabelText(/Amount to borrow/), '50');

    // 50 x 5%/yr x 0.8/365 = 0.005479...; ceil to 6dp -> 50.005480 -> $50.01
    expect(await screen.findByText(/50\.01 USDC/)).toBeVisible();
    expect(screen.getByText('5% a year')).toBeVisible();
    expect(screen.getByText(/An estimate/)).toBeVisible();
    expect(screen.getByText(/fixed when you borrow/)).toBeVisible();
  });

  it('shows no estimate until there is an amount to estimate', async () => {
    // An estimate of nothing is neither an estimate nor a fact.
    await openBorrowForm(apiClient());

    expect(await screen.findByLabelText(/Amount to borrow/)).toHaveValue(null);
    expect(screen.queryByText('You would repay')).toBeNull();
    expect(screen.queryByText(/An estimate/)).toBeNull();
  });
});
