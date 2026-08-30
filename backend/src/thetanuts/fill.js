// Fill preparation (IMPLEMENT.md tasks 3.5, 3.6).
//
// ---------------------------------------------------------------------------
// NOTHING HERE BROADCASTS. There is no executeFill() yet, on purpose.
// ---------------------------------------------------------------------------
//
// prepareFill() takes a pending position, re-checks everything against the live
// book, and returns a bundle a broadcast would need. Task 3.7 adds the single
// call that spends money; until then this path is safe to run as often as you
// like.
//
// The order of operations is fixed and must not be rearranged:
//
//   1. pre-flight checklist              (3.5b)
//   2. simulate with callStatic          (3.5, inside the checklist)
//   3. write the pending row             (3.6, done by the purchase path)
//   4. broadcast                         (3.7 - not implemented)
//   5. wait for confirmation             (3.7)
//   6. update the row                    (3.8)

import { getSigningClient } from './signer.js';
import { getBuyablePutOrders } from './orders.js';
import { runPreflight } from './preflight.js';
import { getPosition } from '../db/positions.js';
import { getQuote } from '../db/quotes.js';

/**
 * Find the order we quoted, as it stands on the book right now.
 *
 * The stored `order_snapshot` is the audit record of what we intended to buy,
 * but it is JSON: every bigint in it was serialised to a string. Rehydrating
 * those is exactly the class of scale bug decimals.js exists to prevent, and
 * getting one wrong here spends real money on the wrong size.
 *
 * So the live object is used for the fill and the snapshot is used to verify
 * it is the same order - matched on the maker's signature, which is unique to
 * a signed order and cannot collide.
 *
 * @param {string} asset
 * @param {object} snapshot - the stored order_snapshot
 * @returns {Promise<object|null>} the live OrderWithSignature, or null if gone
 */
export async function findLiveOrder(asset, snapshot) {
  const signature = snapshot?.signature;
  if (!signature) return null;

  const live = await getBuyablePutOrders(asset);
  return live.find((o) => o.signature === signature) ?? null;
}

/**
 * Prepare a fill for a pending position: verify everything, broadcast nothing.
 *
 * @param {string} positionId
 * @returns {Promise<object>} { ready, position, quote, liveOrder, preflight }
 */
export async function prepareFill(positionId) {
  const position = await getPosition(positionId);
  if (!position) {
    throw new Error(`prepareFill: position ${positionId} not found`);
  }
  if (position.status !== 'pending') {
    throw new Error(
      `prepareFill: position ${positionId} is '${position.status}', not 'pending'. ` +
      'Only a pending position may be filled.',
    );
  }

  const quote = position.quote_id ? await getQuote(position.quote_id) : null;
  if (!quote) {
    throw new Error(`prepareFill: position ${positionId} has no quote row to verify against`);
  }

  const liveOrder = await findLiveOrder(position.asset, quote.order_snapshot);

  if (!liveOrder) {
    // BR-44: an option must be fillable at the moment it is offered. A signed
    // order that has left the book cannot be filled at any price, and there is
    // nothing to simulate.
    return {
      ready: false,
      reason: 'the quoted order is no longer on the book — re-quote',
      position,
      quote,
      liveOrder: null,
      preflight: null,
    };
  }

  const usdcAmountRaw = BigInt(Math.round(Number(quote.premium) * 1e6));

  // The price and strike AS QUOTED come from the snapshot, not from the live
  // order. Reading them off the live order would compare it against itself and
  // checks 4 and 5 would pass unconditionally - a check that cannot fail is
  // worse than no check, because it looks like coverage.
  const snapshotOrder = quote.order_snapshot?.order ?? {};

  const preflight = await runPreflight({
    positionId,
    liveOrder,
    quotedPriceRaw: BigInt(snapshotOrder.price ?? liveOrder.order.price),
    quotedStrikeRaw: BigInt(snapshotOrder.strikePrice ?? position.strike_raw),
    quotedExpiryUnix: Number(snapshotOrder.expiry ?? Math.floor(new Date(quote.expiry).getTime() / 1000)),
    usdcAmountRaw,
    contractsRaw: BigInt(position.num_contracts_raw),
    quoteValidUntil: quote.valid_until,
  });

  return {
    ready: preflight.pass,
    reason: preflight.pass ? null : 'pre-flight checklist failed',
    position,
    quote,
    liveOrder,
    usdcAmountRaw,
    preflight,
  };
}

/**
 * Task 3.7. Deliberately not implemented.
 *
 * Adding it means the next call to this module can spend real USDC on a
 * transaction that cannot be undone. It is a separate, deliberate step.
 */
export async function executeFill() {
  throw new Error(
    'executeFill is not implemented. Broadcasting is task 3.7 and has not been approved yet — ' +
    'see docs/IMPLEMENT.md Phase 3.',
  );
}

/** Re-exported so callers do not need to reach past this module. */
export { getSigningClient };
