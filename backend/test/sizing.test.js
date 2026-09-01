// Sizing conversion test (finding #4: a float-floor dropped a 6dp unit).
//
// sizing.js imports the SDK client transitively, so a dummy RPC URL is set
// before importing; the function under test is pure integer arithmetic and
// touches nothing.
//
//   npm test        (from backend/)

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.THETANUTS_RPC_URL ??= 'http://localhost:0';

const { unitsToContractsRaw } = await import('../src/thetanuts/sizing.js');

test('unitsToContractsRaw converts clean values exactly', () => {
  assert.equal(unitsToContractsRaw(0.4), 400000n);
  assert.equal(unitsToContractsRaw(0.02), 20000n);
  assert.equal(unitsToContractsRaw(1), 1000000n);
});

test('unitsToContractsRaw does not drop a unit to float error (the bug)', () => {
  // 0.000249 * 1e6 lands just under 249 in float; Math.floor gave 248.
  assert.equal(unitsToContractsRaw(0.000249), 249n);
  assert.equal(unitsToContractsRaw(0.000489), 489n);
});

test('unitsToContractsRaw rounds finer-than-6dp precision to the nearest unit', () => {
  assert.equal(unitsToContractsRaw(0.0000004), 0n);   // 0.4 of a 6dp unit -> 0
  assert.equal(unitsToContractsRaw(0.0000006), 1n);   // 0.6 of a 6dp unit -> 1
});
