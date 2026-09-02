// Turning a positions row into what the dashboard renders.
//
// ---------------------------------------------------------------------------
// Pure. Imports nothing that needs credentials, so it can be tested.
// ---------------------------------------------------------------------------
//
// This lives apart from routes.js for the reason SETUP.md records: routes.js
// imports the database client at module load, so anything defined inside it
// cannot be imported by a test. The decisions here are small but they are
// decisions - which field is null, which word describes the money - and both
// were wrong on screen before they were written down.

/**
 * A put strike is a floor; a call strike is a threshold.
 *
 * The dashboard rendered a vault call as "Protection floor $2,680" - a floor
 * ABOVE spot - because there was one strike field and it was always populated.
 * Returning null for the field that does not apply makes the wrong label
 * impossible to render rather than merely discouraged.
 *
 * @param {'put'|'call'} optionType
 * @param {number} strike
 */
export function strikeView(optionType, strike) {
  const isCall = optionType === 'call';
  return {
    optionType,
    // What the position is FOR, so the interface can branch on intent rather
    // than on an options term (BR-3).
    role: isCall ? 'upside' : 'protection',
    protectionFloorUsdc: isCall ? null : Number(strike),
    upsideThresholdUsdc: isCall ? Number(strike) : null,
  };
}

/**
 * What happened to the user's money.
 *
 *   none      never charged - bought by the operator before user payment
 *             existed, or never debited
 *   held      charged, nothing broadcast. The money has not left the custodial
 *             wallet, so the interface must not say "paid"
 *   paid      charged and filled on chain
 *   refunded  charged and compensated. The debit stays in the ledger with the
 *             refund beside it - a reversal is a write, never a deletion
 *
 * `failed` on the position says the purchase did not happen. It does not say
 * whether the user was charged, or refunded, which is why the dashboard had
 * nothing to show but "Payment status unavailable". The difference between "we
 * lost your order" and "we lost your order and gave your money back" is the
 * whole of it.
 *
 * @param {{chargedUsdc:number, refundedUsdc:number}|undefined} totals
 * @param {{tx_hash:string|null}} position
 */
export function paymentView(totals, position) {
  const charged = Number(totals?.chargedUsdc ?? 0);
  const refunded = Number(totals?.refundedUsdc ?? 0);

  let paymentStatus;
  if (charged === 0) paymentStatus = 'none';
  else if (refunded > 0) paymentStatus = 'refunded';
  else paymentStatus = position?.tx_hash ? 'paid' : 'held';

  return { paymentStatus, chargedUsdc: charged, refundedUsdc: refunded };
}

/**
 * Sum a position's balance events into charged and refunded totals.
 *
 * Debits are stored negative and refunds positive, so both are taken by
 * absolute value against their own event type rather than summed together -
 * adding them would net to zero for a refunded position and lose the fact that
 * the user was ever charged.
 *
 * @param {object[]} events - balance_events rows for ONE position
 */
export function sumPayments(events) {
  const charged = (events ?? [])
    .filter((e) => e.event_type === 'debit')
    .reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);

  const refunded = (events ?? [])
    .filter((e) => e.event_type === 'refund')
    .reduce((sum, e) => sum + Math.abs(Number(e.amount)), 0);

  return {
    chargedUsdc: Math.round(charged * 1e6) / 1e6,
    refundedUsdc: Math.round(refunded * 1e6) / 1e6,
  };
}

/**
 * How far a position got through EXECUTION.
 *
 * ---------------------------------------------------------------------------
 * BROADCAST IS NOT CONFIRMED. That distinction is the point of this function.
 * ---------------------------------------------------------------------------
 *
 * The existing `fill` field says 'onchain' whenever a tx_hash exists, which
 * conflates two different states: we sent a transaction, and we verified it
 * landed. Between them sits `pending_verification` - a hash exists and the
 * outcome is unknown - which is precisely the state that must never be shown as
 * a settled fact.
 *
 *   requested   the row exists, nothing was sent
 *   broadcast   a transaction exists; confirmation is NOT established
 *   confirmed   we saw a receipt with status 1 and wrote a `confirmed` event
 *   failed      it will not happen
 *
 * Execution is a separate axis from settlement. A position that expired
 * worthless still executed: it stays `confirmed` here, and its outcome lives in
 * `status`.
 *
 * @param {object} position - a positions row
 * @param {object[]} events - that position's position_events
 */
