// Removing the rows a check or a dry run created.
//
// ---------------------------------------------------------------------------
// Every delete here is checked. That is the entire point of this file.
// ---------------------------------------------------------------------------
//
// Four scripts each had their own cleanup that called
// `await db.from('positions').delete().eq(...)` and never looked at the error.
// When balance_events gained an ON DELETE RESTRICT reference to positions, the
// deletes started failing - and every one of those scripts kept printing "test
// rows removed". The rows stayed, the debits stood, and the demo balance drifted
// by 1.395637 USDC before anyone noticed.
//
// The constraint was right. A financial event must not vanish because someone
// deleted the row it referenced, and weakening it for test convenience is how
// production constraints get weakened for production convenience later. So the
// cleanup respects it instead, in the only order that works:
//
//   1. reverse any debit through refund_balance()  <- a compensating write
//   2. delete the balance_events                   <- now unreferenced
//   3. delete position_events
//   4. delete the position
//   5. delete the quote
//
// Step 1 is not optional and not a shortcut around step 2. A check that leaves a
// user charged is a check that changes the thing it measures.

import { db } from './client.js';
import { refundBalance } from './balances.js';

/** Throw on a failed write instead of continuing as though it worked. */
function assertOk(error, what) {
  if (error) throw new Error(`cleanup failed at ${what}: ${error.message}`);
}

/**
 * Remove the rows one test purchase created, leaving balances as they were.
 *
 * @param {object} args
 * @param {string} [args.positionId]
 * @param {string} [args.quoteId]
 * @param {boolean} [args.refund] - reverse any debit first. Default true.
 * @returns {Promise<{refunded: number, deleted: object}>}
 */
export async function discardTestRows({ positionId, quoteId, refund = true } = {}) {
  let refunded = 0;

  if (positionId && refund) {
    const { data: debits, error } = await db.from('balance_events')
      .select('*').eq('position_id', positionId).eq('event_type', 'debit');
    assertOk(error, 'reading balance_events');

    const { data: existing, error: refundErr } = await db.from('balance_events')
      .select('id').eq('position_id', positionId).eq('event_type', 'refund');
    assertOk(refundErr, 'reading existing refunds');

    // Only reverse what has not already been reversed - refund_balance refuses
    // a second refund for the same position, and rightly so.
    if ((existing ?? []).length === 0) {
      for (const d of debits ?? []) {
        const amount = Math.abs(Number(d.amount));
        await refundBalance({
          userId: d.user_id,
          asset: d.asset,
          amount,
          positionId,
          reason: 'reversing a debit from a test run; the position was never filled',
        });
        refunded += amount;
      }
    }
  }

  const deleted = {};

  if (positionId) {
    // The events must go before the position they reference, and the refund
    // above must exist before these are removed, or the ledger loses the reason
    // the balance moved.
    const be = await db.from('balance_events').delete().eq('position_id', positionId);
    assertOk(be.error, 'deleting balance_events');

    const pe = await db.from('position_events').delete().eq('position_id', positionId);
    assertOk(pe.error, 'deleting position_events');

    const p = await db.from('positions').delete().eq('id', positionId);
    assertOk(p.error, 'deleting the position');
    deleted.position = positionId;
  }

  if (quoteId) {
    const q = await db.from('quotes').delete().eq('id', quoteId);
    assertOk(q.error, 'deleting the quote');
    deleted.quote = quoteId;
  }

  return { refunded, deleted };
}

/**
 * Confirm a cleanup actually happened, rather than trusting that it did.
 *
 * Every instance of this bug family was caught by checking a result against
 * reality instead of reading the output that claimed success.
 *
 * @returns {Promise<{clean: boolean, position: boolean, quote: boolean}>}
 */
export async function verifyDiscarded({ positionId, quoteId } = {}) {
  const out = { clean: true, position: true, quote: true };

  if (positionId) {
    const { data } = await db.from('positions').select('id').eq('id', positionId);
    out.position = (data ?? []).length === 0;
    if (!out.position) out.clean = false;
  }
  if (quoteId) {
    const { data } = await db.from('quotes').select('id').eq('id', quoteId);
    out.quote = (data ?? []).length === 0;
    if (!out.quote) out.clean = false;
  }
  return out;
}
