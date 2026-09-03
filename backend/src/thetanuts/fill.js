// Fill preparation (IMPLEMENT.md tasks 3.5, 3.6).
//
// ---------------------------------------------------------------------------
// prepareFill() BROADCASTS NOTHING. executeFill() SPENDS REAL USDC.
// ---------------------------------------------------------------------------
//
// prepareFill() takes a pending position, re-checks everything against the live
// book, and returns a bundle a broadcast would need. It is safe to run as often
// as you like. executeFill() is the one call in this file that spends money and
// it refuses to run without { confirmed: true }.
//
// The order of operations is fixed and must not be rearranged:
//
//   1. pre-flight checklist              (3.5b)
//   2. simulate with callStatic          (3.5, inside the checklist)
//   3. write the pending row             (3.6, done by the purchase path)
//   4. broadcast                         (3.7)
//   5. wait for confirmation             (3.7)
//   6. update the row                    (3.8)

import { getSigningClient, getWalletAddress } from './signer.js';
import { getBuyablePutOrders } from './orders.js';
import { runPreflight } from './preflight.js';
import { getPosition, transitionPosition } from '../db/positions.js';
import { getQuote } from '../db/quotes.js';
import { resolveFillFailure, extractUsdcSpent } from './fillOutcome.js';
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


/**
 * Close out a fill that was refused before anything was broadcast.
 *
 * ---------------------------------------------------------------------------
 * Only ever call this when NOTHING has been sent. See the guard below.
 * ---------------------------------------------------------------------------
 *
 * A refusal is a definite answer - the order was not on the book, so no
 * transaction existed to succeed or fail. That makes it safe to both mark the
 * position failed and return the user's money, which is NOT true of a timeout:
 * there the transaction may have landed, the position must go to
 * pending_verification, and the debit must stand until a human resolves it.
 * The two paths use different vocabulary on purpose.
 *
 * The refund is a compensating write, never a deletion. The debit stays in
 * balance_events with a refund beside it, so the ledger records that the user
 * was charged and made whole rather than pretending neither happened.
 *
 * @param {object} position - the pending position
 * @param {object} quote - its quote row
 * @param {string} reason - why the fill was refused, recorded on the event
 * @returns {Promise<{position: object|null, refunded: number}>}
 */
