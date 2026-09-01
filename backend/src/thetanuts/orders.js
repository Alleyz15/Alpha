// Order book filtering (IMPLEMENT.md task 1.2).
//
// Read-only. No wallet, no signing.
//
// Only one accessor is exported, and it returns only orders we are allowed to
// fill. There is deliberately no unfiltered variant: a function returning
// orders we must never touch is a footgun for the next caller. A script that
// genuinely needs the raw book for diagnostics can call
// client.api.fetchOrders() directly and take responsibility for it.

import { client } from './client.js';
import { resolveAsset } from './assets.js';

/**
 * Live put orders on one asset that WE can buy.
 *
 * Three filters, all required:
 *
 *   1. Asset      - matched on rawApiData.priceFeed, because
 *                   order.underlyingToken is 0x000...000 for several assets
 *                   and cannot identify them. See docs/SETUP.md.
 *   2. Puts       - rawApiData.isCall === false. Protection against a price
 *                   drop is a put; calls are Phase 8's problem.
 *   3. Our side   - order.isBuyer === false.
 *
 * On filter 3 (BR-1): `isBuyer` describes OUR side - the taker's.
 * isBuyer === true means WE are the buyer, paying a premium. That is the only
 * side BR-1 permits: a buyer's loss is capped at the premium, a seller's is
 * near-unlimited. Excluded at the data boundary rather than downstream.
 *
 * ---------------------------------------------------------------------------
 * This filter was inverted until 31 Aug, and the type definition is why
 * ---------------------------------------------------------------------------
 *
 * index.d.ts:774 reads:
 *
 *   "Whether maker is buyer (true) or seller (false) from taker's perspective"
 *
 * Read literally, that says isBuyer describes the MAKER, which is how this
 * filter was first written. It is wrong. The accurate half of that sentence is
 * "from taker's perspective": the flag describes the taker.
 *
 * `utils.isLong()` is no help either way - it is `return order.isBuyer`, an
 * alias, so it restates the field rather than interpreting it.
 *
 * Settled against the contract instead, with an allowance-boundary test. With
 * exactly 3 USDC approved and 9.89 USDC held, callStaticFillOrder on an
 * isBuyer === true order behaved like this:
 *
 *   spend 2.99 USDC -> SUCCESS
 *   spend 3.00 USDC -> SUCCESS
 *   spend 3.01 USDC -> REVERT "ERC20: transfer amount exceeds allowance"
 *
 * An allowance governs what a spender may take FROM us, so the boundary
 * landing exactly on ours proves the contract pulls `usdcAmount` out of this
 * wallet: a premium, paid by a buyer. Were we the seller, USDC would flow
 * toward us and ~$600 of collateral would be required - 0.5 USDC would never
 * have simulated successfully.
 *
 * Orders with isBuyer === false revert with Panic(0x11) at every size, which
 * is what "you cannot take this side" looks like from the outside.
 *
 * Returns raw order objects. Converting strike/premium/expiry to human values
 * is task 1.3 and is not done here.
 *
 * @param {string} asset - Asset symbol, case-insensitive (e.g. "ETH")
 * @returns {Promise<object[]>} fillable put orders, possibly empty
 */
export async function getBuyablePutOrders(asset) {
  return getBuyableOrders(asset, { isCall: false });
}

/**
 * Live vanilla CALL orders on one asset that WE can buy.
 *
 * Same three filters as puts - asset by price feed, our side, single strike -
 * differing only in isCall. Phase 8 buys the upside leg of a principal-protected
 * deposit, and it must be a call we BUY (BR-1), never one we write.
 *
 * @param {string} asset
 * @returns {Promise<object[]>}
 */
export async function getBuyableCallOrders(asset) {
  return getBuyableOrders(asset, { isCall: true });
}

/** Shared filter. See getBuyablePutOrders for why each clause exists. */
async function getBuyableOrders(asset, { isCall }) {
  const { priceFeed } = resolveAsset(asset);
  const orders = await client.api.fetchOrders();

  return orders.filter((o) =>
    (o.rawApiData?.priceFeed || '').toLowerCase() === priceFeed &&
    o.rawApiData?.isCall === isCall &&
    o.order?.isBuyer === true &&
    (o.rawApiData?.strikes?.length ?? 1) === 1);
}
