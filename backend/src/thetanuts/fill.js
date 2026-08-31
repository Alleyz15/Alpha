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
 * Broadcast a fill (IMPLEMENT.md tasks 3.7, 3.8, 3.9).
 *
 * ---------------------------------------------------------------------------
 * THIS SPENDS REAL USDC ON A TRANSACTION THAT CANNOT BE UNDONE.
 * ---------------------------------------------------------------------------
 *
 * Strike, expiry, contract count and premium are permanent once it confirms.
 * The only remedies for a wrong fill are waiting for expiry or buying again.
 *
 * The order of operations is fixed:
 *
 *   1. pre-flight checklist must pass, or nothing happens
 *   2. move the row to pending_verification BEFORE the call
 *   3. broadcast
 *   4. on receipt   -> active, with the hash, option address and real premium
 *      on revert    -> failed
 *      on anything else, including a timeout -> LEAVE IT at
 *                      pending_verification and stop
 *
 * Step 2 looks pessimistic and is deliberate. fillOrder() waits for its own
 * receipt, so between submission and return there is a window in which the
 * transaction may have landed and this process may die. A row that already
 * says "outcome unknown" is recoverable; one that still says `pending` looks
 * like nothing was attempted.
 *
 * @param {string} positionId - a `pending` position
 * @param {object} [opts]
 * @param {boolean} [opts.confirmed] - must be true; a guard against calling this by accident
 * @returns {Promise<object>}
 */
export async function executeFill(positionId, { confirmed = false } = {}) {
  if (!confirmed) {
    throw new Error(
      'executeFill requires { confirmed: true }. This spends real USDC and cannot be undone.',
    );
  }

  const prepared = await prepareFill(positionId);

  if (!prepared.ready) {
    throw new Error(
      `executeFill refused: ${prepared.reason}. ` +
      'Every pre-flight item must pass before anything is broadcast.',
    );
  }

  const { liveOrder, usdcAmountRaw, position } = prepared;
  const client = getSigningClient();

  // Outcome unknown from here until the receipt says otherwise.
  await transitionPosition(positionId, {
    toStatus: 'pending_verification',
    eventType: 'broadcast',
    payload: {
      usdcAmountRaw: usdcAmountRaw.toString(),
      strikeRaw: liveOrder.order.strikePrice.toString(),
      expiry: liveOrder.order.expiry.toString(),
      contractsRaw: position.num_contracts_raw,
      submittedAt: new Date().toISOString(),
    },
  });

  let result;
  try {
    // The amount is ALWAYS passed. fillOrder() with no amount fills the
    // maximum available, which would spend the whole wallet.
    result = await client.optionBook.fillOrder(liveOrder, usdcAmountRaw);
  } catch (error) {
    // A revert is a definite answer: nothing was bought, nothing was charged.
    const reverted = error?.code === 'CONTRACT_REVERT' ||
      error?.code === 'CALL_EXCEPTION' ||
      /revert/i.test(error?.message ?? '');

    if (reverted) {
      await transitionPosition(positionId, {
        toStatus: 'failed',
        eventType: 'failed',
        payload: { error: String(error?.message ?? error).slice(0, 500) },
      });

      // The fill definitively did not happen, so the user must be made whole.
      // A COMPENSATING WRITE, never a deletion: the trail reads
      // debit -> fill failed -> refund. A debit that disappears looks like it
      // never happened, and "we cannot tell whether the user was charged" is
      // worse than either charging or not charging.
      //
      // Only on a revert. A TIMEOUT must NOT refund - see below.
      try {
        const premium = Number(quote?.premium ?? 0);
        if (premium > 0) {
          await refundBalance({
            userId: position.user_id, asset: 'USDC', amount: premium,
            positionId, reason: 'fill reverted; premium refunded',
          });
        }
      } catch (refundError) {
        // Never swallowed: a refund that failed silently is a user charged for
        // nothing, and reconcile must be able to find it.
        console.error('[fill] REFUND FAILED for position', positionId, '-', refundError.message);
      }

      throw new Error(`fill reverted, nothing was bought: ${error?.message ?? error}`);
    }

    // Anything else - a timeout, a dropped connection - is NOT an answer. The
    // transaction may have landed. Retrying would spend twice and create a
    // second option nobody asked for, so the row stays at
    // pending_verification and a human resolves it against chain state.
    throw new Error(
      `fill outcome UNKNOWN for position ${positionId}: ${error?.message ?? error}\n` +
      `The transaction may have landed. Position is pending_verification. DO NOT RETRY — ` +
      `check https://basescan.org/address/${getWalletAddress()} and resolve by hand.`,
    );
  }

  // fillOrder's return shape differs between SDK versions; take the hash and
  // the option address from wherever they actually are rather than assuming.
  const txHash = result?.txHash ?? result?.hash ?? result?.transactionHash ?? null;
  const receipt = typeof result?.wait === 'function' ? await result.wait() : result;
  const optionAddress = result?.optionAddress ?? extractOptionAddress(receipt);

  // The real premium, read from the USDC that actually left the wallet, rather
  // than the figure we quoted. They should match; if they do not, the row
  // should record what happened, not what was expected.
  const premiumPaid = extractUsdcSpent(receipt, getWalletAddress()) ?? Number(usdcAmountRaw) / 1e6;

  // The count that actually filled. A fill executes by USDC amount, so it can
  // land a hair off the quoted count; read the authoritative on-chain size so
  // the row matches chain state (BR-36, BR-40). Best effort: if the read fails
  // (e.g. RPC down) keep the quoted value - reconcile will flag any divergence
  // rather than this blocking a fill that already succeeded. pickRecordedContracts
  // also refuses a wrong-scale value, so a 10^12 error cannot overwrite the row.
  let actualContractsRaw = null;
  let contractsSeen = null;
  if (optionAddress) {
    try {
      const info = await client.option.getFullOptionInfo(optionAddress);
      const decided = pickRecordedContracts(position.num_contracts_raw, info?.numContracts ?? null);
      actualContractsRaw = decided.recordedRaw;
      contractsSeen = decided.seen;
      if (contractsSeen && !decided.accepted) {
        console.warn(
          `[fill] on-chain numContracts ${contractsSeen} is off from the quoted ` +
          `${position.num_contracts_raw} by more than 2x — keeping the quoted count. ` +
          `Verify the scale of getFullOptionInfo().numContracts.`,
        );
      }
    } catch {
      // leave null -> the transition keeps the quoted num_contracts_raw
    }
  }

  await transitionPosition(positionId, {
    toStatus: 'active',
    eventType: 'confirmed',
    txHash,
    optionAddress,
    premiumPaid,
    numContractsRaw: actualContractsRaw,
    payload: {
      blockNumber: receipt?.blockNumber ?? null,
      gasUsed: receipt?.gasUsed?.toString() ?? null,
      status: receipt?.status ?? null,
      quotedContractsRaw: position.num_contracts_raw,
      onChainContractsSeen: contractsSeen,
      recordedContractsRaw: actualContractsRaw ?? position.num_contracts_raw,
    },
  });

  return {
    positionId,
    txHash,
    optionAddress,
    premiumPaid,
    explorerUrl: txHash ? `https://basescan.org/tx/${txHash}` : null,
    receipt,
  };
}

