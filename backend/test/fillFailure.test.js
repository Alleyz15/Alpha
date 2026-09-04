// What happened, when the fill call throws after we broadcast.
//
// ===========================================================================
// A REFUND PATH THAT HAS NEVER RUN IS A HYPOTHESIS.
// ===========================================================================
//
// On 3 Sep a successful fill was recorded as `failed`. Two independent faults,
// both in code that only executes when something goes wrong:
//
//   1. The SDK maps EVERY unrecognised Error to a ContractRevertError, so
//      `error.code === 'CONTRACT_REVERT'` was true for an RPC failure reading
//      a receipt. Unknown became definitely-not.
//
//   2. The refund path then threw `ReferenceError: quote is not defined`.
//      `quote` was never destructured, and `quote?.premium` does not help -
//      optional chaining guards a null VALUE, not an undeclared IDENTIFIER.
//      That line was broken in every execution and surfaced the first time a
//      fill failed for real.
//
// So these tests drive the classifier through all four outcomes with an
// injected provider. The rule they enforce: after broadcast, only a receipt
// with status 0, or a nonce that never moved, may end in `failed`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { txHashFromError, resolveFillFailure } from '../src/thetanuts/fillOutcome.js';

const HASH = '0x2913c6e20389de6e56ff605db47396688561c2167ee765d51d56a680b1091847';
const WALLET = '0x4fB77837bf2A0B86D167627Ded2E894f92F15127';

/** The real 3 Sep error, verbatim from the position_events payload. */
const REAL_ERROR = Object.assign(
  new Error('Contract call failed: could not coalesce error (error={ "code": -32000, '
    + '"message": "Internal error" }, payload={ "id": 51, "jsonrpc": "2.0", "method": '
    + `"eth_getTransactionReceipt", "params": [ "${HASH}" ] }, code=UNKNOWN_ERROR, version=6.17.0)`),
  // The SDK's catch-all sets this. It is a lie, and the point is that we no
  // longer care what it says.
  { code: 'CONTRACT_REVERT' },
);

const provider = ({ receipt, nonce, throwReceipt = false, throwNonce = false }) => ({
  getTransactionReceipt: async () => {
    if (throwReceipt) throw new Error('rpc down');
    return receipt;
  },
  getTransactionCount: async () => {
    if (throwNonce) throw new Error('rpc down');
    return nonce;
  },
});

// --- finding the hash ------------------------------------------------------

test('the hash is read from structured fields when present', () => {
  assert.equal(txHashFromError({ transactionHash: HASH }), HASH);
  assert.equal(txHashFromError({ hash: HASH }), HASH);
  assert.equal(txHashFromError({ transaction: { hash: HASH } }), HASH);
  assert.equal(txHashFromError({ info: { payload: { params: [HASH] } } }), HASH);
});

test('the hash is recovered from the message when that is all there is', () => {
  // The 3 Sep case: the hash existed only inside the serialised RPC payload.
  assert.equal(txHashFromError(REAL_ERROR), HASH);
});

test('an error naming no transaction yields null, not a guess', () => {
  assert.equal(txHashFromError(new Error('something went wrong')), null);
  assert.equal(txHashFromError(null), null);
  assert.equal(txHashFromError({ hash: '0xtooshort' }), null);
});

// --- the four outcomes -----------------------------------------------------

test('THE 3 SEP CASE: a status-1 receipt means the fill SUCCEEDED', async () => {
  // The whole reason this module exists. The SDK said CONTRACT_REVERT; the
  // chain says status 1. The chain wins.
  const out = await resolveFillFailure({
    error: REAL_ERROR,
    nonceBefore: 14,
    wallet: WALLET,
    provider: provider({ receipt: { status: 1, hash: HASH, logs: [] } }),
  });

  assert.equal(out.kind, 'succeeded');
  assert.equal(out.txHash, HASH);
  assert.ok(out.receipt, 'the receipt is carried so the caller can continue with it');
});

test('a status-0 receipt is the only receipt that means reverted', async () => {
  const out = await resolveFillFailure({
    error: REAL_ERROR,
    nonceBefore: 14,
    wallet: WALLET,
    provider: provider({ receipt: { status: 0, hash: HASH } }),
  });

  assert.equal(out.kind, 'reverted');
  assert.match(out.evidence, /status 0/);
});

