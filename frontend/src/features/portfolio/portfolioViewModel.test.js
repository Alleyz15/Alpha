import { describe, expect, it } from 'vitest';
import { buildPortfolioRows, formatUsdc, toProtectionDetailViewModel } from './portfolioViewModel.js';

describe('portfolio view model', () => {
  it('excludes USDC from protectable rows and never treats an upside call as protection', () => {
    const rows = buildPortfolioRows(
      [
        { asset: 'ETH', amount: 0.4, priceUsdc: 2400, valueUsdc: 960 },
        { asset: 'USDC', amount: 100, priceUsdc: 1, valueUsdc: 100 },
      ],
      [{ positionId: 'call-1', asset: 'ETH', role: 'upside', status: 'active', verifiedOnChain: true }],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe('ETH');
    expect(rows[0].protectionState).toBe('none');
    expect(rows[0].positionId).toBeNull();
  });

  it('labels an unverified active record as being set up, not protected', () => {
    const [row] = buildPortfolioRows(
      [{ asset: 'BTC', amount: 0.01, priceUsdc: 77_000, valueUsdc: 770 }],
      [{ positionId: 'put-1', asset: 'BTC', role: 'protection', status: 'active', verifiedOnChain: false, expiry: '2026-09-05T00:00:00Z' }],
    );

    expect(row.protectionLabel).toBe('Being set up');
    expect(row.positionId).toBe('put-1');
  });

  it('preserves unavailable prices instead of displaying zero', () => {
    expect(formatUsdc(null)).toBe('—');
    expect(formatUsdc(0)).toBe('$0.00 USDC');
  });
});

describe('protection detail view model', () => {
  it('shows operator purchases as no payment and keeps a missing entry price missing', () => {
    const detail = toProtectionDetailViewModel({
      asset: 'ETH', role: 'protection', protectedAmount: 0.4,
      protectionFloorUsdc: 2200, upsideThresholdUsdc: null,
      entryPriceUsdc: null, status: 'active', expiry: '2026-09-05T00:00:00Z',
      paymentStatus: 'none', orderId: null, createdAt: '2026-09-01T00:00:00Z',
      buyer: { displayName: 'Demo User' }, account: { walletAddress: null },
      order: { settlementType: 'automatic_at_expiry', paymentMethod: 'operator_no_user_payment' },
      timeline: [],
    });

    expect(detail.premium.value).toBe('No payment');
    expect(detail.entryPriceLabel).toBe('—');
    expect(detail.orderIdLabel).toBe('—');
    expect(detail.paymentMethodLabel).toBe('Operator purchase — no user payment');
  });
});
