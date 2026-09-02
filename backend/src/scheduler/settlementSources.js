// Where the settlement figures come from (IMPLEMENT.md 8.6 follow-up).
//
// ---------------------------------------------------------------------------
// READ WHAT HAPPENED, do not recompute what should have happened.
// ---------------------------------------------------------------------------
//
// The original two sources were both broken, and neither failure could be seen
// until an option actually settled - which none had, because ours are the first.
//
//   option.getTWAP(addr)          REVERTS on an unsettled option:
//                                 "execution reverted: TWAP calculation ...".
//                                 VERIFIED WORKING after settlement, 2 Sep
//                                 2026: it returned $2,421.92256872 for the
//                                 first option this project held to expiry,
//                                 and is what recorded that settlement. The
//                                 note here previously said its post-settlement
//                                 behaviour was unknown. It is now known.
//
//   full.settlementPrice          DEAD. getFullOptionInfo returns exactly
//   full.settlement.              { info, buyer, seller, isExpired, isSettled,
//     settlementPrice               numContracts, collateralAmount }. There is
//                                 no settlementPrice field and no .settlement
//                                 object, so this expression could only ever
//                                 evaluate to undefined. It was written against
//                                 a shape that does not exist and survived
//                                 because nothing ever reached the code path.
//
// So this module adds sources that report the event rather than deriving it:
//
//   OptionPayout event    amountPaidOut - what the protocol ACTUALLY transferred
//                         to the buyer. No oracle, no arithmetic, no assumption.
//   OptionExpired event   settlementPrice (8dp), recorded by the protocol at
//                         expiry.
//   the indexer           Thetanuts' own index of our positions. One HTTP call,
//                         no block-range limit.
//
// ---------------------------------------------------------------------------
// THE FAIL-SAFE IS UNCHANGED, DELIBERATELY.
// ---------------------------------------------------------------------------
//
// Every function here returns null when it does not know. None of them guesses,
// and none of them returns zero to mean "could not read". settlement.js still
// flags `needs_review` when the payout is unknown, because recording zero would
// be a guess presented as a fact. More sources make the good path more likely to
// fire; they must never make the bad path quieter.

// The SDK client is resolved at CALL time, not imported at module load, and
// every function takes it as an optional argument. client.js throws without
// credentials, and a module that cannot be imported cannot be tested - the
// decisions here (events before the oracle, a failed window not aborting the
// scan, null meaning unknown) are exactly the ones worth a test.
async function realClient() {
  return (await import('../thetanuts/client.js')).client;
}

/**
 * The RPC allows a NINE block span on eth_getLogs.
 *
 * Alchemy's free tier caps eth_getLogs at 10 blocks, and `toBlock - fromBlock`
 * of 10 is eleven blocks inclusive, which it rejects. This is the same limit
 * that made BR-27's event-based approach unworkable. Base produces a block
 * roughly every two seconds, so one window covers about eighteen seconds.
 */
const WINDOW = 9;

/**
 * How far past expiry to look before giving up: 40 windows ~ 12 minutes.
 *
 * MEASURED TOO NARROW, 2 Sep 2026. On the first real settlement the scan came
 * back "nothing found in 40 windows" while the oracle answered fine - so the
 * protocol settled somewhere later than twelve minutes past expiry, and the
 * event sources contributed nothing.
 *
 * Left as-is deliberately: widening it multiplies free-tier eth_getLogs calls
 * for a source that is corroboration rather than the answer, and getTWAP is
 * now verified to carry it. If the events are ever wanted, find out when
 * settlement actually happens first rather than guessing a bigger number.
 */
const MAX_WINDOWS = 40;

/**
 * The block closest to a moment in time, by binary search.
 *
 * Settlement happens at expiry, so a scan has to start near that block rather
 * than at the chain head. Costs about twenty getBlock calls.
 *
 * @param {number} targetUnix
 * @returns {Promise<number>}
 */
export async function blockAtTime(targetUnix, deps) {
  const provider = (deps ?? await realClient()).provider;
  let low = 1;
  let high = await provider.getBlockNumber();

  const headBlock = await provider.getBlock(high);
  if (headBlock.timestamp <= targetUnix) return high;

  // Base launched well after 2023; a lower bound near the head keeps the search
  // short. 2s blocks means one day is about 43,200 blocks.
  low = Math.max(1, high - Math.ceil(((headBlock.timestamp - targetUnix) / 2) * 1.5));

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const block = await provider.getBlock(mid);
    if (!block) break;
    if (block.timestamp < targetUnix) low = mid + 1;
    else high = mid;
  }

  return low;
}

