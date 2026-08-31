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
  const { priceFeed } = resolveAsset(asset);
  const orders = await client.api.fetchOrders();

  return orders.filter((o) =>
    (o.rawApiData?.priceFeed || '').toLowerCase() === priceFeed &&
    o.rawApiData?.isCall === false &&
    o.order?.isBuyer === true &&
    // 4. Vanilla only - exactly one strike.
    //
    // The book also carries two-strike spreads and three-strike butterflies,
    // and they are NOT this product. A put spread pays out only BETWEEN its
    // strikes, so its maximum payout is the spread width rather than the
    // strike: telling a user "your floor is $2,100" while holding one would be
    // false, and BR-6 exists to stop exactly that kind of misdescription.
    //
    // It also happens that only the vanilla implementation
    // (0x7355EB92...) simulates successfully for us; the multi-strike ones
    // revert. But the reason to exclude them is that they are the wrong
    // product, not that they fail.
    (o.rawApiData?.strikes?.length ?? 1) === 1);
}
