// Quote assembly (IMPLEMENT.md task 1.6).
//
// Read-only. No wallet, no signing, no transactions.
//
// Turns an asset, a holding and a target date into the single object the API
// and the frontend consume. The returned value is a JSON-safe DTO: ISO strings
// for dates, numbers for amounts, no BigInt anywhere. The raw order is attached
// as a non-enumerable property, so JSON.stringify() drops it while Phase 3 can
// still reach it for the fill.

import { randomUUID } from 'node:crypto';
import { listExpiries, selectProtectionTiers } from './selection.js';
import { sizePosition } from './sizing.js';
import { getSpotPrice } from './market.js';
import { getBalance } from '../db/balances.js';
import { client } from './client.js';
import { toPayoutContracts, payoutToUsdc } from './decimals.js';

/** USDC has 6 decimals; rounding there keeps float noise out of the payload. */
const usdc = (n) => Math.round(n * 1e6) / 1e6;
const pct = (n) => Math.round(n * 1e4) / 1e4;

/**
 * Outcome at a few representative settlement prices (task 1.8, US-4).
 *
 * Pure client-side via utils.calculatePayoutAtPrice - no order is placed and no
 * chain call is made. The contract count is rescaled to the payout helper's 18
 * decimals at the boundary (toPayoutContracts); passing the order's own 6dp
 * value straight in is a 10^12 error that returns a plausible number and does
 * not throw.
 *
 * Each row describes the PROTECTED portion only: the value of the covered units
 * at that price, the payout the protection adds, and the net after the premium.
 * Above the floor the payout is zero and the user simply keeps the asset; at or
 * below the floor, value + payout is flat at the floor - the shape that makes a
 * put insurance rather than a directional bet. The frontend turns these numbers
 * into the good/bad scenario view (BR-3: no jargon in the wording).
 *
 * @param {object} chosen - a tier from selectProtectionTiers(); chosen.order is
 *   the OrderWithSignature, so chosen.order.order is the struct the helper wants
 * @param {object} size - the sizePosition() result for this tier
 * @param {number} spot
 * @returns {Array<{label:string, priceUsdc:number, holdingValueUsdc:number, payoutUsdc:number, netUsdc:number}>}
 */
function buildScenarios(chosen, size, spot) {
  if (size.contractsRaw <= 0n) return [];

  const contracts18 = toPayoutContracts(size.contractsRaw);

  // Representative prices, highest first: a rise (protection unused), unchanged,
  // exactly the floor (the boundary where payout is still zero), and a fall well
  // below the floor (where the protection pays).
  const prices = [
    { label: 'up', priceUsdc: spot * 1.10 },
    { label: 'flat', priceUsdc: spot },
    { label: 'atFloor', priceUsdc: chosen.strike },
    { label: 'down', priceUsdc: spot * 0.80 },
  ];

  return prices.map(({ label, priceUsdc }) => {
    // Settlement price is 8 decimals, same scale as strikePrice (see decimals.js).
    const price8 = BigInt(Math.round(priceUsdc * 1e8));
    const payoutUsdc = payoutToUsdc(
      client.utils.calculatePayoutAtPrice(chosen.order.order, contracts18, price8),
    );
    const holdingValueUsdc = priceUsdc * size.contracts;

    return {
      label,
      priceUsdc: usdc(priceUsdc),
      // Value of the protected units alone at this price, before any payout.
      holdingValueUsdc: usdc(holdingValueUsdc),
      // What the protection pays here: zero above the floor.
      payoutUsdc: usdc(payoutUsdc),
      // What the user ends with on the protected portion, net of the premium.
      netUsdc: usdc(holdingValueUsdc + payoutUsdc - size.premiumUsdc),
    };
  });
}

/**
 * A quote could not be produced. Carries a machine-readable `code` so the API
 * layer can map it without parsing the message.
 */
export class QuoteRefusedError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'QuoteRefusedError';
    this.code = code;
    this.details = details;
  }
}