/**
 * What the protocol actually paid the buyer, from the OptionPayout event.
 *
 * This is the best available answer because it is not an answer at all - it is
 * a record. If the event exists, that amount was transferred.
 *
 * @param {string} optionAddress
 * @param {number} expiryUnix
 * @returns {Promise<{payoutRaw: bigint|null, settlementPriceRaw: bigint|null, source: string, windowsScanned: number}>}
 */
export async function readSettlementFromEvents(optionAddress, expiryUnix, deps) {
  const sdk = deps ?? await realClient();
  let start;
  try {
    start = await blockAtTime(expiryUnix, sdk);
  } catch (error) {
    return {
      payoutRaw: null,
      settlementPriceRaw: null,
      source: `events: could not locate the expiry block (${error.message.slice(0, 60)})`,
      windowsScanned: 0,
    };
  }

  let payoutRaw = null;
  let settlementPriceRaw = null;
  let scanned = 0;

  for (let i = 0; i < MAX_WINDOWS; i += 1) {
    const fromBlock = start + i * (WINDOW + 1);
    const toBlock = fromBlock + WINDOW;
    scanned += 1;

    // Each query is wrapped: one failing window must not abandon the scan, and
    // a window that throws is not the same as a window with no events.
    try {
      const payouts = await sdk.events.getOptionPayoutEvents(optionAddress, { fromBlock, toBlock });
      const mine = (payouts ?? [])[0];
      if (mine && mine.amountPaidOut !== undefined) payoutRaw = BigInt(mine.amountPaidOut);
    } catch { /* window unreadable; keep scanning */ }

    try {
      const expiries = await sdk.events.getOptionExpiredEvents(optionAddress, { fromBlock, toBlock });
      const found = (expiries ?? [])[0];
      if (found && found.settlementPrice !== undefined) settlementPriceRaw = BigInt(found.settlementPrice);
    } catch { /* window unreadable; keep scanning */ }

    // A payout event is conclusive. An expiry event alone is not - the option
    // may be worthless, and the payout event may simply not exist. Keep looking
    // a little longer before deciding, but stop once both are in hand.
    if (payoutRaw !== null && settlementPriceRaw !== null) break;
  }

  const found = payoutRaw !== null || settlementPriceRaw !== null;
  return {
    payoutRaw,
    settlementPriceRaw,
    source: found
      ? `events (OptionPayout/OptionExpired) in ${scanned} window(s) from block ${start}`
      : `events: nothing found in ${scanned} windows from block ${start}`,
    windowsScanned: scanned,
  };
}

/**
 * Whether Thetanuts' own indexer considers the position closed, and at what.
 *
 * One HTTP call with no block-range limit, so it is cheap enough to try first.
 * It is an index rather than the chain, so it is used to CORROBORATE, never as
 * the only basis for a terminal status.
 *
 * @param {string} optionAddress
 * @param {string} walletAddress
 * @returns {Promise<{status: string|null, pnlUsdc: number|null, closeBlock: number|null, source: string}>}
 */
export async function readSettlementFromIndexer(optionAddress, walletAddress, deps) {
  try {
    const sdk = deps ?? await realClient();
    const positions = await sdk.api.getUserPositionsFromIndexer(walletAddress);
    const mine = (positions ?? []).find(
      (p) => String(p.optionAddress ?? '').toLowerCase() === optionAddress.toLowerCase(),
    );

    if (!mine) {
      return { status: null, pnlUsdc: null, closeBlock: null, source: 'indexer: position not listed' };
    }

    return {
      status: mine.optionStatus ?? mine.status ?? null,
      pnlUsdc: mine.pnl === undefined || mine.pnl === null ? null : Number(mine.pnl),
      closeBlock: mine.closeBlock ? Number(mine.closeBlock) : null,
      // Incidental but worth carrying: the indexer states which side we hold,
      // which is BR-1 verified against the protocol rather than against our own
      // records.
      side: mine.side ?? null,
      source: 'indexer',
    };
  } catch (error) {
    return {
      status: null,
      pnlUsdc: null,
      closeBlock: null,
      source: `indexer: ${error.message.slice(0, 60)}`,
    };
  }
}
