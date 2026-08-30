// Asset identity.
//
// This is the only place that maps a human asset symbol to its on-chain
// identity. Nothing else in the codebase should special-case a particular
// asset - the MVP UI exposes ETH only (UC-1 step 1), but the code must not
// hardcode it.
//
// Asset identity is the PRICE FEED address, not `order.underlyingToken`.
// `underlyingToken` is 0x000...000 for SOL, XRP, BNB and AVAX, so it cannot
// identify an asset. See docs/SETUP.md.

import { client } from './client.js';

// chainConfig.priceFeeds contains both plain symbols ("ETH") and pair aliases
// ("ETH/USD") that point at the same address. Aliases are dropped so an asset
// is never listed twice.
const isAlias = (symbol) => symbol.includes('/');

/**
 * Resolve an asset symbol to its on-chain identity.
 *
 * Sync and network-free - it only reads chain config. A symbol resolving here
 * does not guarantee the asset is tradable: it may have no price feed data
 * (DOGE, PAXG) or no fillable orders. Use listSupportedAssets() for the
 * authoritative tradable list.
 *
 * @param {string} asset - Asset symbol, case-insensitive (e.g. "ETH", "eth")
 * @returns {{ symbol: string, priceFeed: string }} priceFeed is lowercased
 * @throws {Error} if the symbol has no price feed on this chain
 */
export function resolveAsset(asset) {
  if (typeof asset !== 'string' || asset.trim() === '') {
    throw new Error('resolveAsset: asset must be a non-empty string');
  }

  const wanted = asset.trim().toUpperCase();
  const feeds = client.chainConfig.priceFeeds;
  const symbol = Object.keys(feeds).find((s) => !isAlias(s) && s.toUpperCase() === wanted);

  if (!symbol) {
    const known = Object.keys(feeds).filter((s) => !isAlias(s)).join(', ');
    throw new Error(`resolveAsset: unknown asset "${asset}". Known assets: ${known}`);
  }

  return { symbol, priceFeed: feeds[symbol].toLowerCase() };
}

/**
 * List the assets that have both a price feed and a live spot price.
 *
 * Some feeds exist on-chain but return no market data (DOGE, PAXG), so they
 * are excluded - quoting them would fail at the price step anyway.
 *
 * @returns {Promise<string[]>} asset symbols
 */
export async function listSupportedAssets() {
  const { prices } = await client.api.getMarketData();
  return Object.keys(client.chainConfig.priceFeeds)
    .filter((symbol) => !isAlias(symbol) && prices?.[symbol] !== undefined);
}