/**
 * The priced body of one protection tier.
 *
 * Shared by buildQuote() and buildQuoteSet() so the numbers a user is shown
 * are produced in exactly one place. Two builders would eventually disagree,
 * and the disagreement would be about money.
 *
 * @param {object} chosen - a tier from selectProtectionTiers()
 * @param {object} selection - the full selection result
 * @param {number} units - units the user asked to protect
 * @param {object} [opts]
 * @param {string} [opts.tierId]
 * @returns {object} tier body, with the signed order attached non-enumerably
 */
function buildTier(chosen, selection, units, { tierId } = {}) {
  // depth: clamp. No premium cap here - see the note on buildQuote. boundBy
  // can only be 'requested' or 'collateral' in a quote.
  const size = sizePosition(chosen.order, { units });

  const { spot } = selection;
  const unprotectedUnits = Math.max(0, units - size.contracts);

  // BR-2 - three different figures, deliberately kept apart.
  const onProtection = usdc(size.premiumUsdc);
  const onProtectedPortion = usdc((spot - chosen.strike) * size.contracts + size.premiumUsdc);
  const onWholeHolding = usdc(onProtectedPortion + unprotectedUnits * spot);

  const body = {
    ...(tierId ? { tierId } : {}),
    recommended: Boolean(chosen.recommended),

    // BR-6 - what the book actually gave, never what was asked for.
    actual: {
      tier: chosen.label,
      floorUsdc: usdc(chosen.floorUsd),
      protectionPct: pct(chosen.protectionPct),
      expiry: chosen.expiry.toISOString(),
      daysToExpiry: pct(chosen.daysToExpiry),
      expiryGapDays: pct(selection.selection.gapDays),
    },

    size: {
      contracts: size.contracts,
      // 6 decimals, as fillOrder consumes it. String because it is a bigint.
      contractsRaw: size.contractsRaw.toString(),
      protectedUnits: size.protectedUnits,
      boundBy: size.boundBy,
    },

    cost: {
      premiumUsdc: onProtection,
      premiumPerContractUsdc: usdc(chosen.costPerUnit),
      premiumPctOfSpot: pct(chosen.costPctOfSpot),
    },

    // BR-2 - the loss on the protection and the loss on the position are
    // different numbers and must never be conflated.
    maxLoss: {
      // What the protection itself can cost: the premium, and nothing more.
      onProtection,
      // What this purchase can cost in total: every point of decline down to
      // the floor on the units actually covered, plus the premium.
      onProtectedPortion,
      // The whole holding's exposure, including units this quote does not
      // cover. Real, and the UI may want it - but NOT the headline. The
      // unprotected part is pre-existing exposure that this purchase does not
      // create or worsen; presenting it as "the maximum loss on this purchase"
      // would make buying protection look like it increased risk.
      onWholeHolding,
      // The confirmation screen figure (BR-2). Deliberately the protected
      // portion. Do not "fix" this to onWholeHolding - see the note above.
      forConfirmation: onProtectedPortion,
    },

    // BR-6 / BR-43 - what the user is not getting, stated as plainly as what
    // they are.
    disclosure: {
      expiryLaterThanRequested: selection.selection.gapDays > 1,
      sizeReduced: size.boundBy !== 'requested',
      unprotectedUnits: Math.round(unprotectedUnits * 1e8) / 1e8,
      // The unit count alone means little; the value is what a user reads.
      unprotectedValueUsdc: usdc(unprotectedUnits * spot),
      strikesAvailableAtExpiry: selection.availableStrikes,
    },

    payout: {
      floorValueUsdc: usdc(size.contracts * chosen.floorUsd),
      maxPayoutUsdc: usdc(size.maxPayoutUsdc),
    },

    // US-4 / task 1.8 - what the user ends with at a few representative prices,
    // computed from the real order. Above the floor the payout is zero; at or
    // below it the payout tops the protected units back up to the floor.
    scenarios: buildScenarios(chosen, size, spot),

    // BR-45 / BR-46 as data, not copy. Settlement pays USDC, never fiat, and
    // these are European options - nothing pays out before expiry however far
    // the price falls in between. The frontend turns this into wording.
    settlement: {
      style: 'european',
      paysIn: 'USDC',
    },
  };

  // The fill path needs the signed order, but it is full of BigInt and has no
  // business in a UI payload. Non-enumerable, so JSON.stringify() omits it.
  Object.defineProperty(body, 'order', {
    value: chosen.order,
    enumerable: false,
    writable: false,
  });

  return body;
}

