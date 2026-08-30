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
 * On filter 3 (BR-1): `isBuyer` describes the MAKER's side from the taker's
 * perspective. isBuyer === true means the maker wants to buy, so filling it
 * would make US the seller - and a seller's loss is near-unlimited while a
 * buyer's is capped at the premium. BR-1 forbids ever taking that side, so
 * those orders are excluded here at the data boundary rather than downstream.
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
    o.order?.isBuyer === false);
}
