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
