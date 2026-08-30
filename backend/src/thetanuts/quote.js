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
import { selectProtectionTiers } from './selection.js';
import { sizePosition } from './sizing.js';

/** USDC has 6 decimals; rounding there keeps float noise out of the payload. */
const usdc = (n) => Math.round(n * 1e6) / 1e6;
const pct = (n) => Math.round(n * 1e4) / 1e4;

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
 * Build a quote.
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

  // depth: clamp. No premium cap here - see the note above. boundBy can only
  // be 'requested' or 'collateral' in a quote.
  const size = sizePosition(chosen.order, { units });

  const { spot } = selection;
  const unprotectedUnits = Math.max(0, units - size.contracts);

  // BR-2 - three different figures, deliberately kept apart.
  const onProtection = usdc(size.premiumUsdc);
  const onProtectedPortion = usdc((spot - chosen.strike) * size.contracts + size.premiumUsdc);
  const onWholeHolding = usdc(onProtectedPortion + unprotectedUnits * spot);

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + validitySeconds * 1000);

  const quote = {
    quoteId: randomUUID(),

    // BR-8 - a quote is only good for a window, and must be re-checked before
    // it is acted on. Never execute an expired one.
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    validForSeconds: validitySeconds,

    asset,
    spot: usdc(spot),

    requested: {
      units,
      targetDate: selection.selection.requestedDate.toISOString(),
      tier,
    },

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

    // BR-45 / BR-46 as data, not copy. Settlement pays USDC, never fiat, and
    // these are European options - nothing pays out before expiry however far
    // the price falls in between. The frontend turns this into wording.
    settlement: {
      style: 'european',
      paysIn: 'USDC',
    },
  };

  // Phase 3 needs the signed order to fill against, but it is full of BigInt
  // and has no business in a UI payload. Non-enumerable, so JSON.stringify()
  // omits it while quote.order still works server-side.
  Object.defineProperty(quote, 'order', {
    value: chosen.order,
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
