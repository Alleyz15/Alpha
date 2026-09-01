// Quotes (IMPLEMENT.md task 2.5).
//
// A quote row is the record of what was actually shown to a user before they
// committed. Most expire unused; the ones that do not are what a position is
// checked against.

import { db, unwrap } from './client.js';

/**
 * Persist a quote.
 *
 * `order_snapshot` matters more than it looks: when a fill fails, the first
 * question is always "what exactly did we try to buy?", and by then the book
 * has moved. Store the order as quoted, not a reference to it.
 *
 * DR-8 is enforced by a check constraint - a `percentage` quote carries
 * input_protection_pct and nothing else; a `goal` quote carries the target
 * value and date. The database will reject a row that mixes them.
 *
 * @param {object} quote
 * @returns {Promise<object>} the inserted row
 */
export async function insertQuote({
  userId,
  asset,
  inputMode,
  inputAmount,
  inputProtectionPct = null,
  inputTargetValue = null,
  inputTargetDate = null,
  spotPrice,
  requestedStrike,
  actualStrike,
  expiry,
  premium,
  numContractsRaw,
  orderSnapshot,
  validUntil,
  quoteSetId = null,
  tierLabel = null,
}) {
  return unwrap(
    await db.from('quotes').insert({
      user_id: userId,
      asset,
      input_mode: inputMode,
      input_amount: inputAmount,
      input_protection_pct: inputProtectionPct,
      input_target_value: inputTargetValue,
      input_target_date: inputTargetDate,
      spot_price: spotPrice,
      requested_strike: requestedStrike,
      actual_strike: actualStrike,
      expiry,
      premium,
      // 6 decimals, as a string - it is a bigint beyond JS safe-integer range.
      num_contracts_raw: String(numContractsRaw),
      order_snapshot: orderSnapshot,
      valid_until: validUntil,
      quote_set_id: quoteSetId,
      tier_label: tierLabel,
    }).select().single(),
    'insertQuote',
  );
}

/**
 * Persist the tier a user actually chose, at the moment they choose it.
 *
 * Only the purchased tier is stored. The other two were shown and declined,
 * and a `quotes` row records a commitment rather than a display. `quote_set_id`
 * keeps the row correlatable with the purchase log, which records the whole set.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {object} args.set - the served buildQuoteSet() result
 * @param {object} args.tier - the chosen tier from that set
 * @returns {Promise<object>} the inserted quote row
 */
export async function insertPurchasedTier({ userId, set, tier }) {
  const isGoal = set.requested.mode === 'goal';

  return insertQuote({
    userId,
    asset: set.asset,
    inputMode: set.requested.mode,
    inputAmount: set.requested.units,
    // DR-8: a quote carries the inputs its mode requires, and only those.
    inputProtectionPct: isGoal ? null : set.requested.protectionPct,
    inputTargetValue: isGoal ? set.requested.targetValueUsdc : null,
    inputTargetDate: isGoal ? set.requested.targetDate.slice(0, 10) : null,
    spotPrice: set.spot,
    // BR-6: both, so the gap stays recoverable.
    requestedStrike: set.requested.requestedStrikeUsdc,
    actualStrike: tier.actual.floorUsdc,
    expiry: tier.actual.expiry,
    premium: tier.cost.premiumUsdc,
    numContractsRaw: tier.size.contractsRaw,
    // The order as quoted. When a fill fails, this is the only record of what
    // we tried to buy - by then the book has moved.
    orderSnapshot: JSON.parse(JSON.stringify(tier.order ?? {}, (k, v) =>
      (typeof v === 'bigint' ? v.toString() : v))),
    validUntil: set.expiresAt,
    quoteSetId: set.quoteId,
    tierLabel: tier.actual.tier,
  });
}

/**
 * One quote, or null.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getQuote(id) {
  return unwrap(
    await db.from('quotes').select('*').eq('id', id).maybeSingle(),
    `getQuote(${id})`,
  );
}

/**
 * A user's quotes, newest first.
 * @param {string} userId
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
export async function listQuotesByUser(userId, limit = 50) {
  return unwrap(
    await db.from('quotes').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(limit),
    `listQuotesByUser(${userId})`,
  );
}
