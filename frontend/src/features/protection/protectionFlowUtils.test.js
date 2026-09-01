import { describe, expect, it } from 'vitest';
import {
  getDateBounds,
  isSupportedAsset,
  purchaseStatusView,
  validateConfiguration,
} from './protectionFlowUtils.js';

const asset = {
  holdingUnits: 0.01,
  holdingLabel: '0.01 BTC',
};

describe('protection flow rules', () => {
  it('accepts only the four backend-offered route symbols', () => {
    expect(['ETH', 'BTC', 'BNB', 'SOL'].every(isSupportedAsset)).toBe(true);
    expect(isSupportedAsset('AVAX')).toBe(false);
  });

  it('uses the live tenor to create date bounds, including today-only', () => {
    const now = new Date(2026, 8, 2, 10, 0, 0);
    expect(getDateBounds(0, now)).toEqual({ minimum: '2026-09-02', maximum: '2026-09-02' });
    expect(getDateBounds(2, now)).toEqual({ minimum: '2026-09-02', maximum: '2026-09-04' });
  });

  it('refuses amounts beyond the backend holding and dates beyond the live tenor', () => {
    const errors = validateConfiguration({
      units: '0.02',
      protectionPct: '10',
      targetDate: '2026-09-05',
      asset,
      dateBounds: { minimum: '2026-09-02', maximum: '2026-09-04' },
    });

    expect(errors.units).toMatch(/recorded holding/);
    expect(errors.targetDate).toMatch(/2026-09-04/);
  });

  it('does not call an operator-pending request active on-chain', () => {
    expect(purchaseStatusView({ status: 'pending_fill', fill: 'operator' })).toMatchObject({
      label: 'Waiting for operator',
      tone: 'warning',
    });
    expect(purchaseStatusView({ status: 'active', fill: 'onchain', txHash: '0xabc' })).toMatchObject({
      label: 'Active on Base',
      tone: 'success',
    });
  });
});