/** ERC20 Transfer(address,address,uint256) */
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * The USDC that actually left the wallet, from the receipt's Transfer logs.
 * Returns null if it cannot be determined - the caller falls back to the
 * quoted figure rather than recording a wrong one.
 */
function extractUsdcSpent(receipt, fromAddress) {
  try {
    const usdc = getSigningClient().chainConfig.tokens.USDC.address.toLowerCase();
    const from = fromAddress.toLowerCase().slice(2).padStart(64, '0');

    // SUM every outgoing transfer, not just the first. A fill moves USDC out
    // twice: the premium to the maker, and a protocol fee to the OptionBook.
    // Recording only the premium understates what the position cost - the
    // indexer's entryPrice is the total, and the row should agree with it.
    let total = 0n;
    let found = false;

    for (const log of receipt?.logs ?? []) {
      if (log.address?.toLowerCase() !== usdc) continue;
      if (log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
      if (log.topics?.[1]?.toLowerCase().slice(2) !== from) continue;
      total += BigInt(log.data);
      found = true;
    }

    if (found) return Number(total) / 1e6;
  } catch {
    // Deliberately quiet: this is a nicety, and failing to parse a log must
    // never take down a fill that already succeeded.
  }
  return null;
}

/**
 * The option contract created by this fill. Best effort: the first address
 * that appears as a log emitter and is not a token we already know.
 */
function extractOptionAddress(receipt) {
  try {
    const known = new Set(
      Object.values(getSigningClient().chainConfig.tokens ?? {})
        .map((t) => t.address.toLowerCase())
        .concat(Object.values(getSigningClient().chainConfig.contracts ?? {}).map((a) => a.toLowerCase())),
    );

    for (const log of receipt?.logs ?? []) {
      const address = log.address?.toLowerCase();
      if (address && !known.has(address)) return address;
    }
  } catch {
    // Same reasoning as above.
  }
  return null;
}

/** Re-exported so callers do not need to reach past this module. */
export { getSigningClient };
