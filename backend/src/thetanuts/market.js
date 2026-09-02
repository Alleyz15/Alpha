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

/**
 * Spot prices for several assets in ONE market-data call.
 *
 * getSpotPrice fetches the whole price map and returns one entry from it, so
 * pricing a five-asset portfolio through it is five identical round trips.
 * This does the fetch once.
 *
 * ---------------------------------------------------------------------------
 * THIS ONE DOES NOT THROW, AND THAT IS THE DIFFERENCE.
 * ---------------------------------------------------------------------------
 *
 * getSpotPrice fails loudly because a quote priced from a missing number would
 * be a quote for money. Nothing here prices a trade - it values a holding for
 * display - and one unpriceable asset must not take the whole portfolio down
 * with it. So a missing price is `null` and the caller reports the total as
 * incomplete (see portfolioView.summariseValue).
 *
 * Null means UNKNOWN. It is never rendered as zero, and it never silently
 * shrinks a total.
 *
 * @param {string[]} assets - symbols, case-insensitive
 * @returns {Promise<Record<string, number|null>>} keyed by the symbol PASSED IN
 */
export async function getSpotPrices(assets) {
  const wanted = [...new Set(assets ?? [])];
  if (wanted.length === 0) return {};

  let prices;
  try {
    ({ prices } = await client.api.getMarketData());
  } catch {
    // The feed is down. Every asset is unknown, which the caller reports as an
    // incomplete total rather than as a portfolio worth nothing.
    return Object.fromEntries(wanted.map((a) => [a, null]));
  }

  return Object.fromEntries(wanted.map((asset) => {
    let value = null;
    try {
      const { symbol } = resolveAsset(asset);
      const price = Number(prices?.[symbol]);
      if (Number.isFinite(price) && price > 0) value = price;
    } catch {
      // An asset the resolver does not know. Unknown, not zero.
    }
    return [asset, value];
  }));
}
