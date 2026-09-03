// Buying the call that backs a deposit.
//
// ===========================================================================
// THE ORDER IS THE BUG THAT WAS FIXED, SO THE ORDER IS WHAT IS TESTED.
// ===========================================================================
//
// scripts/vault.js bought the call and inserted the vaults row afterwards. A
// process that died in between left an option on chain that nothing in the
// database recorded owning - the exact gap BR-14 exists to prevent, in the one
// place the rule was not applied. And the insert's failure was handled with
//
//     if (vault.error) { console.error(...); }
//
// so a failed vault row printed a wallet summary and exited zero.
//
// Every dependency is injected, so these drive the real function and record the
// sequence it actually performs rather than a description of it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDepositPreflight, depositToVault } from '../src/vault/deposit.js';

const QUOTE = {
  asset: 'ETH',
  spot: 2400,
  principalUsdc: 3,
  yieldPortion: 2.9878,
  optionPortion: 0.0122,
  participationPct: 23.54,
  exposureUsdc: 0.7062,
  contracts: 0.000294,
  call: { raw: { order: { strikePrice: '280000000000' } } },
  strike: 2800,
  expiry: new Date('2026-09-10T08:00:00.000Z'),
  daysToExpiry: 2,
  premiumPerContract: 41.5,
  yieldIsSimulated: true,
};

/** Records every side effect in the order it actually happens. */
function harness({ quote = QUOTE, fill, usdc = 50, sim = { success: true, gasEstimate: 500000n } } = {}) {
  const calls = [];

  const deps = {
    walletAddress: '0xwallet',
    quoteVault: async () => quote,
    walletBalances: async () => ({ usdc }),
    client: {
      provider: {
        getTransactionCount: async () => 7,
        getTransactionReceipt: async () => null,
      },
      chainConfig: {
        tokens: { USDC: { address: '0xusdc' } },
        contracts: { optionBook: '0xbook' },
      },
      optionBook: {
        callStaticFillOrder: async () => sim,
        fillOrder: fill ?? (async () => {
          calls.push('fillOrder');
          return { hash: '0xtx', logs: [{ address: '0xoption' }] };
        }),
      },
      option: { getFullOptionInfo: async () => ({ numContracts: 294n }) },
    },
    insertVault: async (row) => { calls.push('insertVault'); return { id: 'v1', ...row }; },
    updateVault: async (id, patch) => {
      calls.push(`updateVault:${Object.keys(patch).join(',')}`);
      return { id, ...patch };
    },
    insertPendingPosition: async () => { calls.push('insertPendingPosition'); return { id: 'p1' }; },
    transitionPosition: async (_id, { toStatus }) => { calls.push(`transition:${toStatus}`); return {}; },
    confirmedRead: async (read) => ({ value: await read(), confirmed: true, attempts: 1 }),
  };

  return { calls, deps };
}

const deposit = (deps, over = {}) =>
  depositToVault({ userId: 'u1', principalUsdc: 3, confirmed: true, ...over }, deps);

// --- the pre-flight --------------------------------------------------------

test('the pre-flight sends nothing and writes nothing', async () => {
  const h = harness();
  const pre = await runDepositPreflight({ principalUsdc: 3 }, h.deps);

  assert.equal(pre.pass, true);
  assert.deepEqual(h.calls, [], 'no fill, no insert, no transition');
});

test('the pre-flight refuses a call at or below spot', async () => {
  // Below spot the call is already in the money. That is not upside
  // participation, it is a different product bought by accident.
  const h = harness({ quote: { ...QUOTE, strike: 2000 } });
  const pre = await runDepositPreflight({ principalUsdc: 3 }, h.deps);

  assert.equal(pre.pass, false);
  assert.ok(pre.checks.find((c) => c.label.includes('above spot') && !c.pass));
});

test('the pre-flight refuses a split that does not account for the deposit', async () => {
  const h = harness({ quote: { ...QUOTE, yieldPortion: 1, optionPortion: 1 } });
  const pre = await runDepositPreflight({ principalUsdc: 3 }, h.deps);

  assert.equal(pre.pass, false);
  assert.ok(pre.checks.find((c) => c.label.includes('split') && !c.pass));
});

test('the pre-flight refuses zero participation (BR-38)', async () => {
  // Zero would mean the deposit buys nothing and the product is a savings
  // account with extra steps.
  const h = harness({ quote: { ...QUOTE, participationPct: 0 } });
  const pre = await runDepositPreflight({ principalUsdc: 3 }, h.deps);

  assert.equal(pre.pass, false);
});

test('the pre-flight refuses when the wallet cannot afford the option portion', async () => {
  const h = harness({ usdc: 0.001 });
  const pre = await runDepositPreflight({ principalUsdc: 3 }, h.deps);

  assert.equal(pre.pass, false);
  assert.ok(pre.checks.find((c) => c.label.includes('wallet holds') && !c.pass));
});

test('a callStatic that would revert fails the pre-flight rather than throwing', async () => {
  const h = harness({ sim: { success: false, error: new Error('InvalidNumContracts') } });
  const pre = await runDepositPreflight({ principalUsdc: 3 }, h.deps);

  assert.equal(pre.pass, false);
  assert.ok(pre.checks.at(-1).detail.includes('WOULD REVERT'));
});

// --- the ordering, which is the fix ----------------------------------------

test('THE FIX: the vault row is written BEFORE the fill', async () => {
  const h = harness();
  await deposit(h.deps);

  const vaultAt = h.calls.indexOf('insertVault');
  const fillAt = h.calls.indexOf('fillOrder');

  assert.ok(vaultAt >= 0, 'the vault row was written');
  assert.ok(fillAt >= 0, 'the fill happened');
  assert.ok(vaultAt < fillAt,
    `insertVault must precede fillOrder, got ${JSON.stringify(h.calls)}`);
});

