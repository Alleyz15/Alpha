// Settlement polling loop (IMPLEMENT.md tasks 4.3, 4.5).
//
// Read-only against the chain. It reads settlement state and writes to our own
// database; it sends no transactions and holds no signer.

import { listPositionsDueForSettlement } from '../db/positions.js';
import { settlePosition } from './settlement.js';

export { readSettlementState, settlePosition } from './settlement.js';

/**
 * BR-11: the interval must be materially shorter than the shortest expiry.
 * The shortest tenor on the book is under a day, so hourly leaves a wide
 * margin. Configurable, because "materially shorter" depends on a book that
 * moves.
 */
const intervalMs = () => Number(process.env.SCHEDULER_INTERVAL_MINUTES ?? 60) * 60_000;

let timer = null;

/**
 * One pass over everything due.
 *
 * Oldest expiry first (4.5). After downtime the backlog is what matters most -
 * a position that expired yesterday has a user waiting on an answer, while one
 * that expired a minute ago does not - and processing newest-first would leave
 * the oldest until last on exactly the run where that is worst.
 *
 * One position failing does not stop the sweep. A single unreadable option
 * should not prevent every other position from settling.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.apply] - false to report without writing
 * @returns {Promise<object>}
 */
export async function runSettlementSweep({ apply = false } = {}) {
  const due = await listPositionsDueForSettlement();
  const results = [];

  for (const position of due) {
    try {
      results.push(await settlePosition(position, { apply }));
    } catch (error) {
      // Recorded, not swallowed. A settlement that failed quietly is found
      // later, at a worse time, with less information.
      console.error(`[scheduler] position ${position.id} failed to settle:`, error.message);
      results.push({ positionId: position.id, action: 'error', reason: error.message, applied: false });
    }
  }

  return {
    checked: due.length,
    applied: results.filter((r) => r.applied).length,
    settled: results.filter((r) => r.action === 'settled').length,
    expiredWorthless: results.filter((r) => r.action === 'expired_worthless').length,
    needsReview: results.filter((r) => r.action === 'needs_review').length,
    waiting: results.filter((r) => r.action === 'wait').length,
    errors: results.filter((r) => r.action === 'error').length,
    results,
  };
}

/**
 * Start the loop. Sweeps immediately, then on the interval.
 *
 * The immediate sweep is task 4.5: on startup the overdue backlog is cleared
 * before anything waits for the first tick. A scheduler that has been down
 * over an expiry should not stay wrong for another hour.
 *
 * @param {object} [opts]
 * @returns {Promise<object>} the first sweep's result
 */
export async function startScheduler({ apply = true } = {}) {
  if (timer) return null;

  const first = await runSettlementSweep({ apply });
  console.log(`[scheduler] startup sweep: ${first.checked} due, ${first.applied} updated`);

  timer = setInterval(async () => {
    try {
      const r = await runSettlementSweep({ apply });
      if (r.checked > 0) console.log(`[scheduler] sweep: ${r.checked} due, ${r.applied} updated`);
    } catch (error) {
      console.error('[scheduler] sweep failed:', error.message);
    }
  }, intervalMs());

  timer.unref?.();
  return first;
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