/**
 * Build a single-tier quote.
 *
 * ---------------------------------------------------------------------------
 * Two limits can bind here, and they are NOT interchangeable
 * ---------------------------------------------------------------------------
 *
 *   balance  - a fact about the USER. Quoting more than they hold would invent
 *              a position that does not exist, turning insurance into a
 *              directional bet. REFUSE. (UC-0 E1, BR-49)
 *
 *   depth    - a fact about the MARKET. The book holds what it holds; offering
 *              the largest fillable size is honest, provided we say so.
 *              CLAMP and disclose. (UC-1 A3)
 *
 * They look alike at the call site and will be conflated if not named.
 *
 * ---------------------------------------------------------------------------
 * The premium cap is deliberately NOT applied here. Do not add it back.
 * ---------------------------------------------------------------------------
 *
 * MAX_PREMIUM_PER_FILL_USDC is an operational guard of OURS, not a fact about
 * the user or the market. BR-33 requires that a misplaced decimal be impossible
 * to *broadcast* - and broadcasting is the fill path, not the pricing path.
 *
 * Applying it here would let an internal safety limit shape the price a user is
 * shown: quotes would come back partially covered because of a number in our
 * .env, not because of anything true about the book. A quote reflects the
 * market.
 *
 * The cap belongs in Phase 3's pre-flight checklist, alongside the balance and
 * gas checks and before callStaticFillOrder (BR-28) - see IMPLEMENT.md 3.5b.
 * sizePosition() still accepts maxPremiumUsdc for exactly that caller.
 *
 * @param {string} asset
 * @param {object} opts
 * @param {number} opts.units - units of the asset to protect
 * @param {number} [opts.balance] - the user's recorded holding (BR-49)
 * @param {Date|string|number} [opts.targetDate] - date, ISO string, or days out
 * @param {string} [opts.tier] - 'highest' | 'middle' | 'lowest'
 * @param {number} [opts.validitySeconds] - quote lifetime (BR-8)
 * @returns {Promise<object>} JSON-safe quote DTO
 * @throws {QuoteRefusedError}
 */
export async function buildQuote(asset, {
  units,
  balance,
  targetDate = 25,
  tier = 'middle',
  validitySeconds = 60,
} = {}) {
  if (!Number.isFinite(units) || units <= 0) {
    throw new RangeError(`buildQuote: units must be a positive number, got ${units}`);
  }

  // balance: refuse. The user asked for something we cannot honestly offer -
  // silently shrinking it would quote protection on assets they do not hold.
  if (balance !== undefined && units > balance) {
    throw new QuoteRefusedError(
      'BALANCE_EXCEEDED',
      `cannot protect ${units} ${asset}: recorded holding is ${balance} ${asset}`,
      { requested: units, balance, asset },
    );
  }

  const selection = await selectProtectionTiers(asset, targetDate);

  if (!selection.expiry) {
    throw new QuoteRefusedError(
      'NO_EXPIRY',
      selection.selection.reason ?? 'no expiry available for the requested date',
      {
        requestedDate: selection.selection.requestedDate.toISOString(),
        // The date, not just the day count - the interface tells the user
        // "the longest available protection ends X, you selected Y", and it
        // should not have to reconstruct X from a number of days.
        longestAvailableDate: selection.selection.longestAvailable?.expiry.toISOString() ?? null,
        longestAvailableDays: selection.selection.longestAvailable?.daysToExpiry ?? null,
        shortfallDays: selection.selection.shortfallDays,
      },
    );
  }

  const chosen = selection.tiers.find((t) => t.label === tier)
    ?? selection.tiers.find((t) => t.recommended)
    ?? selection.tiers[0];

  if (!chosen) {
    throw new QuoteRefusedError('NO_TIERS', `no strikes below spot for ${asset} at this expiry`, {});
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + validitySeconds * 1000);
  const body = buildTier(chosen, selection, units);

  const quote = {
    quoteId: randomUUID(),

    // BR-8 - a quote is only good for a window, and must be re-checked before
    // it is acted on. Never execute an expired one.
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    validForSeconds: validitySeconds,

    asset,
    spot: usdc(selection.spot),

    requested: {
      units,
      targetDate: selection.selection.requestedDate.toISOString(),
      tier,
    },

    ...body,
  };

  // Carried through from the tier body, which holds it non-enumerably.
  Object.defineProperty(quote, 'order', {
    value: body.order,
    enumerable: false,
    writable: false,
  });

  return quote;
}

