// Positions (IMPLEMENT.md task 2.5).
//
// ---------------------------------------------------------------------------
// There is deliberately no bare update function in this module
// ---------------------------------------------------------------------------
//
// A position is never UPDATEd without a matching position_events row
// (docs/DATABASE.md, BR-19). Documenting that rule is not enough - the next
// caller, human or AI, will reach for the obvious `updatePosition()` and the
// audit trail will quietly grow holes at exactly the moments that matter.
//
// So the only mutator here is transitionPosition(), which calls a database
// function that writes the status change and the event in one transaction.
// Both happen or neither does. If you find yourself wanting a plain update,
// what you actually want is a new event type.

import { db, unwrap } from './client.js';

/**
 * Write a position before anything is broadcast (BR-14).
 *
 * The row exists first, deliberately: an interrupted transaction must leave a
 * traceable record rather than a silent gap. A position we can see and
 * reconcile is recoverable; one that was never written is not.
 *
 * The matching `created` event is written here too, so the history starts at
 * the same moment the row does.
 *
 * @param {object} position
 * @returns {Promise<object>} the inserted row
 */
export async function insertPendingPosition({
  userId,
  quoteId = null,
  asset,
  strike,
  strikeRaw,
  expiry,
  numContractsRaw,
  premiumPaid = null,
  // put or call. Defaulted rather than required because every position before
  // Phase 8 is a put - but a call MUST pass 'call' explicitly, or the interface
  // renders its strike as a protection floor above spot.
  optionType = 'put',
}) {
  const row = unwrap(
    await db.from('positions').insert({
      user_id: userId,
      quote_id: quoteId,
      status: 'pending',
      asset,
      strike,
      // 8 decimals, string - bigint beyond JS safe-integer range.
      strike_raw: String(strikeRaw),
      expiry,
      // 6 decimals: the scale fillOrder consumes, NOT the 18dp the payout
      // helpers take. Stored at fill scale so reconciliation against chain
      // state needs no rescaling (BR-36).
      num_contracts_raw: String(numContractsRaw),
      option_type: optionType,
      premium_paid: premiumPaid,
    }).select().single(),
    'insertPendingPosition',
  );

  unwrap(
    await db.from('position_events').insert({
      position_id: row.id,
      event_type: 'created',
      from_status: null,
      to_status: 'pending',
      payload: { quote_id: quoteId },
    }).select().single(),
    'insertPendingPosition: created event',
  );

  return row;
}

/**
 * Move a position to a new status and record why, in one transaction.
 *
 * The only way to change a position. Backed by the transition_position()
 * database function, which locks the row, refuses to modify a terminal
 * position (BR-19), applies only the fields this transition actually learned,
 * and writes the event.
 *
 * @param {string} positionId
 * @param {object} opts
 * @param {string} opts.toStatus - one of the seven position statuses
 * @param {string} opts.eventType - created|broadcast|confirmed|failed|settled|flagged
 * @param {object} [opts.payload] - tx receipt, error message, settlement data
 * @param {string} [opts.txHash]
 * @param {string} [opts.optionAddress]
 * @param {number} [opts.premiumPaid]
 * @param {string} [opts.numContractsRaw] - actual on-chain contracts, 6dp string
 * @param {number} [opts.settlementPrice]
 * @param {number} [opts.payout]
 * @param {string} [opts.settledAt]
 * @returns {Promise<object>} the updated row
 */
export async function transitionPosition(positionId, {
  toStatus,
  eventType,
  payload = null,
  txHash = null,
  optionAddress = null,
  premiumPaid = null,
  numContractsRaw = null,
  settlementPrice = null,
  payout = null,
  settledAt = null,
}) {
  return unwrap(
    await db.rpc('transition_position', {
      p_position_id: positionId,
      p_to_status: toStatus,
      p_event_type: eventType,
      p_payload: payload,
      // Addresses lowercase: mixed case breaks equality against chain data.
      p_tx_hash: txHash ? txHash.toLowerCase() : null,
      p_option_address: optionAddress ? optionAddress.toLowerCase() : null,
      p_premium_paid: premiumPaid,
      // The count that actually filled, so the row matches chain state (BR-36).
      // 6dp string; null keeps whatever the row already holds.
      p_num_contracts_raw: numContractsRaw === null ? null : String(numContractsRaw),
      p_settlement_price: settlementPrice,
      p_payout: payout,
      p_settled_at: settledAt,
    }).single(),
    `transitionPosition(${positionId} -> ${toStatus})`,
  );
}

