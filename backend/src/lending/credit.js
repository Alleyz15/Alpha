// Credit limit derivation (IMPLEMENT.md 7.2, BR-39).
//
// ---------------------------------------------------------------------------
// credit_limit = strike x num_contracts. Nothing else. Ever.
// ---------------------------------------------------------------------------
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
 * @returns {{ creditLimitRaw: bigint, creditLimitUsdc: number, strike: number, contracts: number }}
 */
export function creditLimitFor(position) {
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
  const creditLimitRaw = (strikeRaw * contractsRaw) / STRIKE_SCALE;

  return {
    creditLimitRaw,
    creditLimitUsdc: Number(creditLimitRaw) / Number(USDC_SCALE),
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
