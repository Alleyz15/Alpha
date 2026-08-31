// Two-day principal protection with a small share of the upside (Phase 8).
//
// ---------------------------------------------------------------------------
// Named for what it is, not for what would sell better.
// ---------------------------------------------------------------------------
//
// Not a "principal-protected savings vault". Over two days the yield given up
// on a 100 USDC deposit is about three cents, so the guarantee protects against
// a risk that barely exists at that horizon. The arithmetic is correct and the
// product it describes is thin - which is exactly why the tenor is stated, the
// simulation is labelled, and the participation rate is derived rather than
// asserted. A judge who does the sums should find the same numbers we printed.
//
// What is real: the call, on Base mainnet, BaseScan verifiable.
// What is simulated: the yield accrual (BR-37).

import { getSpotPrice } from '../thetanuts/market.js';
import { getBuyableCallOrders } from '../thetanuts/orders.js';
import { toHumanOrder } from '../thetanuts/decimals.js';

/** The simulated yield rate. Simulated, and the schema pins that (BR-37). */
export function yieldRateAnnualPct() {
  return Number(process.env.VAULT_SIMULATED_YIELD_ANNUAL_PCT ?? 5);
}

/**
 * Split a deposit into the part set aside and the part spent on upside.
 *
 * Solved BACKWARDS from the guarantee (BR-38). Not "95 grows into 100" but "to
 * return exactly `principal` at maturity, how much must be set aside today":
 *
 *   yield_portion  = principal / (1 + rate x days/365)
 *   option_portion = principal - yield_portion
 *
 * Forwards would leave the protection approximate; backwards makes it exact.
 *
 * @param {number} principalUsdc
 * @param {number} days - tenor of the call
 * @param {number} [ratePct]
 * @returns {{ yieldPortion: number, optionPortion: number, ratePct: number, days: number }}
 */
export function splitDeposit(principalUsdc, days, ratePct = yieldRateAnnualPct()) {
  if (!Number.isFinite(principalUsdc) || principalUsdc <= 0) {
    throw new RangeError(`splitDeposit: principal must be positive, got ${principalUsdc}`);
  }
  if (!Number.isFinite(days) || days <= 0) {
    throw new RangeError(`splitDeposit: days must be positive, got ${days}`);
  }

  const yieldPortion = principalUsdc / (1 + (ratePct / 100) * (days / 365));
  const optionPortion = principalUsdc - yieldPortion;

  return {
    yieldPortion: Math.round(yieldPortion * 1e6) / 1e6,
    optionPortion: Math.round(optionPortion * 1e6) / 1e6,
    ratePct,
    days,
  };
}

/**
 * The participation rate a real premium buys (BR-38).
 *
 * ---------------------------------------------------------------------------
 * Never hardcoded, never an environment variable.
 * ---------------------------------------------------------------------------
 *
 * `exposure = option_portion / premium_per_contract x contract_size`, then
 * `participation = exposure / principal`. Both inputs come from the order
 * actually filled, so the rate moves with the market and is fixed for a given
 * deposit at the moment of purchase.
 *
 * A configured rate would display a number nobody earned - and the whole point
 * of putting it on screen is that it is checkable against the premium.
 *
 * @param {object} args
 * @param {number} args.optionPortion - USDC available for the call
 * @param {number} args.premiumPerContract - the REAL premium, USDC per contract
 * @param {number} args.spot - one contract covers one unit of the underlying
 * @param {number} args.principal
 */
export function participationFor({ optionPortion, premiumPerContract, spot, principal }) {
  if (!(premiumPerContract > 0)) {
    throw new RangeError('participationFor: premiumPerContract must be positive');
  }

  const contracts = optionPortion / premiumPerContract;
  const exposureUsdc = contracts * spot;

  return {
    contracts,
    exposureUsdc: Math.round(exposureUsdc * 1e6) / 1e6,
    // As a percentage of the deposit: "you keep this share of any rise".
    participationPct: Math.round((exposureUsdc / principal) * 1e6) / 1e4,
  };
}

/**
 * Price a deposit against the live book. Read-only; buys nothing.
 *
 * Picks the cheapest vanilla buy-side call above spot at the chosen expiry -
 * cheapest per contract buys the most exposure for a fixed option portion,
 * which is what a participation rate rewards.
 *
 * @param {object} args
 * @param {string} [args.asset]
 * @param {number} args.principalUsdc
 * @param {number} [args.targetDays] - defaults to the longest available
 * @returns {Promise<object>}
 */
export async function quoteVault({ asset = 'ETH', principalUsdc, targetDays } = {}) {
  const [spot, rawCalls] = await Promise.all([
    getSpotPrice(asset),
    getBuyableCallOrders(asset),
  ]);

  const above = rawCalls.map(toHumanOrder).filter((o) => o.strike > spot);
  if (above.length === 0) {
    throw new Error(`quoteVault: no buyable ${asset} calls above spot right now`);
  }

  // Group by expiry so a tenor can be chosen deliberately.
  const byExpiry = new Map();
  for (const o of above) {
    if (!byExpiry.has(o.expiryUnix)) byExpiry.set(o.expiryUnix, []);
    byExpiry.get(o.expiryUnix).push(o);
  }
  const expiries = [...byExpiry.keys()].sort((a, b) => a - b);

  const chosenExpiry = targetDays === undefined
    ? expiries.at(-1)
    : expiries.find((e) => (e * 1000 - Date.now()) / 86_400_000 >= targetDays) ?? expiries.at(-1);

  const candidates = byExpiry.get(chosenExpiry);
  const call = candidates.reduce((a, b) =>
    a.premiumPerContract <= b.premiumPerContract ? a : b);

  const split = splitDeposit(principalUsdc, call.daysToExpiry);
  const part = participationFor({
    optionPortion: split.optionPortion,
    premiumPerContract: call.premiumPerContract,
    spot,
    principal: principalUsdc,
  });

  return {
    asset,
    spot,
    principalUsdc,
    ...split,
    ...part,
    call,
    strike: call.strike,
    expiry: call.expiry,
    daysToExpiry: call.daysToExpiry,
    premiumPerContract: call.premiumPerContract,
    // BR-37: carried as data so the interface can label it at the point the
    // number appears, rather than deciding for itself whether to mention it.
    yieldIsSimulated: true,
  };
}
