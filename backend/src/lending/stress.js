// The no-liquidation comparison (IMPLEMENT.md 7.5).
//
// ---------------------------------------------------------------------------
// NO LENDING PROTOCOL IS INTEGRATED, AND NONE SHOULD BE.
// ---------------------------------------------------------------------------
//
// This is a calculation against a conventional collateral rule, applied
// IDENTICALLY to both sides so the comparison is fair. There is no Aave, no
// Compound, no protocol of any kind behind it, and the response says so in the
// payload rather than leaving it to the interface to remember.
//
// What it shows: feed in a hypothetical price, and a conventional loan against
// the same ETH is under water while ours is not. The difference is the put, and
// nothing else - both sides carry the same debt and are judged by the same rule.
//
// WHY DEBT IS MEASURED AGAINST THE FLOOR, NOT THE CREDIT LIMIT.
//
// The floor is what the option GUARANTEES. The credit limit is what we CHOSE to
// lend against it. Comparing debt to the limit would measure our own decision
// and flatter us: we could lend 10% of the floor, show a coverage ratio of 0.1,
// and claim prudence that came from timidity rather than from the option.
// Measuring against the floor asks the only question that matters - is the debt
// covered by something that cannot fall?

import { creditLimitFor } from './credit.js';
import { amountOwed } from './repay.js';

// The database client and the price feed are imported INSIDE stressLoanById
// rather than at the top of this file. Both throw at module load without
// credentials, and stressLoan() is a pure calculation that needs neither - so a
// static import would make the arithmetic untestable without a live database,
// which is how the interesting part ends up with no tests at all.

/** Round to USDC's 6 decimals for display. Never used for a decision. */
const usdc6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * The rule both sides are judged by.
 *
 * A conventional collateralised loan is liquidated when the collateral no
 * longer covers the debt. We apply the same test to both sides - the protected
 * side is not given a friendlier threshold, it just has a collateral value that
 * cannot fall below the floor.
 */
const RULE = Object.freeze({
  name: 'conventional collateralised loan',
  isRealProtocol: false,
  statement:
    'No lending protocol is integrated. This compares our position against a ' +
    'conventional collateral rule, applied identically to both sides.',
});

/**
 * Stress a loan against a hypothetical price.
 *
 * @param {object} args
 * @param {object} args.loan - a loans row
 * @param {object} args.position - the put backing it
 * @param {number} args.price - hypothetical price of the underlying, in dollars
 * @param {number} [args.spotNow] - current spot, for context only
 * @returns {object} the API payload
 */