export function executionView(position, events = []) {
  const has = (type) => events.some((e) => e.event_type === type);

  let executionState;
  if (position.status === 'failed') executionState = 'failed';
  else if (has('confirmed')) executionState = 'confirmed';
  else if (position.tx_hash || has('broadcast')) executionState = 'broadcast';
  else executionState = 'requested';

  // Only a confirmed event establishes this. A hash proves a transaction was
  // sent, not that it succeeded - the frontend gates the BaseScan link on it.
  const verifiedOnChain = executionState === 'confirmed';

  // The EARLIEST confirmed event. Two positions carry a second one from later
  // corrections - a premium adjustment and a contract-count alignment - and
  // taking the last would report a correction as the moment of purchase.
  const confirmedAt = events
    .filter((e) => e.event_type === 'confirmed')
    .map((e) => e.created_at)
    .sort()[0] ?? null;

  return {
    executionState,
    verifiedOnChain,
    // When the user asked, and when it actually happened. Different questions,
    // and for an operator-executed fill they can be minutes or hours apart.
    createdAt: position.created_at,
    purchasedAt: confirmedAt,
    // The quote this came from. NULL for positions bought by script rather than
    // through the API - the two vault calls. NEVER substitute the position id:
    // they are different records and conflating them would make an order id
    // that resolves to nothing.
    orderId: position.quote_id ?? null,
  };
}

/**
 * The event trail, safe to send to a browser.
 *
 * ---------------------------------------------------------------------------
 * PAYLOADS ARE NEVER RETURNED. Name and timestamp only.
 * ---------------------------------------------------------------------------
 *
 * position_events payloads carry RPC error text, signed order fields, gas and
 * block data, provider names and internal reasons. None of it belongs in a
 * response, and the risk is not hypothetical: the `broadcast` payload contains
 * the raw order the fill was built from.
 *
 * Internal event names are mapped to interface names as well, so renaming an
 * event type later is not a breaking API change.
 */
const TIMELINE_NAMES = Object.freeze({
  created: 'requested',
  broadcast: 'operator_execution',
  confirmed: 'confirmed_onchain',
  settled: 'settled',
  failed: 'failed',
  flagged: 'needs_review',
});

/**
 * @param {object[]} events - position_events rows
 * @returns {Array<{event:string, at:string}>} oldest first
 */
export function timelineView(events = []) {
  return [...events]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map((e) => ({
      event: TIMELINE_NAMES[e.event_type] ?? e.event_type,
      at: e.created_at,
    }));
}

/**
 * A money field that may be absent: null stays null, never 0.
 *
 * ---------------------------------------------------------------------------
 * ABSENT IS NOT ZERO. Third instance of the same mistake.
 * ---------------------------------------------------------------------------
 *
 *   a call's protection floor    rendered "$2,680 floor" for a threshold
 *   the CoinGecko overview       an omitted coin rendered as $0 market cap
 *   premiumPaidUsdc              a missing premium rendered "$0.00", which
 *                                says the protection was free
 *
 * Each was a null converted to a number so that something would render. The
 * rendering is the interface's problem: given null it can say "not charged",
 * "unavailable", or nothing at all. Given 0 it can only say zero, and zero is a
 * claim - about a floor, a market cap, or a price the user paid.
 *
 * Kept as a named function rather than a ternary at each call site so the rule
 * has somewhere to live and a test can hold it.
 *
 * @param {number|string|null|undefined} value
 * @returns {number|null}
 */
export function usdcOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