/**
 * Is this quote still inside its validity window? (BR-8)
 *
 * @param {object} quote
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isQuoteFresh(quote, now = new Date()) {
  return now.getTime() < new Date(quote.expiresAt).getTime();
}

/**
 * Throw unless the quote is still fresh. Call before acting on one - BR-8
 * requires an expired quote to be refreshed and re-confirmed, never executed.
 *
 * @param {object} quote
 * @param {Date} [now]
 */
export function assertQuoteFresh(quote, now = new Date()) {
  if (!isQuoteFresh(quote, now)) {
    throw new QuoteRefusedError(
      'QUOTE_EXPIRED',
      `quote ${quote.quoteId} expired at ${quote.expiresAt}`,
      { quoteId: quote.quoteId, expiresAt: quote.expiresAt },
    );
  }
}

// ---------------------------------------------------------------------------
// Quote sets (IMPLEMENT.md 1.7 and the API layer)
// ---------------------------------------------------------------------------

/**
 * The target date a percentage-based request implies.
 *
 * The user gave a protection level, not a date, so we quote the longest
 * protection the book can actually deliver. Picking a fixed number of days
 * would start failing the moment the book's longest tenor drops below it, and
 * a shorter default would quietly sell less protection than is available.
 *
 * @param {string} asset
 * @returns {Promise<Date>}
 */
async function longestAvailableTarget(asset) {
  const { expiries } = await listExpiries(asset);
  const longest = expiries.at(-1);
  if (!longest) {
    throw new QuoteRefusedError('NO_TIERS', `no buyable puts below spot for ${asset}`, { asset });
  }
  return longest.expiry;
}

/**
 * Derive the strike the user actually asked for, before the book rounds it.
 *
 * Stored and disclosed alongside the strike they got (BR-6): the gap between
 * the two is the honest part of this product, and hiding it is what BR-6
 * exists to prevent.
 *
 * @returns {{ requestedStrike: number, targetDate: Date|string|number }}
 */
async function deriveRequest(asset, { mode, units, protectionPct, targetValueUsdc, targetDate, spot }) {
  if (mode === 'percentage') {
    if (!Number.isFinite(protectionPct) || protectionPct <= 0 || protectionPct >= 100) {
      throw new QuoteRefusedError(
        'INVALID_REQUEST',
        'protectionPct must be a number between 0 and 100',
        { protectionPct },
      );
    }
    // BR-4
    return {
      requestedStrike: spot * (1 - protectionPct / 100),
      targetDate: targetDate ?? await longestAvailableTarget(asset),
    };
  }

  if (mode === 'goal') {
    if (!Number.isFinite(targetValueUsdc) || targetValueUsdc <= 0) {
      throw new QuoteRefusedError(
        'INVALID_REQUEST',
        'targetValueUsdc must be a positive number',
        { targetValueUsdc },
      );
    }
    if (!targetDate) {
      throw new QuoteRefusedError('INVALID_REQUEST', 'targetDate is required for a goal request', {});
    }
    // BR-5: the floor that makes the holding worth the target on that date.
    // BR-45: the target is USDC. Settlement pays USDC and the exchange rate to
    // any local currency is not something this product can promise.
    return { requestedStrike: targetValueUsdc / units, targetDate };
  }

  throw new QuoteRefusedError('INVALID_REQUEST', `unknown mode "${mode}"`, { mode });
}

