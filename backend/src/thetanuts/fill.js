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

import { getSigningClient, getWalletAddress } from './signer.js';
import { getBuyablePutOrders } from './orders.js';
import { runPreflight } from './preflight.js';
import { getPosition, transitionPosition } from '../db/positions.js';
import { getQuote } from '../db/quotes.js';
import { refundBalance } from '../db/balances.js';

/**
 * Decide which contract count to record after a fill.
 *
 * getFullOptionInfo().numContracts is assumed to be 6 decimals like
 * num_contracts_raw, but that scale is NOT independently verified. A fill
 * executes by USDC amount, so the actual count lands within a hair of the quoted
 * count; a value off by more than a small factor is a 10^12-style scale error,
 * not a fill difference. Such a value is refused in favour of the quoted count,
 * so a wrong-scale read can never silently overwrite the row - the exact trap
 * decimals.js exists to prevent.
 *
 * @param {string} quotedRaw - num_contracts_raw as quoted, 6dp string
 * @param {bigint|string|number|null} onChain - getFullOptionInfo().numContracts
 * @returns {{ recordedRaw: string|null, seen: string|null, accepted: boolean }}
 *   recordedRaw is what to pass to transitionPosition; null keeps the row's value
 */
export function pickRecordedContracts(quotedRaw, onChain) {
  if (onChain == null) return { recordedRaw: null, seen: null, accepted: false };

  let candidate;
  try {
    candidate = BigInt(onChain.toString());
  } catch {
    return { recordedRaw: null, seen: String(onChain), accepted: false };
  }

  const quoted = BigInt(quotedRaw);
  // Accept only within [quoted/2, quoted*2]. A real fill is ~exactly the quote;
  // a scale error is orders of magnitude out, so this band separates them.
  const withinScale = quoted > 0n && candidate * 2n >= quoted && candidate <= quoted * 2n;

  return {
    recordedRaw: withinScale ? candidate.toString() : null,
    seen: candidate.toString(),
    accepted: withinScale,
  };
}

/**
 * Find the order we quoted, as it stands on the book right now.
 *
 * ---------------------------------------------------------------------------
 * Matched on ECONOMICS, not on the signature. Measured 1 Sep:
 * ---------------------------------------------------------------------------
 *
 * The book is re-signed WHOLESALE every ~60 seconds - 100% of signatures
 * replaced at once, not staggered. Across 320 orders every signature lived
 * exactly 35.645 seconds, identical to three decimals: one event, not a
 * distribution.
 *
 * So matching on the signature meant a quote was fillable for at most 60
 * seconds and on average 30, depending only on where in the refresh cycle it
 * happened to land. Two integration fills in a row were refused on exactly
 * that. The three that succeeded did so because scripts/fill.js quotes and
 * fills in one process, inside six seconds.
 *
 * The same orders come back after the refresh. Measured across one refresh:
 * 311 of 311 economically identical orders persisted, none disappeared, and
 * 305 of them came back at a slightly different price - median 0.515%.
 *
 * So we match the ECONOMIC order and let the existing price guard handle the
 * drift. This is not a new guard: pre-flight check 4 already re-verifies the
 * price against PRICE_TOLERANCE_PCT with validateBuySlippage, and check 5
 * re-verifies strike and expiry. We are pointing an existing guard at the
 * right thing, not loosening anything.
 *
 * ALL FIVE fields must match - maker, strike, expiry, type and side. A partial
 * match is refused rather than approximated: the 105% price outlier in that
 * sample is exactly what the slippage check would catch, and relying on the
 * second line of defence for something the first can rule out is how a guard
 * ends up being the only thing standing between a quote and the wrong order.
 *
 * @param {string} asset
 * @param {object} snapshot - the stored order_snapshot
 * @returns {Promise<object|null>} the live OrderWithSignature, or null if gone
 */
export async function findLiveOrder(asset, snapshot) {
  const want = snapshot?.order;
  if (!want) return null;

  const live = await getBuyablePutOrders(asset);

  // Fast path: the signature is still current, so nothing has been re-signed
  // since the quote. Identical to the old behaviour when it applies.
  const exact = live.find((o) => o.signature === snapshot.signature);
  if (exact) return exact;

  // Otherwise find the same economic order, re-signed. All five or nothing.
  const matches = live.filter((o) =>
    (o.order.maker ?? '').toLowerCase() === (want.maker ?? '').toLowerCase() &&
    o.order.strikePrice.toString() === want.strikePrice?.toString() &&
    o.order.expiry.toString() === want.expiry?.toString() &&
    o.rawApiData?.isCall === (snapshot.rawApiData?.isCall ?? false) &&
    o.order.isBuyer === want.isBuyer);

  // More than one identical order from the same maker at the same strike,
  // expiry, type and side should not happen. If it does, we cannot say which
  // one was quoted, so we refuse rather than pick.
  if (matches.length !== 1) return null;

  return matches[0];
}

