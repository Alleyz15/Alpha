import { describe, expect, it } from 'vitest';
import {
  defaultProtectionUnits,
  getDateBounds,
  isKnownAsset,
  purchaseStatusView,
  validateConfiguration,
} from './protectionFlowUtils.js';

const asset = {
  holdingUnits: 0.01,
  holdingLabel: '0.01 BTC',
};

describe('protection flow rules', () => {
  it('defaults to one quarter of each usable holding at fill precision', () => {
    expect(defaultProtectionUnits(0.4)).toBe('0.1');
    expect(defaultProtectionUnits(0.01)).toBe('0.0025');
    expect(defaultProtectionUnits(10)).toBe('2.5');
    expect(defaultProtectionUnits(1.5)).toBe('0.375');
    expect(defaultProtectionUnits(4)).toBe('1');
    expect(defaultProtectionUnits(1000)).toBe('250');
    expect(defaultProtectionUnits(0)).toBe('');
    expect(defaultProtectionUnits(null)).toBe('');
    expect(defaultProtectionUnits(undefined)).toBe('');
  });

  it('recognizes six asset identities without claiming they are all currently offered', () => {
    expect(['ETH', 'BTC', 'BNB', 'SOL', 'AVAX', 'XRP'].every(isKnownAsset)).toBe(true);
    expect(isKnownAsset('DOGE')).toBe(false);
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