export function stressLoan({ loan, position, price, spotNow = null, rule = 'as-disbursed' }) {
  if (!Number.isFinite(price) || price <= 0) {
    throw new RangeError(`stressLoan: price must be a positive number, got ${price}`);
  }
  if (!['as-disbursed', 'current'].includes(rule)) {
    throw new RangeError(`stressLoan: rule must be 'as-disbursed' or 'current', got '${rule}'`);
  }

  // The floor comes from the filled put, in bigint, at the stored scales - the
  // same derivation the credit limit uses (BR-39). Never a constant.
  const limit = creditLimitFor(position, { annualRatePct: Number(loan.interest_rate) });

  // --- which rule is this loan being judged under? -------------------------
  //
  // The first real loan was disbursed under the ORIGINAL BR-39, which lent the
  // whole floor and then charged interest on top - so its debt exceeds the
  // guarantee and BOTH sides liquidate. That is the honest picture of that loan
  // and 'as-disbursed' shows it, unflattering and all.
  //
  // 'current' re-derives what the same put would support under the revised rule.
  // It is a hypothetical, and saying so is not optional: ruleApplied and note
  // travel in the payload for the same reason isRealProtocol does. An interface
  // must not be able to show a loan under a rule it was not written under and
  // leave that off the screen.
  //
  // The default is 'as-disbursed'. A default that quietly shows a hypothetical
  // is exactly the kind of thing that stops being noticed.
  const asDisbursedPrincipal = Number(loan.principal);
  const currentRulePrincipal = creditLimitFor(position, {
    annualRatePct: Number(loan.interest_rate),
    now: new Date(loan.created_at),
  }).creditLimitUsdc;

  const writtenUnderCurrentRule =
    Math.abs(asDisbursedPrincipal - currentRulePrincipal) < 0.000001;

  const effectiveLoan = rule === 'current' && !writtenUnderCurrentRule
    ? { ...loan, principal: currentRulePrincipal }
    : loan;

  const owed = amountOwed(effectiveLoan);

  const units = limit.contracts;
  const floorUsdc = limit.floorUsdc;

  // Unprotected: the collateral is just the ETH, and it falls with the price.
  const unprotectedValue = usdc6(units * price);

  // Protected: the put pays the difference between the strike and the price, so
  // the position is worth at least the floor whatever the price did. Above the
  // strike the ETH is simply worth more and the put expires unused.
  const protectedValue = usdc6(Math.max(units * price, floorUsdc));

  const side = (collateralValueUsdc) => {
    const coverageRatio = collateralValueUsdc / owed.totalUsdc;
    const wouldLiquidate = collateralValueUsdc < owed.totalUsdc;
    return {
      collateralValueUsdc,
      coverageRatio: Math.round(coverageRatio * 1e4) / 1e4,
      wouldLiquidate,
      shortfallUsdc: wouldLiquidate ? usdc6(owed.totalUsdc - collateralValueUsdc) : 0,
    };
  };

  return {
    asset: position.asset,
    hypotheticalPrice: price,
    spotNow,
    units,

    debt: {
      principal: usdc6(owed.principalUsdc),
      interest: usdc6(owed.interestUsdc),
      total: owed.totalUsdc,
    },

    // Which credit rule produced the debt above, and - if it is not the rule the
    // loan was actually written under - why the figures differ. The interface
    // DISPLAYS this; it does not decide whether to.
    ruleApplied: rule,
    note: rule === 'current' && !writtenUnderCurrentRule
      ? 'This loan was disbursed under the previous credit rule, which lent the ' +
        'full floor. Shown here under the current rule, which reserves interest.'
      : null,

    // Always present, so the two figures can be compared without a second call.
    asDisbursed: {
      principal: usdc6(asDisbursedPrincipal),
      underCurrentRule: usdc6(currentRulePrincipal),
      writtenUnderCurrentRule,
    },

    rule: RULE,

    unprotected: side(unprotectedValue),

    protected: {
      floorUsdc,
      // Provenance, so the interface can show where the floor came from and
      // nobody is tempted to hardcode it. numContractsRaw stays a STRING: it is
      // a raw on-chain integer and does not survive a JS number.
      floorSource: {
        strike: limit.strike,
        numContractsRaw: String(position.num_contracts_raw),
        positionId: position.id,
      },
      ...side(protectedValue),
    },
  };
}

/**
 * The price at which the unprotected side fails and the protected side does not.
 *
 * Useful for the interface to pick a default, and for tests: below this the two
 * sides disagree, which is the whole demonstration.
 *
 * @returns {number} price in dollars, or 0 if the debt exceeds the floor
 */
export function crossoverPrice({ loan, position }) {
  const limit = creditLimitFor(position, { annualRatePct: Number(loan.interest_rate) });
  const owed = amountOwed(loan);
  // Unprotected fails when units x price < debt.
  return owed.totalUsdc / limit.contracts;
}

/**
 * Load a loan and its put, then stress it.
 *
 * @param {string} loanId
 * @param {number} price
 * @param {'as-disbursed'|'current'} [rule]
 * @returns {Promise<object>}
 */
export async function stressLoanById(loanId, price, rule = 'as-disbursed') {
  const { db, unwrap } = await import('../db/client.js');
  const { getSpotPrice } = await import('../thetanuts/market.js');

  const loan = unwrap(
    await db.from('loans').select('*').eq('id', loanId).single(),
    'stressLoanById: reading the loan',
  );

  if (!loan.position_id) {
    throw new Error(`stressLoanById: loan ${loanId} has no backing position`);
  }

  const position = unwrap(
    await db.from('positions').select('*').eq('id', loan.position_id).single(),
    'stressLoanById: reading the backing put',
  );

  let spotNow = null;
  try {
    spotNow = await getSpotPrice(position.asset);
  } catch {
    // Context only. A comparison against a hypothetical price does not depend on
    // knowing today's, and failing the whole request because a price feed is
    // slow would be the wrong trade.
  }

  return stressLoan({ loan, position, price, spotNow, rule });
}