test('the position row and its broadcast event also precede the fill', async () => {
  const h = harness();
  await deposit(h.deps);

  assert.ok(h.calls.indexOf('insertPendingPosition') < h.calls.indexOf('fillOrder'));
  assert.ok(h.calls.indexOf('transition:pending_verification') < h.calls.indexOf('fillOrder'));
});

test('the whole sequence is the documented one', async () => {
  const h = harness();
  await deposit(h.deps);

  assert.deepEqual(h.calls, [
    'insertVault',
    'insertPendingPosition',
    'updateVault:position_id',
    'transition:pending_verification',
    'fillOrder',
    'transition:active',
    'updateVault:status',
  ]);
});

// --- a write that fails stops, it does not carry on ------------------------

test('a failed vault insert stops before anything is spent', async () => {
  // The old code logged this and continued. Nothing has been spent at that
  // point, so stopping is free and continuing is not.
  const h = harness();
  h.deps.insertVault = async () => { throw new Error('insert failed'); };

  await assert.rejects(() => deposit(h.deps), /insert failed/);
  assert.ok(!h.calls.includes('fillOrder'), 'nothing was broadcast');
});

test('a pre-flight failure writes nothing and sends nothing', async () => {
  const h = harness({ usdc: 0 });

  await assert.rejects(() => deposit(h.deps), (e) => e.code === 'DEPOSIT_PREFLIGHT_FAILED');
  assert.deepEqual(h.calls, [], 'no row was created for a deposit that never happened');
});

// --- failure outcomes ------------------------------------------------------

test('a definitively reverted fill marks BOTH rows failed', async () => {
  const h = harness({
    fill: async () => { throw Object.assign(new Error('nope'), { code: 'CONTRACT_REVERT' }); },
  });
  // No hash in the error and the nonce never moved -> nothing was sent.
  h.deps.client.provider.getTransactionCount = async () => 7;

  await assert.rejects(() => deposit(h.deps), (e) => e.code === 'DEPOSIT_REVERTED');

  assert.ok(h.calls.includes('transition:failed'), 'the position is failed');
  assert.ok(h.calls.includes('updateVault:status'), 'the vault is failed');
});

test('an UNKNOWN outcome leaves both rows pending and says do not retry', async () => {
  // The transaction may have landed. Marking either row terminal would be the
  // 3 Sep mistake again, in the other product.
  const h = harness({
    fill: async () => { throw Object.assign(new Error('timeout'), { code: 'CONTRACT_REVERT' }); },
  });
  // The nonce MOVED between the two reads, so something was sent and we cannot
  // see it. Overriding it to a constant 8 would have made nonceBefore 8 too and
  // tested 'not_sent' by accident - which is what the first version of this
  // test did.
  let nonce = 7;
  h.deps.client.provider.getTransactionCount = async () => nonce++;

  await assert.rejects(() => deposit(h.deps), (e) => {
    assert.equal(e.code, 'DEPOSIT_OUTCOME_UNKNOWN');
    assert.equal(e.sent, null, 'null means unknown; false would be a claim');
    assert.match(e.message, /DO NOT RETRY/);
    return true;
  });

  assert.ok(!h.calls.includes('transition:failed'), 'the position is NOT marked failed');
  assert.ok(!h.calls.includes('transition:active'), 'and not marked active either');
});

test('a fill that threw but SUCCEEDED on chain is recorded as active', async () => {
  // The 3 Sep case, in the deposit path. The SDK says revert; the receipt says
  // status 1; the chain wins.
  const HASH = `0x${'ab'.repeat(32)}`;
  const h = harness({
    fill: async () => {
      throw Object.assign(new Error(`rpc died reading ${HASH}`), { code: 'CONTRACT_REVERT' });
    },
  });
  h.deps.client.provider.getTransactionReceipt = async () => ({
    status: 1, hash: HASH, logs: [{ address: '0xoption' }],
  });

  const out = await deposit(h.deps);

  assert.equal(out.sent, true);
  assert.equal(out.txHash, HASH);
  assert.ok(h.calls.includes('transition:active'));
  assert.ok(!h.calls.includes('transition:failed'));
});

// --- the guard -------------------------------------------------------------

test('depositToVault refuses without confirmed: true', async () => {
  const h = harness();
  await assert.rejects(
    () => depositToVault({ userId: 'u1', principalUsdc: 3 }, h.deps),
    /requires \{ confirmed: true \}/,
  );
  assert.deepEqual(h.calls, [], 'nothing happened at all');
});

// --- a guard that could never fire -----------------------------------------

test('a balance guard written against a ROW never fires, in the permissive direction', () => {
  // getBalance returns a row. `Number(row)` is NaN, and NaN compares false to
  // EVERYTHING - so `held < amount` is false and `held >= amount` is also
  // false. The guard answers no to both questions and lets the request past.
  //
  // This shipped in the deposit endpoint and a live POST for 999999 USDC came
  // back 202. Nothing was spent, because the pre-flight refused downstream -
  // but the only thing standing between the request and a purchase was a check
  // that had already been bypassed.
  const row = { user_id: 'u1', asset: 'USDC', amount: 249.462422 };

  assert.ok(Number.isNaN(Number(row)), 'a row coerces to NaN, not to its amount');
  assert.equal(Number(row) < 999999, false, 'the refusal never fires');
  assert.equal(Number(row) >= 3, false, 'and the affordability check also says no');

  // Both questions answered "no" about the same balance. Only reading the
  // field gives an answer that can be right.
  assert.equal(Number(row.amount) >= 3, true);
  assert.equal(Number(row.amount) < 999999, true);
});