export async function failRefusedFill(position, quote, reason) {
  // A row that has a transaction hash has been broadcast. Marking it failed and
  // refunding would be the exact silent gap BR-14 exists to prevent.
  if (position.tx_hash) {
    throw new Error(
      `failRefusedFill: position ${position.id} already has tx ${position.tx_hash}. ` +
      'A broadcast position is never refused - resolve it against BaseScan.',
    );
  }

  let refunded = 0;
  try {
    refunded = await refundBalance({
      userId: position.user_id,
      asset: 'USDC',
      amount: Number(quote?.premium ?? 0),
      positionId: position.id,
      reason: `fill refused before broadcast: ${reason}`,
    });
  } catch (error) {
    // Fail loudly. A user left charged for protection they never received is
    // worse than a crash, and worse still if nothing says so.
    console.error(`[failRefusedFill] REFUND FAILED for position ${position.id}:`, error.message);
    throw error;
  }

  const updated = await transitionPosition(position.id, {
    toStatus: 'failed',
    // 'failed' rather than a new 'fill_refused' type: position_events has a
    // CHECK constraint listing the allowed types, and widening it needs a
    // migration. The distinction that matters - refused before broadcast, not
    // reverted after - is in the payload's broadcast:false.
    eventType: 'failed',
    payload: { reason, refunded_usdc: refunded, broadcast: false },
  });

  return { position: updated, refunded };
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
    //
    // Nothing was broadcast, so this is a definite answer: the money never
    // moved. The row must not stay at 'pending' - the dashboard renders that as
    // "Processing", which claims a purchase is in progress that will never
    // resolve, and Phase 4's scheduler would later meet an expired position
    // with no option address.
    const refused = await failRefusedFill(
      position, quote, 'the quoted order is no longer on the book',
    );

    return {
      ready: false,
      reason: 'the quoted order is no longer on the book — re-quote',
      position: refused.position ?? position,
      quote,
      liveOrder: null,
      preflight: null,
      refunded: refused.refunded,
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
    // BR-8b runs from when the quote was made, not from when it stopped being
    // displayable. Check 3 needs both: the window it enforces and the window
    // the user was shown.
    quoteCreatedAt: quote.created_at,
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

  // `quote` is destructured because the refund path needs it. It was omitted,
  // and `Number(quote?.premium ?? 0)` in the catch below was a ReferenceError
  // in EVERY execution - optional chaining guards a null value, never an
  // undeclared identifier. It surfaced the first time a fill failed for real.
  const { liveOrder, usdcAmountRaw, position, quote } = prepared;
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

  // Captured BEFORE the call so a failure can be told apart from a refusal:
  // an unchanged nonce proves nothing left the wallet. See resolveFillFailure.
  const wallet = getWalletAddress();
  let nonceBefore = null;
  try {
    nonceBefore = await client.provider.getTransactionCount(wallet, 'latest');
  } catch {
    // Unreadable here means resolveFillFailure cannot use the nonce and will
    // answer 'unknown' rather than 'not_sent'. Conservative, and correct.
    nonceBefore = null;
  }

  let result;
  try {
    // The amount is ALWAYS passed. fillOrder() with no amount fills the
    // maximum available, which would spend the whole wallet.
    result = await client.optionBook.fillOrder(liveOrder, usdcAmountRaw);
  } catch (error) {
    // ---------------------------------------------------------------------
    // THE ERROR'S OWN OPINION IS IGNORED. WE ASK THE CHAIN.
    // ---------------------------------------------------------------------
    //
    // The SDK maps every unrecognised Error to a ContractRevertError, so
    // `error.code === 'CONTRACT_REVERT'` is true for an RPC failure reading a
    // receipt. Trusting it on 3 Sep marked a successful fill as `failed`.
    const outcome = await resolveFillFailure({
      error, nonceBefore, wallet, provider: client.provider,
    });

    if (outcome.kind === 'succeeded') {
      // The fill WORKED and only the reporting broke. Carry on with the
      // receipt we just read: recording anything else would throw away a
      // position we own and have paid for.
      console.warn(
        `[fill] fillOrder threw but the transaction SUCCEEDED (${outcome.evidence}). ` +
        'Continuing with the on-chain receipt.',
      );
      result = { ...outcome.receipt, hash: outcome.txHash };
    } else if (outcome.kind === 'reverted' || outcome.kind === 'not_sent') {
      // Definite: either the receipt says status 0, or the nonce never moved.
      // Only these two justify a terminal state and a refund.
      await transitionPosition(positionId, {
        toStatus: 'failed',
        eventType: 'failed',
        payload: {
          error: String(error?.message ?? error).slice(0, 400),
          outcome: outcome.kind,
          evidence: outcome.evidence,
          txHash: outcome.txHash,
        },
      });

      // A COMPENSATING WRITE, never a deletion: the trail reads
      // debit -> fill failed -> refund. A debit that disappears looks like it
      // never happened, and "we cannot tell whether the user was charged" is
      // worse than either charging or not charging.
      try {
        const premium = Number(quote?.premium ?? 0);
        if (premium > 0) {
          await refundBalance({
            userId: position.user_id, asset: 'USDC', amount: premium,
            positionId, reason: `fill ${outcome.kind}; premium refunded`,
          });
        }
      } catch (refundError) {
        // Never swallowed: a refund that failed silently is a user charged for
        // nothing, and reconcile must be able to find it.
        console.error('[fill] REFUND FAILED for position', positionId, '-', refundError.message);
      }

      throw new Error(
        `fill ${outcome.kind}, nothing was bought (${outcome.evidence}): ${error?.message ?? error}`,
      );
    } else {
      // UNKNOWN. The transaction may have landed. The row stays at
      // pending_verification - written before the broadcast - and NOTHING is
      // refunded: crediting a user whose fill may have succeeded pays for the
      // option twice.
      throw new Error(
        `fill outcome UNKNOWN for position ${positionId} (${outcome.evidence}): ` +
        `${error?.message ?? error}
` +
        `The transaction may have landed. Position stays pending_verification. DO NOT RETRY — ` +
        `check https://basescan.org/address/${wallet} and resolve by hand.`,
      );
    }
  }

  // fillOrder's return shape differs between SDK versions; take the hash and
  // the option address from wherever they actually are rather than assuming.
  const txHash = result?.txHash ?? result?.hash ?? result?.transactionHash ?? null;
  const receipt = typeof result?.wait === 'function' ? await result.wait() : result;
  const optionAddress = result?.optionAddress ?? extractOptionAddress(receipt);

  // The real premium, read from the USDC that actually left the wallet, rather
  // than the figure we quoted. They should match; if they do not, the row
  // should record what happened, not what was expected.
  const premiumPaid = extractUsdcSpent(
    receipt, getWalletAddress(), client.chainConfig.tokens.USDC.address,
  ) ?? Number(usdcAmountRaw) / 1e6;

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
