// Loan reads.
//
// Writes live in src/lending/ - disburse() creates the row before it moves
// money, and repay() closes it only after verifying a transaction. Keeping the
// writes there rather than here is deliberate: a loan row is not a record that
// may be edited freely, it is the trace of an irreversible transfer, and the
// rules that govern it belong beside the transfer.

import { db, unwrap } from './client.js';

/**
 * One loan, or null.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getLoan(id) {
  return unwrap(
    await db.from('loans').select('*').eq('id', id).maybeSingle(),
    `getLoan(${id})`,
  );
}

/**
 * A user's loans, newest first.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listLoansByUser(userId) {
  return unwrap(
    await db.from('loans').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }),
    `listLoansByUser(${userId})`,
  );
}

/**
 * Loans already backed by a given position.
 *
 * A position can only secure one loan: it is collateral, and lending against it
 * twice would be lending against something already pledged. The disburse
 * pre-flight owns that rule; this is what it asks.
 *
 * @param {string} positionId
 * @returns {Promise<object[]>}
 */
export async function listLoansByPosition(positionId) {
  return unwrap(
    await db.from('loans').select('*').eq('position_id', positionId),
    `listLoansByPosition(${positionId})`,
  );
}
