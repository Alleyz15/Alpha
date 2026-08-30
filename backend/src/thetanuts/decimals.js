// Decimal conversion (IMPLEMENT.md task 1.3).
//
// Every raw-to-human conversion in the codebase goes through this module.
// Converting inline anywhere else is how a 100x error gets in: the mistakes
// here do not throw, they produce plausible-looking numbers.
//
// ---------------------------------------------------------------------------
// THE THREE TRAPS, all verified against the live book on 31 Aug 2026
// ---------------------------------------------------------------------------
//
// 1. `price` is 8 decimals even though it is paid in USDC, which is 6.
//    utils.fromUsdcDecimals(price) returns "232.342665" where the correct
//    answer is "2.32342665". A premium 100x too large, silently.
//
// 2. `numContracts` means two different scales in two places:
//       Order.numContracts field                       -> 6 decimals
//       utils.calculatePayoutAtPrice(order, nc, price) -> 18 decimals
//       utils.calculateMaxPayout(order, nc)            -> 18 decimals
//    Passing an order's own numContracts straight into a payout helper is a
//    10^12 error that returns 0.000001 USDC instead of 1,135,180 USDC. It does
//    not throw. Use toPayoutContracts() at the boundary.
//
// 3. Order fields are bigint at runtime, but rawApiData.strikes[] and
//    rawApiData.maxCollateralUsable are strings. The same strike is available
//    as both types. Passing the string silently skips scaling in some helpers.
//
// See docs/SETUP.md for the verification arithmetic.

import { client } from './client.js';

/** Decimal places, by what the value is - not by where it is stored. */
export const DECIMALS = {
  STRIKE: 8,
  PRICE: 8,               // per-contract premium. 8, NOT USDC's 6. Trap 1.
  USDC: 6,
  ORDER_CONTRACTS: 6,     // Order.numContracts. Trap 2.
  PAYOUT_CONTRACTS: 18,   // the payout helpers' numContracts argument. Trap 2.
  PAYOUT_RESULT: 6,       // what the payout helpers return: USDC.
};

/** 6dp -> 18dp. */
const CONTRACT_RESCALE = 10n ** BigInt(DECIMALS.PAYOUT_CONTRACTS - DECIMALS.ORDER_CONTRACTS);

/**
 * Reject anything that is not a bigint.
 *
 * rawApiData carries string copies of several on-chain values. A string will
 * pass through some SDK helpers unscaled and produce a wrong number rather
 * than an error, so the wrong type is rejected here instead.
 */
function assertBigInt(value, field) {
  if (typeof value !== 'bigint') {
    throw new TypeError(
      `${field} must be a bigint, got ${typeof value} (${String(value)}). ` +
      'Order fields are bigint; rawApiData carries string copies - use order.order.',
    );
  }
  return value;
}

/**
 * Convert one raw order into plain human values.
 *
 * Converted values are JS numbers, for display and comparison only. The
 * original order is kept on `.raw` so nothing is ever lost to float precision -
 * persist raw values and store human values alongside them (see CLAUDE.md
 * conventions and BR-40).
 *
 * @param {object} orderWithSig - one entry from api.fetchOrders()
 * @returns {object} human-readable view, with `.raw` pointing at the original
 * @throws {TypeError} if any on-chain field is not a bigint
 */
export function toHumanOrder(orderWithSig) {
  const o = orderWithSig?.order;
  if (!o) throw new TypeError('toHumanOrder: expected an order object with an .order property');

  const strikeRaw = assertBigInt(o.strikePrice, 'order.strikePrice');
  const priceRaw = assertBigInt(o.price, 'order.price');
  const expiryRaw = assertBigInt(o.expiry, 'order.expiry');
  const contractsRaw = assertBigInt(o.numContracts, 'order.numContracts');
  const availableRaw = assertBigInt(orderWithSig.availableAmount, 'availableAmount');

  const expiryUnix = Number(expiryRaw);

  return {
    // 8 decimals
    strike: Number(client.utils.fromStrikeDecimals(strikeRaw)),
    // 8 decimals - see trap 1. Per contract, in USDC.
    premiumPerContract: Number(client.utils.fromPriceDecimals(priceRaw)),
    // 6 decimals - see trap 2. Human contract count as the ORDER carries it.
    numContracts: Number(client.utils.fromBigInt(contractsRaw, DECIMALS.ORDER_CONTRACTS)),
    // 6 decimals, USDC
    availableCollateralUsdc: Number(client.utils.fromBigInt(availableRaw, DECIMALS.USDC)),

    expiry: new Date(expiryUnix * 1000),
    expiryUnix,
    daysToExpiry: (expiryUnix * 1000 - Date.now()) / 86_400_000,

    isPut: orderWithSig.rawApiData?.isCall === false,
    raw: orderWithSig,
  };
}

/**
 * Rescale a contract count from the order's 6 decimals to the 18 decimals the
 * payout helpers expect. Trap 2 - required before calling
 * utils.calculatePayoutAtPrice or utils.calculateMaxPayout.
 *
 * @param {bigint} orderContracts - Order.numContracts, 6 decimals
 * @returns {bigint} the same quantity at 18 decimals
 */
export function toPayoutContracts(orderContracts) {
  return assertBigInt(orderContracts, 'numContracts') * CONTRACT_RESCALE;
}

/**
 * Convert a payout helper's return value to USDC as a plain number.
 * The helpers return 6 decimals regardless of the 18-decimal input.
 *
 * @param {bigint} payout - a calculatePayoutAtPrice / calculateMaxPayout result
 * @returns {number} USDC
 */
export function payoutToUsdc(payout) {
  return Number(client.utils.fromBigInt(assertBigInt(payout, 'payout'), DECIMALS.PAYOUT_RESULT));
}
