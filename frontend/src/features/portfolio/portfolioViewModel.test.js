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
    expect(formatUsdc(null)).toBeNull();
    expect(formatUsdc(0)).toBe('$0.00 USDC');
  });
});

describe('protection detail view model', () => {
  it('uses the shared no-payment presentation and keeps a missing entry price missing', () => {
    const detail = toProtectionDetailViewModel({
      asset: 'ETH', role: 'protection', protectedAmount: 0.4,
      protectionFloorUsdc: 2200, upsideThresholdUsdc: null,
      entryPriceUsdc: null, status: 'active', expiry: '2026-09-05T00:00:00Z',
      paymentStatus: 'none', orderId: null, createdAt: '2026-09-01T00:00:00Z',
      buyer: { displayName: 'Demo User' }, account: { walletAddress: null },
      order: { settlementType: 'automatic_at_expiry', paymentMethod: 'operator_no_user_payment' },
      timeline: [],
    });

    expect(detail.premium.value).toBe('—');
    expect(detail.entryPriceLabel).toBe('—');
    expect(detail.orderIdLabel).toBe('—');
    expect(detail.paymentMethodLabel).toBe('Operator purchase — no user payment');
  });

  it.each([
    ['paid', 12, '$12.00 USDC'],
    ['held', 12, 'Funds held'],
    ['refunded', 12, 'Refunded'],
    [null, 12, '—'],
  ])('uses the shared %s premium presentation', (paymentStatus, premiumPaidUsdc, expected) => {
    const detail = toProtectionDetailViewModel({
      asset: 'ETH', role: 'protection', protectedAmount: 0.4,
      protectionFloorUsdc: 2200, status: 'active', expiry: '2026-09-05T00:00:00Z',
      paymentStatus, premiumPaidUsdc, timeline: [],
    });

    expect(detail.premium.value).toBe(expected);
  });

  it('never claims a failed, refunded request has a price floor', () => {
    const detail = toProtectionDetailViewModel({
      asset: 'BTC', role: 'protection', protectedAmount: 0.01,
      protectionFloorUsdc: 76_500, status: 'failed', paymentStatus: 'refunded',
      expiry: '2026-09-05T00:00:00Z', timeline: [],
    });

    expect(detail.meaning).toBe('No protection became active. Execution failed and the held funds were refunded.');
    expect(detail.meaning).not.toMatch(/price floor/i);
  });

  it('describes a pending request without claiming protection is active', () => {
    const detail = toProtectionDetailViewModel({
      asset: 'ETH', role: 'protection', protectedAmount: 0.1,
      protectionFloorUsdc: 2_200, status: 'pending_fill', paymentStatus: 'held',
      expiry: '2026-09-05T00:00:00Z', timeline: [],
    });

    expect(detail.meaning).toMatch(/waiting for execution/i);
    expect(detail.meaning).toMatch(/no protection is active/i);
    expect(detail.meaning).not.toMatch(/has a .*price floor/i);
  });

  it('keeps the price-floor explanation for active protection', () => {
    const detail = toProtectionDetailViewModel({
      asset: 'ETH', role: 'protection', protectedAmount: 0.1,
      protectionFloorUsdc: 2_200, status: 'active', paymentStatus: 'paid',
      expiry: '2026-09-05T00:00:00Z', timeline: [],
    });

    expect(detail.meaning).toMatch(/has a \$2,200\.00 USDC price floor at expiry/i);
  });
});
