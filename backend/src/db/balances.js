// Balances (IMPLEMENT.md task 2.5, 2.7).
//
// Seeded holdings, never deposits (BR-50). BR-49 caps every quote by the
// balance recorded here: protection is only ever quoted against something the
// system has a record of, or it stops being insurance and becomes a bet.

import { db, unwrap } from './client.js';

/**
 * Every asset balance for one user.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listBalances(userId) {
  return unwrap(
    await db.from('balances').select('*').eq('user_id', userId).order('asset'),
    `listBalances(${userId})`,
  );
}

/**
 * One user's holding of one asset, or null if they hold none.
 *
 * Returns the row rather than the number so the caller can see `source` and
 * state that the holding is simulated (BR-51).
 *
 * @param {string} userId
 * @param {string} asset
 * @returns {Promise<object|null>}
 */
export async function getBalance(userId, asset) {
  return unwrap(
    await db.from('balances').select('*').eq('user_id', userId).eq('asset', asset).maybeSingle(),
    `getBalance(${userId}, ${asset})`,
  );
}

/**
 * How much of an asset a user holds, as a NUMBER.
 *
 * ---------------------------------------------------------------------------
 * getBalance RETURNS A ROW. THIS RETURNS THE AMOUNT.
 * ---------------------------------------------------------------------------
 *
 * `Number(await getBalance(...))` is NaN, because a row object is not a number.
 * NaN compares false to everything, so a guard written that way answers "no"
 * to `held >= amount` AND "no" to `held < amount` - it never fires, in the
 * permissive direction. That shipped in the vault deposit endpoint and was
 * caught by a live request for 999999 USDC coming back 202.
 *
 * A missing row means the user holds none of that asset, which is a genuine
 * zero rather than an absence - unlike a price or a premium, where zero would
 * be a claim.
 *
 * @param {string} userId
 * @param {string} asset
 * @returns {Promise<number>}
 */
export async function getBalanceAmount(userId, asset) {
  const row = await getBalance(userId, asset);
  const amount = Number(row?.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Charge a user for a purchase. Atomic: the check and the decrement happen
 * together or not at all.
 *
 * Debit BEFORE the fill, for the same reason BR-14 writes the position row
 * before broadcasting. A fill that spends against a balance we never reserved
 * is unrecoverable; a debit with no fill is visible and reversible.
 *
 * @param {object} args
 * @returns {Promise<number>} the balance remaining
 * @throws {Error} code INSUFFICIENT_BALANCE when the user cannot cover it
 */
export async function debitBalance({ userId, asset, amount, positionId = null, reason = null }) {
  const { data, error } = await db.rpc('debit_balance', {
    p_user_id: userId,
    p_asset: asset,
    p_amount: amount,
    p_position_id: positionId,
    p_reason: reason,
  });

  if (error) {
    const err = new Error(error.message);
    // The database raises INSUFFICIENT_BALANCE; surface it as a code the API
    // layer can map without parsing prose.
    err.code = /INSUFFICIENT_BALANCE/.test(error.message) ? 'INSUFFICIENT_BALANCE' : error.code;
    throw err;
  }
  return Number(data);
}

/**
 * Make a user whole after a purchase that did not happen.
 *
 * A COMPENSATING WRITE, never a deletion. The trail must read
 * debit -> refund, because a debit that disappears looks like it never
 * happened, and "we cannot tell whether the user was charged" is worse than
 * either charging or not charging.
 *
 * Refuses a second refund for the same position - a compensating write that
 * can run twice is a way to mint balance.
 */
export async function refundBalance({ userId, asset, amount, positionId = null, reason = null }) {
  const { data, error } = await db.rpc('refund_balance', {
    p_user_id: userId,
    p_asset: asset,
    p_amount: amount,
    p_position_id: positionId,
    p_reason: reason,
  });
  if (error) throw new Error(`refundBalance: ${error.message}`);
  return Number(data);
}

/**
 * The money trail for one user, newest first.
 */
export async function listBalanceEvents(userId, asset = null, limit = 50) {
  let q = db.from('balance_events').select('*').eq('user_id', userId);
  if (asset) q = q.eq('asset', asset);
  return unwrap(await q.order('created_at', { ascending: false }).limit(limit), 'listBalanceEvents');
}

/**
 * Debits whose fill never confirmed.
 *
 * The operator model means the debit lands at purchase while the fill happens
 * minutes later by hand, so this window is real and deliberate. It is not
 * engineered around; it is surfaced, by the same command that surfaces every
 * other unresolved state.
 *
 *   position pending / pending_verification -> payment HELD, correctly
 *   position failed, no refund yet          -> REFUND DUE
 *
 * "held" is the balance-side word for pending_verification's "we do not know".
 * Deliberately not a second vocabulary.
 *
 * @returns {Promise<{held: object[], refundDue: object[]}>}
 */
export async function findStandingDebits() {
  const { data, error } = await db
    .from('balance_events')
    .select('*, positions!inner(id, status)')
    .eq('event_type', 'debit')
    .not('position_id', 'is', null);

  if (error) throw new Error(`findStandingDebits: ${error.message}`);

  const refunded = new Set(
    unwrap(await db.from('balance_events').select('position_id').eq('event_type', 'refund'),
      'findStandingDebits: refunds')
      .map((r) => r.position_id),
  );

  const held = [];
  const refundDue = [];

  for (const row of data ?? []) {
    const status = row.positions?.status;
    if (refunded.has(row.position_id)) continue;
    if (status === 'failed') refundDue.push({ ...row, positionStatus: status });
    else if (status === 'pending' || status === 'pending_verification') {
      held.push({ ...row, positionStatus: status });
    }
  }

  return { held, refundDue };
}

/**
 * Balance events for a set of positions, in one query.
 *
 * The money trail is the only place a refund is recorded. `positions.status`
 * says 'failed', which is not the same as saying the user got their money back
 * - and an interface with only the status has nothing to render but "payment
 * status unavailable".
 *
 * @param {string[]} positionIds
 * @returns {Promise<object[]>}
 */
export async function listBalanceEventsForPositions(positionIds) {
  if (!Array.isArray(positionIds) || positionIds.length === 0) return [];

  const { data, error } = await db
    .from('balance_events')
    .select('position_id, event_type, amount, asset')
    .in('position_id', positionIds);

  if (error) throw new Error(`listBalanceEventsForPositions: ${error.message}`);
  return data ?? [];
}
