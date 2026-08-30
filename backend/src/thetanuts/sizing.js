// Position sizing (IMPLEMENT.md task 1.5).
//
// Read-only. No wallet, no signing. Nothing here broadcasts anything.
//
// ---------------------------------------------------------------------------
// What a contract is
// ---------------------------------------------------------------------------
//
// One contract's maximum payout equals the strike (verified: calculateMaxPayout
// returns exactly `strike` for one contract). So one contract behaves as a put
// on one unit of the underlying, and protecting N units needs N contracts.
//
// ---------------------------------------------------------------------------
// Do NOT use order.numContracts as the order's size
// ---------------------------------------------------------------------------
//
// It equals availableAmount / price - the contracts you could buy if the whole
// of the maker's collateral were spent on premium. That is not a fillable
// quantity and it overstates the real cap by roughly 1000x:
//
//   order.numContracts          4932.23   <- NOT a size limit
//   calculateMaxContracts()        4.44   <- the real cap
//   maxContracts x strike     10,000.00   <- equals the maker's collateral
//
// The seller's collateral has to cover the maximum payout, so the real cap is
// availableAmount / strike. calculateMaxContracts() computes it; use that.

import { client } from './client.js';
import { DECIMALS, toPayoutContracts, payoutToUsdc } from './decimals.js';

const USDC_SCALE = 10n ** BigInt(DECIMALS.USDC);            // 1e6
const PRICE_SCALE = 10n ** BigInt(DECIMALS.PRICE);          // 1e8

/** Human number -> 6dp bigint, without floating point drift in the last digits. */
const toContractsRaw = (units) => BigInt(Math.floor(units * Number(USDC_SCALE)));

/**
 * Premium for a contract quantity, in raw USDC (6 decimals).
 *
 * contracts(6dp) * price(8dp) / 1e8 = premium(6dp). Kept in bigint - this is
 * money, and the float version drifts in the last cents on large sizes.
 */
function premiumRawFor(contractsRaw, priceRaw) {
  return (contractsRaw * priceRaw) / PRICE_SCALE;
}

/**
 * The largest quantity this order can actually be filled for.
 *
 * Bounded by the maker's posted collateral, which must cover the maximum
 * payout: availableAmount / strike.
 *
 * @param {object} orderWithSig
 * @returns {bigint} contracts, 6 decimals
 */
export function maxContractsFor(orderWithSig) {
  return client.optionBook.calculateMaxContracts(orderWithSig);
}

/**
 * Size a position against one order.
 *
 * Every limit is a parameter. Nothing here is a constant, because the minimum
 * fillable size is still unknown (requirements.md §7 open question 4) and the
 * premium cap is deliberately environment-configurable (BR-33) so it can be
 * tightened for a demo without a code review.
 *
 * The result is the smallest of:
 *   - what the user asked to protect  (`units`, itself capped by their recorded
 *     balance under BR-49 - the caller applies that cap)
 *   - what the maker's collateral backs (calculateMaxContracts)
 *   - what the premium cap allows       (`maxPremiumUsdc`, BR-33)
 *
 * @param {object} orderWithSig - the order to fill against
 * @param {object} opts
 * @param {number} opts.units - units of the underlying to protect (1 unit = 1 contract)
 * @param {number} [opts.maxPremiumUsdc] - hard cap on premium spend (BR-33)
 * @param {number} [opts.minContracts] - reject sizes below this, once Thetanuts tells us
 * @returns {object} sizing result
 */
export function sizePosition(orderWithSig, { units, maxPremiumUsdc, minContracts } = {}) {
  if (!Number.isFinite(units) || units <= 0) {
    throw new RangeError(`sizePosition: units must be a positive number, got ${units}`);
  }

  const priceRaw = orderWithSig.order.price;
  const strikeRaw = orderWithSig.order.strikePrice;

  const requestedRaw = toContractsRaw(units);
  const byCollateralRaw = maxContractsFor(orderWithSig);
  const byPremiumCapRaw = maxPremiumUsdc === undefined
    ? null
    : client.optionBook.calculateNumContracts(
      BigInt(Math.floor(maxPremiumUsdc * Number(USDC_SCALE))),
      priceRaw,
    );

  // Smallest wins, and we record which one bound so the caller can explain it.
  const candidates = [
    { source: 'requested', raw: requestedRaw },
    { source: 'collateral', raw: byCollateralRaw },
    ...(byPremiumCapRaw === null ? [] : [{ source: 'premiumCap', raw: byPremiumCapRaw }]),
  ];
  const winner = candidates.reduce((a, b) => (b.raw < a.raw ? b : a));

  const contractsRaw = winner.raw;
  const premiumRaw = premiumRawFor(contractsRaw, priceRaw);
  const contracts = Number(contractsRaw) / Number(USDC_SCALE);

  const maxPayoutRaw = contractsRaw > 0n
    ? client.utils.calculateMaxPayout(orderWithSig.order, toPayoutContracts(contractsRaw))
    : 0n;

  return {
    // Ready to hand to fillOrder: 6 decimals, as the Order struct expects.
    contractsRaw,
    contracts,

    premiumUsdc: Number(premiumRaw) / Number(USDC_SCALE),
    premiumRaw,

    // 1 contract protects 1 unit.
    protectedUnits: contracts,
    // What the floor is worth if the price goes to zero.
    maxPayoutUsdc: payoutToUsdc(maxPayoutRaw),
    floorUsd: Number(client.utils.fromStrikeDecimals(strikeRaw)),

    boundBy: winner.source,
    limits: {
      requested: Number(requestedRaw) / Number(USDC_SCALE),
      byCollateral: Number(byCollateralRaw) / Number(USDC_SCALE),
      byPremiumCap: byPremiumCapRaw === null ? null : Number(byPremiumCapRaw) / Number(USDC_SCALE),
    },

    // The protocol's minimum fill is not documented yet, so this only reports.
    // It must become a hard refusal once the real figure is known.
    minContracts: minContracts ?? null,
    belowMinimum: minContracts === undefined ? null : contracts < minContracts,
  };
}
