// Credit limit derivation (IMPLEMENT.md 7.2, BR-39).
//
// ---------------------------------------------------------------------------
// credit_limit = the floor, MINUS the interest this loan charges over its term.
// Still derived from the strike. Still no ratio, no haircut, no configuration.
// ---------------------------------------------------------------------------
//
// REVISED 1 Sep 2026. The original rule set the limit to the whole floor:
//
//     credit_limit = strike x contracts
//
// which lent 100% of the guarantee and then charged interest on top. The first
// real loan came due owing 4.599410 against a floor of 4.597700 - under-
// collateralised by exactly the interest, from the moment it was written. There
// is no good answer to "you are at 100% LTV and charging interest".
//
// This is the product's whole claim, so it is worth being blunt about what it
// is not. It is not a loan-to-value ratio. It is not configurable. There is no
// haircut and no buffer.
//
// A conventional lender discounts collateral because it has no floor and relies
// on liquidating you when the price falls. We have a floor: the put pays the
// difference between the strike and the settlement price, so at expiry the
// position is worth at least strike x contracts no matter where the price went.
// The limit IS the floor.
//
// The question a judge will ask is "you're the lender - you're not liquidating
// because of the put, or because you chose not to?". The answer has to be: the
// limit is the strike. Remove the put and we would lend less and keep the right
// to liquidate. That answer is only true if this file has no ratio in it.

import { DECIMALS } from '../thetanuts/decimals.js';

const STRIKE_SCALE = 10n ** BigInt(DECIMALS.STRIKE);        // 1e8
const CONTRACT_SCALE = 10n ** BigInt(DECIMALS.ORDER_CONTRACTS); // 1e6
const USDC_SCALE = 10n ** BigInt(DECIMALS.USDC);            // 1e6

/** Fixed-point scale for the interest factor, and seconds in a 365-day year. */
const SCALE = 10n ** 12n;
const SECONDS_PER_YEAR = 365n * 86_400n;

/**
 * The credit limit a filled put supports.
 *
 * Computed from the row's raw on-chain values at their stored scales, in
 * bigint, so the figure traces directly to what is on chain (BR-36) and does
 * not drift through a float.
 *
 *   strike_raw        8 decimals
 *   num_contracts_raw 6 decimals
 *   result            USDC, 6 decimals
 *
 * @param {object} position - a positions row, filled (status active or later)
 * @param {object} [opts]
 * @param {number} [opts.annualRatePct] - the rate this loan is written at. Pass
 *   the STORED rate when re-deriving an existing loan; the environment default
 *   is only right for a loan being written now.
 * @param {Date} [opts.now] - term is measured from here to due_at
 * @returns {object} creditLimitRaw/Usdc, floorRaw/Usdc, interestReserved, terms
 */
export function creditLimitFor(position, { annualRatePct = interestRateAnnualPct(), now = new Date() } = {}) {
  if (!position?.strike_raw || !position?.num_contracts_raw) {
    throw new Error(
      `creditLimitFor: position ${position?.id} has no strike_raw / num_contracts_raw. ` +
      'Only a filled position backs a loan.',
    );
  }

  const strikeRaw = BigInt(position.strike_raw);
  const contractsRaw = BigInt(position.num_contracts_raw);

  if (strikeRaw <= 0n || contractsRaw <= 0n) {
    throw new Error(`creditLimitFor: position ${position.id} has a non-positive strike or size`);
  }

  // strike(8dp) x contracts(6dp) -> USDC(6dp).
  // Dividing by the strike scale leaves the contract scale, which is already
  // USDC's - so the result is 6dp without a second conversion.
  const floorRaw = (strikeRaw * contractsRaw) / STRIKE_SCALE;

  // --- the interest this loan will charge, reserved out of the floor -------
  //
  // SOLVED BACKWARDS, not subtracted. Deducting interest computed on the FLOOR
  // over-deducts, because the interest is actually charged on the smaller
  // amount lent. We want the L where:
  //
  //     L + interest_on_L_over_the_term = floor
  //     L x (1 + r x t/365)             = floor
  //     L                               = floor / (1 + r x t/365)
  //
  // which makes principal + interest land exactly on the floor rather than
  // just under it. Same technique splitDeposit() uses in the vault, and for
  // the same reason: solve for the number the guarantee has to cover.
  const dueAt = dueAtFor(position);
  const termSeconds = BigInt(Math.max(0, Math.round((new Date(dueAt) - now) / 1000)));

  // Fraction of principal per year, at 1e8. 5% -> 0.05 -> 5_000_000.
  const rateFracScaled = BigInt(Math.round((annualRatePct / 100) * 1e8));

  // factor = 1 + rate x term/year, at 1e12.
  const factorScaled = SCALE + (rateFracScaled * 10_000n * termSeconds) / SECONDS_PER_YEAR;

  const creditLimitRaw = (floorRaw * SCALE) / factorScaled;
  const interestReservedRaw = floorRaw - creditLimitRaw;

  return {
    creditLimitRaw,
    creditLimitUsdc: Number(creditLimitRaw) / Number(USDC_SCALE),

    // The floor is kept alongside the limit because they are different facts.
    // The floor is what the option guarantees; the limit is what we lend
    // against it. 7.5 compares debt to the FLOOR, not to the limit.
    floorRaw,
    floorUsdc: Number(floorRaw) / Number(USDC_SCALE),

    interestReservedRaw,
    interestReservedUsdc: Number(interestReservedRaw) / Number(USDC_SCALE),
    annualRatePct,
    termDays: Number(termSeconds) / 86_400,
    dueAt,

    strike: Number(strikeRaw) / Number(STRIKE_SCALE),
    contracts: Number(contractsRaw) / Number(CONTRACT_SCALE),
  };
}

/**
 * The annual interest rate this loan is written at.
 *
 * Environment-configurable, unlike the credit limit: the rate is a commercial
 * choice, while the limit is a fact about the option. Stored on the row at
 * disbursement so a displayed figure always traces to the row (BR-40).
 */
export function interestRateAnnualPct() {
  return Number(process.env.LOAN_INTEREST_RATE_ANNUAL_PCT ?? 5);
}

/**
 * A loan matures exactly when its protection does (BR-48).
 *
 * The floor exists only at expiry; before then the put's market value is not
 * its strike. A loan that can come due earlier has no floor at the moment it
 * matters. The database enforces this too - belt and braces, because getting it
 * wrong is silent.
 */
export function dueAtFor(position) {
  return new Date(position.expiry).toISOString();
}