/**
 * Build the set of protection choices for one request.
 *
 * This is the entry point the API uses. It owns BR-49: the balance is read
 * here and a request larger than the holding is refused here. The rule lives
 * in one place on purpose - a second check in the HTTP layer would be a second
 * implementation, and two implementations drift until nobody can say which one
 * is the product.
 *
 * Returns the JSON-safe DTO the interface consumes. Each tier keeps its signed
 * order on a non-enumerable `order` property for the fill path.
 *
 * @param {string} asset
 * @param {object} opts
 * @param {string} opts.userId - whose balance to quote against (BR-49)
 * @param {number} opts.units - units of the asset to protect
 * @param {'percentage'|'goal'} opts.mode
 * @param {number} [opts.protectionPct] - percentage mode (BR-4)
 * @param {number} [opts.targetValueUsdc] - goal mode (BR-5)
 * @param {Date|string|number} [opts.targetDate] - goal mode; optional otherwise
 * @param {number} [opts.validitySeconds] - BR-8
 * @returns {Promise<object>}
 * @throws {QuoteRefusedError}
 */
export async function buildQuoteSet(asset, {
  userId,
  units,
  mode = 'percentage',
  protectionPct,
  targetValueUsdc,
  targetDate,
  validitySeconds = 60,
} = {}) {
  if (!Number.isFinite(units) || units <= 0) {
    throw new QuoteRefusedError('INVALID_REQUEST', `units must be a positive number, got ${units}`, { units });
  }

  // BR-49 / UC-0 E1. Protection is only quoted against a holding the system
  // has a record of; quoting more would invent a position and turn insurance
  // into a directional bet. Refuse rather than silently shrink - the user
  // asked for something we cannot honestly offer.
  const balanceRow = await getBalance(userId, asset);
  const balance = balanceRow ? Number(balanceRow.amount) : 0;

  if (units > balance) {
    throw new QuoteRefusedError(
      'BALANCE_EXCEEDED',
      `cannot protect ${units} ${asset}: recorded holding is ${balance} ${asset}`,
      { requested: units, balance, asset },
    );
  }

  const spot = await getSpotPrice(asset);
  const { requestedStrike, targetDate: resolvedTarget } =
    await deriveRequest(asset, { mode, units, protectionPct, targetValueUsdc, targetDate, spot });

  const selection = await selectProtectionTiers(asset, resolvedTarget);

  if (!selection.expiry) {
    throw new QuoteRefusedError(
      'NO_EXPIRY',
      selection.selection.reason ?? 'no expiry available for the requested date',
      {
        requestedDate: selection.selection.requestedDate.toISOString(),
        longestAvailableDate: selection.selection.longestAvailable?.expiry.toISOString() ?? null,
        longestAvailableDays: selection.selection.longestAvailable?.daysToExpiry ?? null,
        shortfallDays: selection.selection.shortfallDays,
      },
    );
  }

  if (selection.tiers.length === 0) {
    throw new QuoteRefusedError('NO_TIERS', `no strikes below spot for ${asset} at this expiry`, { asset });
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + validitySeconds * 1000);

  const tiers = selection.tiers.map((chosen) =>
    buildTier(chosen, selection, units, { tierId: randomUUID() }));

  return {
    quoteId: randomUUID(),

    // BR-8. The set is good for a window and must be re-checked before it is
    // acted on; an expired one is refreshed and re-confirmed, never executed.
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    validForSeconds: validitySeconds,

    asset,
    spot: usdc(selection.spot),

    requested: {
      units,
      mode,
      targetDate: selection.selection.requestedDate.toISOString(),
      // BR-6: kept so the gap between what was asked for and what the book
      // could give is always recoverable.
      requestedStrikeUsdc: usdc(requestedStrike),
      ...(mode === 'percentage' ? { protectionPct } : { targetValueUsdc }),
    },

    tiers,
  };
}
