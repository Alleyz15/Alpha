// Settlement reading (IMPLEMENT.md tasks 4.1, 4.2, 4.4).
//
// ---------------------------------------------------------------------------
// This path uses the READ-ONLY client and cannot spend. That is structural.
// ---------------------------------------------------------------------------
//
// Settlement is automatic: the protocol pays the buyer through the factory's
// notifyTradeSettled callback, with no action from us (requirements.md UC-3,
// §7 Q3). option.payout() is deprecated and throws. So this module reads chain
// state and writes to our own database, and nothing else.
//
// Importing the signing client here would make spending a matter of
// remembering not to, rather than being impossible.

import { client } from '../thetanuts/client.js';
import { transitionPosition } from '../db/positions.js';

/** Expired this long without settling is worth a human looking at (BR-27). */
const graceHours = () => Number(process.env.SETTLEMENT_GRACE_HOURS ?? 6);

/**
 * The settlement price the protocol used, once an option has settled.
 *
 * `calculatePayout(addr, price)` does NOT read this - it echoes back whatever
 * price you hand it, so it is a what-if calculator, not a source of truth.
 * The real figure has to come from the option's own oracle.
 *
 * Sources are tried in order and the winner is recorded, because no settled
 * option existed to observe when this was written: ours is the first, and it
 * settles 2 Sep. Whichever source answers then is the one to keep.
 *
 * @param {string} optionAddress
 * @returns {Promise<{ price: bigint|null, source: string }>}
 */
async function readSettlementPrice(optionAddress) {
  // 1. The option's own TWAP consumer - the oracle the protocol settles on.
  try {
    const twap = await client.option.getTWAP(optionAddress);
    if (twap && BigInt(twap) > 0n) return { price: BigInt(twap), source: 'option.getTWAP' };
  } catch { /* fall through - reported via `source` rather than thrown */ }

  // 2. Whatever the full info surfaces once settled.
  try {
    const full = await client.option.getFullOptionInfo(optionAddress);
    const p = full?.settlementPrice ?? full?.settlement?.settlementPrice;
    if (p && BigInt(p) > 0n) return { price: BigInt(p), source: 'getFullOptionInfo' };
  } catch { /* fall through */ }

  return { price: null, source: 'unavailable' };
}

/**
 * Read one position's on-chain state. No writes, no transactions.
 *
 * @param {object} position - a row from the positions table
 * @returns {Promise<object>}
 */
export async function readSettlementState(position) {
  if (!position.option_address) {
    // A position with no option address never reached the chain. It cannot
    // settle and must not be treated as though it might.
    return { readable: false, reason: 'no option address on the row' };
  }

  const full = await client.option.getFullOptionInfo(position.option_address);
  const expired = Boolean(full.isExpired);
  const settled = Boolean(full.isSettled);

  let payoutUsdc = null;
  let settlementPrice = null;
  let priceSource = null;

  if (settled) {
    const found = await readSettlementPrice(position.option_address);
    priceSource = found.source;

    if (found.price !== null) {
      settlementPrice = Number(found.price) / 1e8;
      const result = await client.option.calculatePayout(position.option_address, found.price);
      payoutUsdc = Number(result.payout) / 1e6;
    }
  }

  const expiryMs = Number(full.info.expiry) * 1000;
  const hoursPastExpiry = (Date.now() - expiryMs) / 3_600_000;

  return {
    readable: true,
    expired,
    settled,
    payoutUsdc,
    settlementPrice,
    priceSource,
    hoursPastExpiry,
    // BR-31 verified against the chain rather than assumed: the option's buyer
    // should be our wallet, and our row should say the same size.
    buyer: full.buyer?.toLowerCase() ?? null,
    seller: full.seller?.toLowerCase() ?? null,
    numContractsOnChain: full.numContracts?.toString() ?? null,
    contractsMatch: full.numContracts?.toString() === position.num_contracts_raw,
  };
}

/**
 * Decide and apply the terminal status for one position.
 *
 * Every transition goes through transitionPosition, so the status change and
 * its event are written together or not at all - a settlement we cannot
 * account for later is barely better than one we missed.
 *
 * @param {object} position
 * @param {object} [opts]
 * @param {boolean} [opts.apply] - false to report without writing
 * @returns {Promise<object>} what was decided, and whether it was applied
 */
export async function settlePosition(position, { apply = false } = {}) {
  const state = await readSettlementState(position);

  if (!state.readable) {
    return { positionId: position.id, action: 'skip', reason: state.reason, applied: false };
  }

  if (!state.expired) {
    return { positionId: position.id, action: 'wait', reason: 'not yet expired', state, applied: false };
  }

  // Expired but the protocol has not settled it yet. Settlement is automatic
  // but NOT guaranteed - the protocol emits OptionSettlementFailed - so a
  // position that stays unsettled past the grace period is flagged rather than
  // silently left as active (BR-27).
  if (!state.settled) {
    if (state.hoursPastExpiry < graceHours()) {
      return {
        positionId: position.id,
        action: 'wait',
        reason: `expired ${state.hoursPastExpiry.toFixed(1)}h ago, settlement grace is ${graceHours()}h`,
        state,
        applied: false,
      };
    }

    const result = { positionId: position.id, action: 'needs_review', state, applied: false };
    if (apply) {
      await transitionPosition(position.id, {
        toStatus: 'needs_review',
        eventType: 'flagged',
        payload: {
          reason: 'expired and still unsettled past the grace period (BR-27)',
          hoursPastExpiry: state.hoursPastExpiry,
        },
      });
      result.applied = true;
    }
    return result;
  }

  // Settled, but we could not determine the price the protocol used, so we
  // cannot state a payout. Recording zero here would be a guess presented as a
  // fact - flag it and let a human read the chain.
  if (state.payoutUsdc === null) {
    const result = { positionId: position.id, action: 'needs_review', state, applied: false };
    if (apply) {
      await transitionPosition(position.id, {
        toStatus: 'needs_review',
        eventType: 'flagged',
        payload: { reason: 'settled on-chain but the settlement price could not be read', priceSource: state.priceSource },
      });
      result.applied = true;
    }
    return result;
  }

  // A put pays when the price finished below the floor. Above it, the
  // protection simply was not needed - which is a good outcome, not a failure,
  // and the interface says so (US-7).
  const toStatus = state.payoutUsdc > 0 ? 'settled' : 'expired_worthless';

  const result = { positionId: position.id, action: toStatus, state, applied: false };

  if (apply) {
    await transitionPosition(position.id, {
      toStatus,
      eventType: 'settled',
      settlementPrice: state.settlementPrice,
      payout: state.payoutUsdc,
      settledAt: new Date().toISOString(),
      payload: {
        priceSource: state.priceSource,
        buyerOnChain: state.buyer,
        contractsMatch: state.contractsMatch,
      },
    });
    result.applied = true;
  }

  return result;
}
