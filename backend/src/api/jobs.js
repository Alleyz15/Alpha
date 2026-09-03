// In-flight money operations.
//
// ===========================================================================
// THIS IS REQUEST STATE. IT IS NOT MONEY STATE, AND IT IS NOT A SOURCE OF TRUTH.
// ===========================================================================
//
// Two endpoints do work that takes far longer than an HTTP request should be
// held open:
//
//   maturity pre-flight   316 seconds, measured 3 Sep 2026 (222s of it is the
//                         settlement event scan, which walks 40 nine-block
//                         windows before the oracle answers in one call)
//   buying an option      9-30 seconds against a book that re-signs every 60
//
// So those endpoints return immediately and the interface polls. This map is
// what "immediately" needs: somewhere to say a thing is already running.
//
// ---------------------------------------------------------------------------
// WHY THIS IS NOT WHERE THE ANSWER LIVES
// ---------------------------------------------------------------------------
//
// It is in memory. A restart loses it. That is acceptable ONLY because it never
// holds the outcome of anything - the outcome is the database row and the
// chain, both of which are written before any broadcast. Losing this map loses
// the progress indicator, never the money.
//
// It follows that a missing job means "not currently running", NEVER "did not
// happen". Anything that reads absence here as failure would be wrong after
// every restart. The interface re-reads the resource, always.

/**
 * jobKey -> { state, startedAt, finishedAt, result, error }
 *
 * state is 'running' | 'done' | 'failed'.
 */
const jobs = new Map();

/**
 * How long a finished job is kept so a poll can collect its result.
 *
 * Long enough for an interface polling every couple of seconds to see it, short
 * enough that a demo session does not accumulate them.
 */
const KEEP_FINISHED_MS = 10 * 60 * 1000;

/** How long a running job may run before it is presumed lost. */
const PRESUME_LOST_MS = 15 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [key, job] of jobs) {
    if (job.state === 'running' && now - job.startedAt > PRESUME_LOST_MS) {
      // The process is still alive but this job is not reporting. Marked
      // failed with an explicit reason rather than deleted: a vanished job
      // reads as "never ran".
      job.state = 'failed';
      job.finishedAt = now;
      job.error = {
        code: 'OUTCOME_UNKNOWN',
        message: 'This operation stopped reporting. Do not retry — check with the team.',
        doNotRetry: true,
      };
    }
    if (job.state !== 'running' && now - job.finishedAt > KEEP_FINISHED_MS) {
      jobs.delete(key);
    }
  }
}

/**
 * Start work under a key, or report that it is already running.
 *
 * ---------------------------------------------------------------------------
 * THE KEY IS THE RESOURCE, WHICH IS WHAT MAKES THIS A LOCK.
 * ---------------------------------------------------------------------------
 *
 * Keying by vault or loan id means a second click cannot start a second
 * transfer while the first is in flight. That matters more than the progress
 * reporting: two maturity transfers for one deposit pays twice, and no amount
 * of care in the pre-flight helps if both copies pass it simultaneously.
 *
 * The database and the pre-flight are still the real defences - this only
 * closes the window where neither has been reached yet.
 *
 * @param {string} key - e.g. `mature:<vaultId>`
 * @param {() => Promise<object>} work
 * @returns {{started: boolean, job: object}}
 */
export function startJob(key, work) {
  sweep();

  const existing = jobs.get(key);
  if (existing && existing.state === 'running') {
    return { started: false, job: existing };
  }

  const job = {
    key,
    state: 'running',
    startedAt: Date.now(),
    finishedAt: null,
    result: null,
    error: null,
  };
  jobs.set(key, job);

  // Deliberately not awaited. The rejection handler is attached here rather
  // than left to the caller, so a failure can never surface as an unhandled
  // rejection that takes the process down mid-demo.
  Promise.resolve()
    .then(work)
    .then((result) => {
      job.state = 'done';
      job.result = result;
      job.finishedAt = Date.now();
    })
    .catch((error) => {
      job.state = 'failed';
      job.finishedAt = Date.now();
      job.error = {
        code: error?.code ?? 'UPSTREAM_ERROR',
        message: error?.message ?? 'The operation failed.',
        // Carried through from the domain error. An unknown outcome must never
        // be retried, and that instruction has to survive the trip.
        doNotRetry: error?.code === 'OUTCOME_UNKNOWN'
          || error?.code === 'MATURITY_OUTCOME_UNKNOWN'
          || error?.code === 'DISBURSE_OUTCOME_UNKNOWN',
        // NOT `error?.sent ?? false`. `??` treats null as absent, which would
        // turn "we do not know whether it sent" into "it did not send" - the
        // precise conversion the doNotRetry line above exists to prevent, and
        // the one a retry button would act on. Only a genuinely missing field
        // defaults to false.
        sent: error?.sent === undefined ? false : error.sent,
      };
      console.error(`[jobs] ${key} failed:`, error?.message ?? error);
    });

  return { started: true, job };
}

/**
 * The current state of a key, or null when nothing is running or remembered.
 *
 * NULL MEANS "not currently running". It never means "did not happen" - read
 * the resource for that.
 */
export function getJob(key) {
  sweep();
  return jobs.get(key) ?? null;
}

/**
 * The job as the interface should see it.
 *
 * @param {object|null} job
 */
export function jobView(job) {
  if (!job) return null;

  return {
    state: job.state,
    startedAt: new Date(job.startedAt).toISOString(),
    finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
    elapsedSeconds: Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000),
    error: job.error,
  };
}

/** Test seam. Never called by the server. */
export function _clearJobs() {
  jobs.clear();
}
