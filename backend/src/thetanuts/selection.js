// Expiry and strike selection (IMPLEMENT.md task 1.4).
//
// Read-only. No wallet, no signing.
//
// Turns the live book into the small set of choices a user is actually offered.
// Everything here is derived from what the book carries right now - there is no
// hardcoded list of protection levels anywhere in this file, by design (BR-41).

import { getSpotPrice } from './market.js';
import { getBuyablePutOrders } from './orders.js';
import { toHumanOrder } from './decimals.js';

/**
 * Normalise a target expiry into a Date.
 *
 * Accepts a Date, an ISO string, or a number of days from now - the
 * percentage-based entry point thinks in days, the goal-based one (task 1.7)
 * thinks in dates.
 *
 * @param {Date|string|number} target
 * @returns {Date}
 */
export function toTargetDate(target) {
  if (target instanceof Date) return target;
  if (typeof target === 'number') return new Date(Date.now() + target * 86_400_000);
  if (typeof target === 'string') {
    const d = new Date(target);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new TypeError(`toTargetDate: expected a Date, an ISO string or a number of days, got ${typeof target}`);
}

/**
 * Group buyable puts by expiry, keeping only strikes below spot.
 *
 * A put struck above spot is already in the money: it costs more than the loss
 * it covers, which is not protection in any sense a user would recognise.
 *
 * At each strike only the cheapest order is kept. Two makers can quote the same
 * strike at different premiums, and there is no reason to offer the worse one.
 * Ties go to the order with more collateral available, which is likelier to
 * still be fillable when the user confirms.
 *
 * @param {string} asset
 * @returns {Promise<{ spot: number, expiries: Array }>}
 */
export async function listExpiries(asset) {
  const [spot, rawPuts] = await Promise.all([
    getSpotPrice(asset),
    getBuyablePutOrders(asset),
  ]);

  const belowSpot = rawPuts.map(toHumanOrder).filter((p) => p.strike < spot);

  // expiryUnix -> strike -> best order at that strike
  const byExpiry = new Map();
  for (const put of belowSpot) {
    if (!byExpiry.has(put.expiryUnix)) byExpiry.set(put.expiryUnix, new Map());
    const atExpiry = byExpiry.get(put.expiryUnix);
    const incumbent = atExpiry.get(put.strike);

    const better = !incumbent ||
      put.premiumPerContract < incumbent.premiumPerContract ||
      (put.premiumPerContract === incumbent.premiumPerContract &&
        put.availableCollateralUsdc > incumbent.availableCollateralUsdc);

    if (better) atExpiry.set(put.strike, put);
  }

  const expiries = [...byExpiry.entries()]
    .map(([expiryUnix, strikeMap]) => ({
      expiryUnix,
      expiry: new Date(expiryUnix * 1000),
      daysToExpiry: (expiryUnix * 1000 - Date.now()) / 86_400_000,
      // Highest strike first: most protection first.
      strikes: [...strikeMap.values()].sort((a, b) => b.strike - a.strike),
    }))
    .sort((a, b) => a.expiryUnix - b.expiryUnix);

  return { spot, expiries };
}

/**
 * Choose the expiry to quote against: the earliest one on or after the target.
 *
 * BR-6 is strict here - the expiry is never earlier than the user asked for.
 * Protection that runs out before the date it was bought for is worthless at
 * the only moment that matters, so when the book cannot reach the target date
 * this returns no expiry rather than quietly substituting a shorter one.
 *
 * @param {string} asset
 * @param {Date|string|number} target - date, ISO string, or days from now
 * @returns {Promise<object>} selection result, `expiry` is null if unreachable
 */
export async function selectExpiry(asset, target) {
  const targetDate = toTargetDate(target);
  const { spot, expiries } = await listExpiries(asset);

  const targetUnix = targetDate.getTime() / 1000;
  const onOrAfter = expiries.filter((e) => e.expiryUnix >= targetUnix);
  const longest = expiries.at(-1) ?? null;

  if (onOrAfter.length === 0) {
    return {
      spot,
      expiry: null,
      requestedDate: targetDate,
      // What we could offer, so the caller can say how far short the book falls.
      longestAvailable: longest,
      shortfallDays: longest ? (targetUnix - longest.expiryUnix) / 86_400 : null,
      reason: longest
        ? 'no expiry on or after the target date (BR-6: never earlier)'
        : 'no buyable puts below spot on this asset',
    };
  }

  const chosen = onOrAfter[0];
  const gapDays = (chosen.expiryUnix - targetUnix) / 86_400;

  return {
    spot,
    expiry: chosen,
    requestedDate: targetDate,
    gapDays,
    // Anything under a day is the same calendar day in practice.
    isExact: Math.abs(gapDays) < 1,
    longestAvailable: longest,
    shortfallDays: null,
    reason: null,
  };
}

/**
 * Pick up to three protection tiers from the strikes available at one expiry.
 *
 * BR-41: tiers are the highest, middle and lowest strikes actually on the book
 * at the chosen expiry - never a hardcoded percentage list, never a slider. If
 * fewer than three strikes exist, fewer tiers are returned rather than padding
 * the list with repeats. The middle tier is marked as recommended.
 *
 * @param {Array} strikes - strike entries, highest first
 * @param {number} spot
 * @returns {Array} up to three tiers
 */
function pickTiers(strikes, spot) {
  if (strikes.length === 0) return [];

  const middleIndex = Math.floor((strikes.length - 1) / 2);

  // Deduplicated by index, so 1 or 2 strikes yield 1 or 2 tiers.
  const picks = [
    ['highest', 0],
    ['middle', middleIndex],
    ['lowest', strikes.length - 1],
  ];

  const seen = new Set();
  const tiers = [];

  for (const [label, index] of picks) {
    if (seen.has(index)) continue;
    seen.add(index);

    const put = strikes[index];
    tiers.push({
      label,
      // BR-41: the middle tier is preselected.
      recommended: label === 'middle',
      strike: put.strike,
      floorUsd: put.strike,
      // BR-6: the REAL protection level, not the one that was requested.
      protectionPct: ((spot - put.strike) / spot) * 100,
      // Cost to protect one unit of the asset. One contract's maximum payout
      // is the strike, so a contract behaves as a put on one unit.
      costPerUnit: put.premiumPerContract,
      costPctOfSpot: (put.premiumPerContract / spot) * 100,
      expiry: put.expiry,
      expiryUnix: put.expiryUnix,
      daysToExpiry: put.daysToExpiry,
      order: put.raw,
    });
  }

  // Present strongest protection first, matching the strike order.
  return tiers.sort((a, b) => b.strike - a.strike);
}

/**
 * The task 1.4 entry point: given an asset and a target expiry, return the
 * protection tiers actually available.
 *
 * Returns data, not copy. Labels are internal ('middle', not 'Balanced') -
 * user-facing wording is the frontend's job and must satisfy BR-3.
 *
 * @param {string} asset
 * @param {Date|string|number} target - date, ISO string, or days from now
 * @returns {Promise<object>}
 */
export async function selectProtectionTiers(asset, target) {
  const selection = await selectExpiry(asset, target);

  if (!selection.expiry) {
    return { asset, spot: selection.spot, expiry: null, tiers: [], selection };
  }

  return {
    asset,
    spot: selection.spot,
    expiry: selection.expiry,
    availableStrikes: selection.expiry.strikes.length,
    tiers: pickTiers(selection.expiry.strikes, selection.spot),
    selection,
  };
}
