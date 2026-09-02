import { describe, expect, it } from 'vitest';
import {
  formatUsdc,
  toPaymentStatusLabel,
  toPositionViewModel,
} from './quoteViewModel.js';

const basePosition = {
  positionId: 'position-1',
  asset: 'ETH',
  protectedAmount: 1.25,
  expiry: '2026-09-04T08:00:00.000Z',
  premiumPaidUsdc: 12.5,
  status: 'active',
  payoutUsdc: null,
  fill: 'onchain',
};

describe('formatUsdc', () => {
  it.each([null, undefined, '', Number.NaN, Number.POSITIVE_INFINITY])(
    'renders %s as a neutral placeholder',
    (value) => {
      expect(formatUsdc(value)).toBe('—');
    },
  );

  it('preserves a real zero value', () => {
    expect(formatUsdc(0)).toBe('$0.00 USDC');
  });
});

describe('payment status copy', () => {
  it('explains that none means the demo balance was not charged', () => {
    expect(toPaymentStatusLabel('none')).toBe('Not charged to demo balance');
  });

  it('keeps a neutral fallback for unknown values', () => {
    expect(toPaymentStatusLabel('future_status')).toBe('Payment status unavailable');
  });

  it('does not convert an explicit none status into paid', () => {
    const view = toPositionViewModel({
      ...basePosition,
      role: 'protection',
      protectionFloorUsdc: 2300,
      upsideThresholdUsdc: null,
      paymentStatus: 'none',
    });

    expect(view.paymentStatus).toBe('none');
    expect(view.paymentStatusLabel).toBe('Not charged to demo balance');
  });

  it('does not infer paid from an explicit unknown future status', () => {
    const view = toPositionViewModel({
      ...basePosition,
      role: 'protection',
      protectionFloorUsdc: 2300,
      upsideThresholdUsdc: null,
      paymentStatus: 'future_status',
    });

    expect(view.paymentStatus).toBe('unknown');
    expect(view.paymentStatusLabel).toBe('Payment status unavailable');
  });
});

describe('position roles', () => {
  it('uses the protection floor and protection wording for protection positions', () => {
    const view = toPositionViewModel({
      ...basePosition,
      role: 'protection',
      protectionFloorUsdc: 2300,
      upsideThresholdUsdc: null,
      paymentStatus: 'paid',
    });

    expect(view.positionRoleLabel).toBe('Downside protection');
    expect(view.amountSummaryLabel).toBe('protected');
    expect(view.primaryMetricLabel).toBe('Protection floor');
    expect(view.primaryMetricValueLabel).toBe('$2,300.00 USDC');
    expect(view.floorLabel).toBe('$2,300.00 USDC');
    expect(view.upsideThresholdLabel).toBeNull();
  });

  it('uses the upside threshold and never protection wording for upside positions', () => {
    const view = toPositionViewModel({
      ...basePosition,
      role: 'upside',
      protectionFloorUsdc: null,
      upsideThresholdUsdc: 2680,
      paymentStatus: 'none',
    });

    expect(view.positionRoleLabel).toBe('Upside exposure');
    expect(view.amountSummaryLabel).toBe('upside exposure active');
    expect(view.primaryMetricLabel).toBe('Upside threshold');
    expect(view.primaryMetricValueLabel).toBe('$2,680.00 USDC');
    expect(view.floorLabel).toBeNull();
    expect(view.upsideThresholdLabel).toBe('$2,680.00 USDC');
  });

  it('infers a protection role for older mock data that has only a floor', () => {
    const view = toPositionViewModel({
      ...basePosition,
      protectionFloorUsdc: 2200,
      paymentStatus: 'held',
    });

    expect(view.role).toBe('protection');
    expect(view.primaryMetricLabel).toBe('Protection floor');
  });
});