/**
 * One position, or null.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getPosition(id) {
  return unwrap(
    await db.from('positions').select('*').eq('id', id).maybeSingle(),
    `getPosition(${id})`,
  );
}

/**
 * A user's positions, newest first. The dashboard query (UC-4).
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listPositionsByUser(userId) {
  return unwrap(
    await db.from('positions').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }),
    `listPositionsByUser(${userId})`,
  );
}

/**
 * Active positions that have passed their expiry. The scheduler's query (BR-11).
 * @param {Date} [now]
 * @returns {Promise<object[]>}
 */
export async function listPositionsDueForSettlement(now = new Date()) {
  return unwrap(
    await db.from('positions').select('*')
      .eq('status', 'active').lte('expiry', now.toISOString())
      .order('expiry', { ascending: true }),
    'listPositionsDueForSettlement',
  );
}

/**
 * A position's history, oldest first.
 * @param {string} positionId
 * @returns {Promise<object[]>}
 */
export async function listPositionEvents(positionId) {
  return unwrap(
    await db.from('position_events').select('*').eq('position_id', positionId)
      .order('created_at', { ascending: true }),
    `listPositionEvents(${positionId})`,
  );
}

/**
 * How many fills have been broadcast today (UTC). BR-34.
 *
 * Counts `broadcast` events rather than position rows. A row is written before
 * every attempt, including ones the pre-flight checklist then rejects - and a
 * rejected attempt spent nothing, so it must not consume the daily cap. What
 * the cap exists to bound is money leaving the wallet, and that is a broadcast.
 *
 * @param {Date} [now]
 * @returns {Promise<number>}
 */
export async function countFillsToday(now = new Date()) {
  const startOfDayUtc = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
  )).toISOString();

  const { count, error } = await db
    .from('position_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'broadcast')
    .gte('created_at', startOfDayUtc);

  if (error) throw new Error(`countFillsToday: ${error.message}`);
  return count ?? 0;
}

/**
 * Positions whose outcome is unknown.
 *
 * `pending_verification` does not mean the fill failed - it means we do not
 * know. The transaction may have landed. Any such row must be resolved against
 * chain state by a human before another fill is attempted, because filling
 * again would spend twice and create a second option nobody asked for.
 *
 * @returns {Promise<object[]>}
 */
export async function listUnresolvedPositions() {
  return unwrap(
    await db.from('positions').select('*')
      .eq('status', 'pending_verification')
      .order('created_at', { ascending: true }),
    'listUnresolvedPositions',
  );
}

/**
 * Every event for a set of positions, grouped by position id.
 *
 * One query rather than one per position. Ordered oldest first so callers can
 * take the earliest of a repeated event type without re-sorting - which
 * matters: a `confirmed` event can appear twice when a row is corrected after
 * the fill, and the first one is the purchase.
 *
 * @param {string[]} positionIds
 * @returns {Promise<Map<string, object[]>>}
 */
export async function listEventsForPositions(positionIds) {
  const out = new Map();
  if (!Array.isArray(positionIds) || positionIds.length === 0) return out;

  const rows = unwrap(
    await db.from('position_events')
      .select('position_id, event_type, created_at')
      .in('position_id', positionIds)
      .order('created_at', { ascending: true }),
    'listEventsForPositions',
  );

  for (const id of positionIds) out.set(id, []);
  for (const row of rows) out.get(row.position_id)?.push(row);
  return out;
}
