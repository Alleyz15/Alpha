import { describe, expect, it } from 'vitest';
import {
  formatUsdc,
  toPaymentStatusLabel,
  toPositionViewModel,
  toQuoteViewModel,
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
    'returns null for missing or invalid value %s',
    (value) => {
      expect(formatUsdc(value)).toBeNull();
    },
  );

  it('preserves a real zero value', () => {
    expect(formatUsdc(0)).toBe('$0.00 USDC');
  });
});

describe('payment status copy', () => {
  it('explains that none means the user was not charged', () => {
    expect(toPaymentStatusLabel('none')).toBe('No user payment');
  });

  it('keeps a neutral fallback for unknown values', () => {
    expect(toPaymentStatusLabel('future_status')).toBe('—');
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
    expect(view.paymentStatusLabel).toBe('No user payment');
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
    expect(view.paymentStatusLabel).toBe('—');
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

describe('quote size confirmation', () => {
  it.each([
    ['operator_spend_capacity', /operator’s current USDC spending capacity/i],
    ['capacity_unreadable', /could not read the operator’s current USDC spending capacity/i],
  ])('carries an unconfirmed %s result into the UI model', (unconfirmedReason, expectedMessage) => {
    const view = toQuoteViewModel({
      quoteId: 'quote-1', asset: 'ETH', spot: 2400,
      requested: { units: 0.4, targetDate: '2026-09-05T00:00:00Z' },
      createdAt: '2026-09-03T00:00:00Z', expiresAt: '2026-09-03T00:01:00Z',
      tiers: [{
        tierId: 'tier-1', recommended: true,
        actual: { tier: 'balanced', floorUsdc: 2200, protectionPct: 8.3, expiry: '2026-09-05T00:00:00Z' },
        size: { protectedUnits: 0.4, confirmed: false, unconfirmedReason },
        cost: { premiumUsdc: 12 }, maxLoss: { forConfirmation: 80 },
        disclosure: { sizeReduced: false, unprotectedUnits: 0, unprotectedValueUsdc: 0, expiryLaterThanRequested: false },
        settlement: { paysIn: 'USDC' }, payout: { floorValueUsdc: 880 },
      }],
    });

    expect(view.tiers[0].sizeConfirmed).toBe(false);
    expect(view.tiers[0].sizeConfirmationMessage).toMatch(expectedMessage);
  });
});
