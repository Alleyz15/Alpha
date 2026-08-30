// Spot prices (IMPLEMENT.md task 1.1).
//
// Read-only. No wallet, no signing.

import { client } from './client.js';
import { resolveAsset } from './assets.js';

/**
 * Current spot price for an asset, as a plain number.
 *
 * api.getMarketData() already returns human-scale JS numbers (ETH: 2458.24),
 * NOT 8-decimal integers. The 8-decimal rule (BR-7) applies to strikePrice and
 * price on order objects, not here. See docs/SETUP.md.
 *
 * Fails loudly rather than returning a placeholder: UC-1 E1 requires that a
 * missing or unusable price surfaces as an error, never as a stale-looking
 * number the user might act on.
 *
 * @param {string} asset - Asset symbol, case-insensitive (e.g. "ETH")
 * @returns {Promise<number>} spot price in USD
 * @throws {Error} if the feed has no usable price for this asset
 */
export async function getSpotPrice(asset) {
  const { symbol } = resolveAsset(asset);
  const { prices } = await client.api.getMarketData();

  const price = Number(prices?.[symbol]);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(
      `getSpotPrice: no usable price for ${symbol} (got ${JSON.stringify(prices?.[symbol])})`,
    );
  }

  return price;
}
