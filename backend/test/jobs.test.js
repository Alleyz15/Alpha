// In-flight money operations.
//
// This map exists because two operations take longer than an HTTP request
// should be held: the maturity pre-flight is 316 seconds measured, and buying
// an option is 9-30. It is progress reporting and a lock, and it is NOT where
// any answer lives - the row and the chain are, both written before any
// broadcast.
//
// The properties worth protecting are all about what absence means.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startJob, getJob, jobView, _clearJobs } from '../src/api/jobs.js';

const settled = () => new Promise((r) => setImmediate(r));

test('a job reports running before it finishes', async (t) => {
  t.after(_clearJobs);
  let release;
  const { started, job } = startJob('k1', () => new Promise((r) => { release = r; }));

  // startJob runs the work on a microtask, so `release` is not assigned until
  // the next tick. The job is nonetheless already marked running.
  assert.equal(started, true);
  assert.equal(job.state, 'running');
  assert.equal(getJob('k1').state, 'running');

  await settled();
  release({ ok: true });
  await settled();
  assert.equal(getJob('k1').state, 'done');
});

test('a second start while running does NOT start a second job', async (t) => {
  // The key is the resource, which makes this a lock. Two maturity transfers
  // for one deposit pays twice, and the pre-flight cannot help if both copies
  // pass it simultaneously.
  t.after(_clearJobs);
  let runs = 0;
  let release;
  const work = () => { runs += 1; return new Promise((r) => { release = r; }); };

  const first = startJob('k2', work);
  const second = startJob('k2', work);

  assert.equal(first.started, true);
  // Checked before the microtask runs: the lock must hold from the instant the
  // first call returns, not from whenever the work happens to begin.
  assert.equal(second.started, false, 'the second click must not start a transfer');
  assert.equal(second.job, first.job, 'it gets the running job back');
  await settled();
  assert.equal(runs, 1, 'the work ran exactly once');

  release({});
  await settled();
});

test('a finished job can be started again', async (t) => {
  // The lock is on concurrency, not on ever doing it twice. A genuine retry
  // after a definite failure has to be possible.
  t.after(_clearJobs);
  let runs = 0;
  startJob('k3', async () => { runs += 1; });
  await settled();

  const again = startJob('k3', async () => { runs += 1; });
  assert.equal(again.started, true);
  await settled();
  assert.equal(runs, 2);
});

test('a rejected job is recorded as failed, never left running', async (t) => {
  t.after(_clearJobs);
  startJob('k4', async () => { throw new Error('nope'); });
  await settled();

  const j = getJob('k4');
  assert.equal(j.state, 'failed');
  assert.equal(j.error.message, 'nope');
});

test('a rejection never escapes as an unhandled rejection', async (t) => {
  // A failure here must not take the process down mid-demo, which is why the
  // catch is attached inside startJob rather than left to the caller.
  t.after(_clearJobs);
  let unhandled = null;
  const onUnhandled = (e) => { unhandled = e; };
  process.on('unhandledRejection', onUnhandled);
  t.after(() => process.off('unhandledRejection', onUnhandled));

  startJob('k5', async () => { throw new Error('boom'); });
  await settled();
  await settled();

  assert.equal(unhandled, null);
});

// --- the instruction that must survive the trip ----------------------------

test('an unknown outcome carries doNotRetry and sent: null', async (t) => {
  // sent: null, not false. The transfer may have landed - anything reading
  // this as "not sent" would retry and pay twice.
  t.after(_clearJobs);
  startJob('k6', async () => {
    throw Object.assign(new Error('lost contact'),
      { code: 'MATURITY_OUTCOME_UNKNOWN', sent: null });
  });
  await settled();

  const j = getJob('k6');
  assert.equal(j.error.doNotRetry, true);
  assert.equal(j.error.sent, null, 'null means unknown; false would be a claim');
});

test('an ordinary failure is retryable and says nothing was sent', async (t) => {
  t.after(_clearJobs);
  startJob('k7', async () => {
    throw Object.assign(new Error('reverted'), { code: 'MATURITY_REVERTED', sent: false });
  });
  await settled();

  const j = getJob('k7');
  assert.equal(j.error.doNotRetry, false);
  assert.equal(j.error.sent, false, 'a revert is a definite answer');
});

// --- absence ---------------------------------------------------------------

test('an unknown key is null, meaning NOT RUNNING — never "did not happen"', () => {
  // This map is in memory and a restart empties it. Anything that read absence
  // as failure would be wrong after every restart.
  _clearJobs();
  assert.equal(getJob('never-existed'), null);
  assert.equal(jobView(null), null);
});

test('jobView carries state and elapsed time and no internals', async (t) => {
  t.after(_clearJobs);
  startJob('k8', async () => ({ txHash: '0xabc' }));
  await settled();

  const v = jobView(getJob('k8'));
  assert.deepEqual(Object.keys(v).sort(),
    ['elapsedSeconds', 'error', 'finishedAt', 'startedAt', 'state']);
  assert.equal(v.state, 'done');
  assert.equal(v.error, null);
  assert.ok(Number.isInteger(v.elapsedSeconds));
});