test('a named transaction with an unreadable receipt is UNKNOWN, never failed', async () => {
  // Precisely the 3 Sep situation before the receipt became readable. The old
  // code called this `failed` and refunded.
  const out = await resolveFillFailure({
    error: REAL_ERROR,
    nonceBefore: 14,
    wallet: WALLET,
    provider: provider({ throwReceipt: true }),
  });

  assert.equal(out.kind, 'unknown');
  assert.equal(out.receipt, null);
});

test('a null receipt is unknown, not absent', async () => {
  // getTransactionReceipt returns null for a transaction not yet mined. It has
  // been sent; we simply cannot see it yet.
  const out = await resolveFillFailure({
    error: REAL_ERROR,
    nonceBefore: 14,
    wallet: WALLET,
    provider: provider({ receipt: null }),
  });

  assert.equal(out.kind, 'unknown');
});

test('no transaction and an UNCHANGED nonce proves nothing was sent', async () => {
  // The only safe basis for refunding: the wallet's nonce never moved, so no
  // transaction left it.
  const out = await resolveFillFailure({
    error: new Error('execution reverted during estimateGas'),
    nonceBefore: 14,
    wallet: WALLET,
    provider: provider({ nonce: 14 }),
  });

  assert.equal(out.kind, 'not_sent');
  assert.match(out.evidence, /nonce unchanged/);
});

test('no transaction but a MOVED nonce is unknown — something was sent', async () => {
  const out = await resolveFillFailure({
    error: new Error('timeout'),
    nonceBefore: 14,
    wallet: WALLET,
    provider: provider({ nonce: 15 }),
  });

  assert.equal(out.kind, 'unknown');
  assert.match(out.evidence, /nonce moved/);
});

test('an unreadable nonce is unknown, never not_sent', async () => {
  // Not being able to ask is not the same as the answer being no.
  const out = await resolveFillFailure({
    error: new Error('timeout'),
    nonceBefore: 14,
    wallet: WALLET,
    provider: provider({ throwNonce: true }),
  });

  assert.equal(out.kind, 'unknown');
});

test('a null nonceBefore can never yield not_sent', async () => {
  // If we failed to capture the nonce before the call, we have nothing to
  // compare against and must not conclude anything was refused.
  const out = await resolveFillFailure({
    error: new Error('timeout'),
    nonceBefore: null,
    wallet: WALLET,
    provider: provider({ nonce: 14 }),
  });

  assert.notEqual(out.kind, 'not_sent');
  assert.equal(out.kind, 'unknown');
});

// --- the property that matters ---------------------------------------------

test('the error’s own code NEVER decides the outcome', async () => {
  // Same chain state, four different error classifications, one answer. If the
  // SDK's opinion mattered anywhere, these would diverge.
  const codes = ['CONTRACT_REVERT', 'CALL_EXCEPTION', 'UNKNOWN_ERROR', undefined];
  const results = [];

  for (const code of codes) {
    const err = Object.assign(new Error(`something happened with ${HASH}`), { code });
    results.push((await resolveFillFailure({
      error: err,
      nonceBefore: 14,
      wallet: WALLET,
      provider: provider({ receipt: { status: 1, hash: HASH } }),
    })).kind);
  }

  assert.deepEqual(results, ['succeeded', 'succeeded', 'succeeded', 'succeeded'],
    'the chain decides; the error does not');
});

test('a message containing the word "revert" does not make it reverted', async () => {
  // The old check was /revert/i on the message. A successful transaction whose
  // error text happens to mention a revert must still be read from the chain.
  const out = await resolveFillFailure({
    error: new Error(`execution reverted somewhere, see ${HASH}`),
    nonceBefore: 14,
    wallet: WALLET,
    provider: provider({ receipt: { status: 1, hash: HASH } }),
  });

  assert.equal(out.kind, 'succeeded');
});

test('every outcome carries evidence a human can check', async () => {
  // "failed" with no reason is what made the 3 Sep row unexplainable until
  // someone opened BaseScan.
  const cases = [
    { provider: provider({ receipt: { status: 1 } }), error: REAL_ERROR },
    { provider: provider({ receipt: { status: 0 } }), error: REAL_ERROR },
    { provider: provider({ receipt: null }), error: REAL_ERROR },
    { provider: provider({ nonce: 14 }), error: new Error('no hash') },
    { provider: provider({ nonce: 99 }), error: new Error('no hash') },
  ];

  for (const c of cases) {
    const out = await resolveFillFailure({ ...c, nonceBefore: 14, wallet: WALLET });
    assert.ok(out.evidence && out.evidence.length > 10, `${out.kind} has no evidence`);
  }
});
