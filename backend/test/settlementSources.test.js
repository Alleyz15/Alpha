// Where settlement figures come from.
//
// These tests exist because both original sources were broken and neither
// failure was visible: getTWAP reverts on an unsettled option, and
// full.settlementPrice was written against a shape getFullOptionInfo does not
// return, so it could only ever be undefined. Nothing reached the code path
// until the first option was about to expire.
//
// The decisions worth protecting: a payout event beats a calculation, one bad
// window does not abandon the scan, and NOTHING here ever returns zero to mean
// "could not read".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blockAtTime,
  readSettlementFromEvents,
  readSettlementFromIndexer,
} from '../src/scheduler/settlementSources.js';

/** A fake SDK. Blocks are 2 seconds apart, starting at a known epoch. */
function fakeSdk({ payouts = {}, expiries = {}, throwOn = () => false, positions = null } = {}) {
  const t0 = 1_788_000_000;
  const head = 50_000_000;
  return {
    provider: {
      getBlockNumber: async () => head,
      getBlock: async (n) => ({ number: n, timestamp: t0 + (n - head) * 2 }),
    },
    events: {
      getOptionPayoutEvents: async (_addr, { fromBlock }) => {
        if (throwOn(fromBlock)) throw new Error('window unreadable');
        return payouts[fromBlock] ?? [];
      },
      getOptionExpiredEvents: async (_addr, { fromBlock }) => {
        if (throwOn(fromBlock)) throw new Error('window unreadable');
        return expiries[fromBlock] ?? [];
      },
    },
    api: {
      getUserPositionsFromIndexer: async () => {
        if (positions === null) throw new Error('indexer down');
        return positions;
      },
    },
  };
}

test('a payout event is reported as the payout, with no calculation', async () => {
  const sdk = fakeSdk({ payouts: { 50_000_000: [{ amountPaidOut: 1_234_567n }] } });
  const r = await readSettlementFromEvents('0xabc', 1_788_000_000, sdk);

  assert.equal(r.payoutRaw, 1_234_567n);
  assert.match(r.source, /OptionPayout/);
});

test('an expiry event supplies the settlement price', async () => {
  const sdk = fakeSdk({ expiries: { 50_000_000: [{ settlementPrice: 230_000_000_000n }] } });
  const r = await readSettlementFromEvents('0xabc', 1_788_000_000, sdk);

  assert.equal(r.settlementPriceRaw, 230_000_000_000n);
});

test('nothing found returns null, never zero', async () => {
  // The single most important property. Zero is a payout; null is "unknown",
  // and settlement.js flags unknown for a human rather than recording it.
  const r = await readSettlementFromEvents('0xabc', 1_788_000_000, fakeSdk());

  assert.equal(r.payoutRaw, null);
  assert.equal(r.settlementPriceRaw, null);
  assert.notEqual(r.payoutRaw, 0n);
  assert.match(r.source, /nothing found/);
});

test('one unreadable window does not abandon the scan', async () => {
  // The free tier rate-limits. A window that throws must not lose an event
  // sitting in a later one.
  const sdk = fakeSdk({
    payouts: { 50_000_030: [{ amountPaidOut: 999n }] },
    throwOn: (from) => from === 50_000_000 || from === 50_000_010,
  });
  const r = await readSettlementFromEvents('0xabc', 1_788_000_000, sdk);

  assert.equal(r.payoutRaw, 999n);
  assert.ok(r.windowsScanned >= 4);
});

test('the scan is bounded — it cannot run forever against a silent chain', async () => {
  const r = await readSettlementFromEvents('0xabc', 1_788_000_000, fakeSdk());
  assert.ok(r.windowsScanned <= 40, `scanned ${r.windowsScanned} windows`);
});

test('the scan stops once both figures are in hand', async () => {
  const sdk = fakeSdk({
    payouts: { 50_000_000: [{ amountPaidOut: 5n }] },
    expiries: { 50_000_000: [{ settlementPrice: 7n }] },
  });
  const r = await readSettlementFromEvents('0xabc', 1_788_000_000, sdk);
  assert.equal(r.windowsScanned, 1);
});

test('a failing block search degrades to null rather than throwing', async () => {
  const broken = { provider: { getBlockNumber: async () => { throw new Error('rpc down'); } } };
  const r = await readSettlementFromEvents('0xabc', 1_788_000_000, broken);

  assert.equal(r.payoutRaw, null);
  assert.match(r.source, /could not locate the expiry block/);
});

test('blockAtTime finds the block at a timestamp', async () => {
  const sdk = fakeSdk();
  // head is 50_000_000 at t0; 100 blocks earlier is t0 - 200.
  assert.equal(await blockAtTime(1_788_000_000 - 200, sdk), 49_999_900);
});

test('a future timestamp returns the chain head rather than searching past it', async () => {
  const sdk = fakeSdk();
  assert.equal(await blockAtTime(1_788_000_000 + 99_999, sdk), 50_000_000);
});

test('the indexer reports status and side, and null when it is down', async () => {
  const up = fakeSdk({ positions: [{ optionAddress: '0xABC', optionStatus: 'settled', pnl: 1.5, side: 'buyer' }] });
  const r = await readSettlementFromIndexer('0xabc', '0xwallet', up);
  assert.equal(r.status, 'settled');
  assert.equal(r.pnlUsdc, 1.5);
  assert.equal(r.side, 'buyer');

  const down = await readSettlementFromIndexer('0xabc', '0xwallet', fakeSdk());
  assert.equal(down.status, null);
  assert.equal(down.pnlUsdc, null);
  assert.match(down.source, /indexer:/);
});

test('an option the indexer does not list is not treated as settled', async () => {
  const sdk = fakeSdk({ positions: [{ optionAddress: '0xother', optionStatus: 'settled' }] });
  const r = await readSettlementFromIndexer('0xabc', '0xwallet', sdk);
  assert.equal(r.status, null);
  assert.match(r.source, /not listed/);
});
