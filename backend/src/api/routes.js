// Route handlers (IMPLEMENT.md 5.1, backend half).
//
// Each handler translates HTTP into a domain call and returns a plain object.
// Business rules are not re-checked here - BR-49 lives in quote.js, BR-8 in
// the quote store and the stored row. A rule implemented in two places is a
// rule with two answers.

import { buildQuoteSet, QuoteRefusedError } from '../thetanuts/quote.js';
import { stressLoanById } from '../lending/stress.js';
import { insertPurchasedTier } from '../db/quotes.js';
import { insertPendingPosition, listPositionsByUser, listBalances, transitionPosition } from '../db/index.js';
import { debitBalance, listBalanceEventsForPositions } from '../db/balances.js';
import { getDemoUser } from './demoUser.js';
import { getQuoteSet, rememberQuoteSet, forgetQuoteSet } from './quoteStore.js';
import { ApiError } from './errors.js';
import { strikeView, paymentView, sumPayments } from './positionView.js';
import { buildMarketContext } from './marketContext.js';
import { resolveMarket, resolveRange, MARKET_ASSETS, RANGE_KEYS } from '../marketdata/assets.js';
import { fetchOverview, fetchCandles, fetchDepth } from '../marketdata/providers.js';

/**
 * GET /api/demo-context
 *
 * BR-51: the balance is simulated and says so. Quotes, fills and settlement
 * are real, and blurring the two is worse than either alone.
 */
export async function getDemoContext() {
  const user = await getDemoUser();
  const balances = await listBalances(user.id);

  return {
    displayName: user.display_name,
    balances: balances.map((b) => ({ asset: b.asset, amount: Number(b.amount) })),
    // The spending balance, called out so the interface does not have to find
    // it among the asset holdings. Simulated like the rest (BR-50).
    usdcBalance: Number(balances.find((b) => b.asset === 'USDC')?.amount ?? 0),
    // Kept: the balance is seeded, never deposited (BR-50).
    simulated: true,
    reality: REALITY,
  };
}

/**
 * Where the boundary between simulated and real currently sits (BR-51).
 *
 * Four stages, four independent answers. The interface previously had two
 * states - "mock" and "real" - and no way to express the one we are actually
 * in: live quotes off the Base order book, with the fill executed by the
 * operator rather than by the confirm button. In that state the old "real"
 * copy told the user a transaction had been sent, which was untrue.
 *
 *   balance     'simulated'  seeded, no deposit flow exists (BR-50)
 *   quote       'live'       priced from the live book, every time
 *   fill        'operator'   POST /api/purchase does NOT broadcast. A person
 *                            runs scripts/fill.js. Becomes 'automatic' if the
 *                            fill is ever wired into the request path.
 *   settlement  'live'       read from chain by the scheduler
 *
 * Values come from a closed set so the interface can switch on them rather
 * than inferring from nulls. The wording is the frontend's (BR-3).
 */
export const REALITY = Object.freeze({
  balance: 'simulated',
  quote: 'live',
  fill: 'operator',
  settlement: 'live',
});

/**
 * POST /api/quote
 *
 * Shape validation only. Whether the request is *allowed* - the balance, the
 * available expiries, the strikes - is decided by buildQuoteSet, which throws
 * a coded refusal the envelope maps to a status.
 */
export async function postQuote(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError('INVALID_REQUEST', 'A JSON body is required.');
  }

  const { asset, units, mode, protectionPct, targetValueUsdc, targetDate } = body;

  if (typeof asset !== 'string' || asset.trim() === '') {
    throw new ApiError('INVALID_REQUEST', 'asset is required.', { field: 'asset' });
  }
  if (typeof units !== 'number' || !Number.isFinite(units) || units <= 0) {
    throw new ApiError('INVALID_REQUEST', 'units must be a positive number.', { field: 'units' });
  }
  if (mode !== 'percentage' && mode !== 'goal') {
    throw new ApiError('INVALID_REQUEST', 'mode must be "percentage" or "goal".', { field: 'mode' });
  }

  const user = await getDemoUser();

  const set = await buildQuoteSet(asset.trim().toUpperCase(), {
    userId: user.id,
    units,
    mode,
    protectionPct,
    targetValueUsdc,
    targetDate,
    validitySeconds: Number(process.env.QUOTE_VALIDITY_SECONDS ?? 60),
  });

  // Held so purchase can verify what the user was actually shown, rather than
  // trusting numbers that come back from the browser.
  rememberQuoteSet(set);

  return set;
}

/**
 * POST /api/purchase
 *
 * The client sends an identifier and nothing else. No price, no strike, no
 * amount - every figure comes from the set the server served and the row it
 * persists (BR-40). A browser cannot talk this endpoint into buying something
 * other than what was on screen.
 *
 * Nothing is broadcast here. Phase 3 owns the fill; this writes the row that
 * BR-14 requires to exist before any transaction is sent.
 */
export async function postPurchase(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError('INVALID_REQUEST', 'A JSON body is required.');
  }

  const { quoteId, tierId } = body;

  if (typeof quoteId !== 'string' || typeof tierId !== 'string') {
    throw new ApiError('INVALID_REQUEST', 'quoteId and tierId are required.', {
      field: typeof quoteId !== 'string' ? 'quoteId' : 'tierId',
    });
  }

  // BR-8. Expired sets are gone from the store, so this covers both "never
  // existed" and "lapsed" - both mean the user must re-quote and re-confirm.
  const set = getQuoteSet(quoteId);
  if (!set) {
    throw new QuoteRefusedError('QUOTE_EXPIRED', 'The quote has expired. Request a new one.', { quoteId });
  }

  const tier = set.tiers.find((t) => t.tierId === tierId);
  if (!tier) {
    throw new ApiError('INVALID_REQUEST', 'The selected tier does not belong to this quote.', { quoteId, tierId });
  }

  const user = await getDemoUser();

  // Logged before anything is written. When Phase 3 starts spending real
  // money, this line is the first thing to reach for when a filled position
  // does not match what the user says they were shown.
  console.log('[purchase] resolved tier', JSON.stringify({
    quoteSetId: set.quoteId,
    tierId: tier.tierId,
    tier: tier.actual.tier,
    userId: user.id,
    asset: set.asset,
    spotAtQuote: set.spot,
    strike: tier.actual.floorUsdc,
    premiumUsdc: tier.cost.premiumUsdc,
    contracts: tier.size.contracts,
    contractsRaw: tier.size.contractsRaw,
    expiry: tier.actual.expiry,
    boundBy: tier.size.boundBy,
  }));

  // Persist what was chosen, then the position that references it. Order
  // matters: the position's quote_id must point at a row that exists.
  const quoteRow = await insertPurchasedTier({ userId: user.id, set, tier });

  const position = await insertPendingPosition({
    userId: user.id,
    quoteId: quoteRow.id,
    asset: set.asset,
    strike: tier.actual.floorUsdc,
    strikeRaw: String(tier.order?.order?.strikePrice ?? ''),
    expiry: tier.actual.expiry,
    numContractsRaw: tier.size.contractsRaw,
    premiumPaid: null,   // nothing has been paid; Phase 3 records the real fill
  });

  // Charge the user: AFTER the position row exists so the debit can name what
  // it paid for, and BEFORE any fill. Debit-then-compensate, for the same
  // reason BR-14 writes the row before broadcasting - a fill that spent against
  // a balance we never reserved would be unrecoverable, while a debit with no
  // fill is visible and reversible (see refundBalance).
  //
  // The money has not left the custodial wallet yet: the operator fills later.
  // So this is a HOLD, and the interface must say "payment held" rather than
  // "paid" until fill === 'onchain'.
  let balanceRemaining = null;
  try {
    balanceRemaining = await debitBalance({
      userId: user.id,
      asset: 'USDC',
      amount: tier.cost.premiumUsdc,
      positionId: position.id,
      reason: 'premium for ' + set.asset + ' protection at $' + tier.actual.floorUsdc,
    });
  } catch (error) {
    if (error.code === 'INSUFFICIENT_BALANCE') {
      // The position row stays. It is the record of an attempt that was
      // refused, and BR-14's reasoning applies to refusals too.
      await transitionPosition(position.id, {
        toStatus: 'failed',
        eventType: 'failed',
        payload: { reason: 'insufficient USDC balance to pay the premium' },
      });
      forgetQuoteSet(quoteId);
      throw new QuoteRefusedError('BALANCE_EXCEEDED', error.message, {
        premiumUsdc: tier.cost.premiumUsdc,
        asset: 'USDC',
      });
    }
    throw error;
  }

  // One purchase per set. Leaving it available would let a second click buy a
  // second position from the same offer - the database also refuses that via
  // UNIQUE (quote_id), but not reaching that point is better.
  forgetQuoteSet(quoteId);

  return {
    positionId: position.id,
    // Null, not a synthesised hash. Nothing was broadcast, and inventing a
    // transaction id would make sample data look verifiable - exactly what
    // the interface stopped doing on purpose.
    txHash: null,
    explorerUrl: null,
    optionAddress: null,
    status: 'pending_fill',
    simulated: true,
    // 'operator': the row is written and a person fills it with
    // scripts/fill.js. The confirm button did not send a transaction, and the
    // interface must not say it did (BR-51).
    fill: REALITY.fill,
    // Held, not paid. The operator has not filled yet, so the money is
    // reserved rather than spent - the same principle as the interface only
    // claiming "protected" when fill === 'onchain'.
    paymentStatus: 'held',
    premiumUsdc: tier.cost.premiumUsdc,
    usdcBalanceRemaining: balanceRemaining,
  };
}

/**
 * GET /api/positions
 *
 * The demo user is chosen server-side; the client cannot ask for someone
 * else's positions.
 */
export async function getPositions() {
  const user = await getDemoUser();
  const rows = await listPositionsByUser(user.id);

  // One query for every position, rather than one per row. The money trail is
  // the only place a refund is recorded - positions.status says 'failed', which
  // is not the same as saying the user got their money back.
  const payments = await listPaymentsForPositions(rows.map((p) => p.id));

  return {
    positions: rows.map((p) => ({
      positionId: p.id,
      asset: p.asset,
      // 6 decimals: one contract protects one unit of the underlying.
      protectedAmount: Number(p.num_contracts_raw) / 1e6,

      // --- put or call, and what the strike MEANS ------------------------
      //
      // A put strike is a floor: the price below which the holder is
      // protected. A call strike is a threshold: the price above which they
      // share the gain. Same number, opposite meaning.
      //
      // So the fields are mutually exclusive and each is null when it does not
      // apply. The dashboard rendered a vault call as "Protection floor $2,680"
      // - a floor above spot - because there was one field and it was always
      // populated. A null cannot be rendered as the wrong label.
      ...strikeView(p.option_type, p.strike),

      expiry: p.expiry,
      premiumPaidUsdc: p.premium_paid === null ? 0 : Number(p.premium_paid),
      status: p.status,
      payoutUsdc: p.payout === null ? null : Number(p.payout),
      settlementPriceUsdc: p.settlement_price === null ? null : Number(p.settlement_price),

      // The hash itself, not only a link. The interface shows a truncated
      // hash next to the link, and could not do that from a URL alone.
      txHash: p.tx_hash,
      optionAddress: p.option_address,
      explorerUrl: p.tx_hash ? `https://basescan.org/tx/${p.tx_hash}` : null,

      // Per position, because they differ: a position filled by the operator
      // has a real transaction, while one whose row exists but has not been
      // filled yet does not. 'onchain' is a promise the interface may make;
      // 'operator' is not.
      fill: p.tx_hash ? 'onchain' : 'operator',
      simulated: p.tx_hash === null,

      // --- what happened to the user's money -----------------------------
      //
      // 'failed' says the purchase did not happen. It does not say whether the
      // user was charged, or refunded, and the interface had nothing to render
      // but "Payment status unavailable". A refunded position should be able to
      // say so - it is the difference between "we lost your order" and "we lost
      // your order and gave your money back".
      ...paymentView(payments.get(p.id), p),
    })),
  };
}

/**
 * The money trail for a set of positions, keyed by position id.
 *
 * One query for all of them rather than one per row. The totals are turned into
 * a status by paymentView() in positionView.js, which is pure and tested.
 *
 * @param {string[]} positionIds
 * @returns {Promise<Map<string, object>>}
 */
async function listPaymentsForPositions(positionIds) {
  const out = new Map();
  if (positionIds.length === 0) return out;

  const events = await listBalanceEventsForPositions(positionIds);

  for (const id of positionIds) {
    out.set(id, sumPayments(events.filter((e) => e.position_id === id)));
  }

  return out;
}

/**
 * GET /api/loans/:loanId/stress?price=1800
 *
 * The no-liquidation comparison (7.5). Feeds a hypothetical price through both
 * sides - a conventional loan against the same ETH, and ours - and reports
 * whether each would be liquidated.
 *
 * The disclosure that no lending protocol is integrated travels in the payload,
 * not in the interface. Same principle as the reality block: a truth the screen
 * must tell should not depend on the screen remembering to tell it.
 */
export async function getLoanStress(loanId, priceParam, ruleParam) {
  if (priceParam === null || priceParam === undefined || priceParam === '') {
    throw new ApiError('INVALID_REQUEST', 'A price is required, e.g. ?price=1800.');
  }

  const price = Number(priceParam);
  if (!Number.isFinite(price) || price <= 0) {
    throw new ApiError('INVALID_REQUEST', `price must be a positive number, got '${priceParam}'.`);
  }

  const rule = ruleParam ?? 'as-disbursed';
  if (!['as-disbursed', 'current'].includes(rule)) {
    throw new ApiError('INVALID_REQUEST',
      `rule must be 'as-disbursed' or 'current', got '${ruleParam}'.`);
  }

  try {
    return await stressLoanById(loanId, price, rule);
  } catch (error) {
    // PostgREST reports a missing single() row as code PGRST116 - the message
    // only says the result could not be coerced to one object, and the "0 rows"
    // detail is on a different field. Matching the message alone therefore does
    // not catch it, and it surfaces as UPSTREAM_ERROR: telling the caller the
    // service broke when in fact they asked for something that isn't there.
    if (error?.code === 'PGRST116' || /0 rows|no rows|not found/i.test(error?.message ?? '')) {
      throw new ApiError('NOT_FOUND', `No loan ${loanId}.`);
    }
    throw error;
  }
}

/**
 * GET /api/market-context
 *
 * Live prices and what protection is actually purchasable right now, per asset.
 *
 * NOTHING HERE IS CACHED, deliberately - see the note at the top of
 * marketContext.js. `longestProtectionDays` is what the date picker caps
 * against, and the book's expiries roll daily; a cached cap lets a user choose a
 * date that was reachable an hour ago and be refused at the quote step.
 */
export async function getMarketContext() {
  const user = await getDemoUser();
  const balances = await listBalances(user.id);

  // Holdings come from the user's seeded balances, so an asset the demo user
  // does not hold still appears - with its real price and availability - and
  // simply shows zero held.
  const holdings = Object.fromEntries(
    balances.filter((b) => b.asset !== 'USDC').map((b) => [b.asset, Number(b.amount)]),
  );

  return buildMarketContext({ holdings });
}

// ---------------------------------------------------------------------------
// Coin Detail market data. DISPLAY ONLY.
// ---------------------------------------------------------------------------
//
// These read CoinGecko and Binance. Nothing they return may price a trade: no
// quote, fill, credit limit, participation rate or settlement figure reads from
// them. Protection is priced on Thetanuts and nowhere else, and
// test/marketdataIsolation.test.js fails if that stops being true.
//
// Every failure is a 503 the interface renders as "unavailable". Never a shaped
// response with plausible numbers in it.

/** Turn a provider failure into the API envelope. */
function asMarketDataError(error) {
  if (error?.code === 'MARKET_DATA_UNAVAILABLE') {
    return new ApiError('MARKET_DATA_UNAVAILABLE', error.message, {
      provider: error.provider,
      status: error.status ?? undefined,
    });
  }
  return error;
}

/**
 * GET /api/assets/overview
 *
 * All four assets in one CoinGecko request. USD, and the payload says so - it
 * is not Binance's USDT price and not our USDC protection quotes.
 */
export async function getAssetsOverview() {
  try {
    return await fetchOverview();
  } catch (error) {
    throw asMarketDataError(error);
  }
}

/**
 * GET /api/assets/:symbol/candles?range=1D
 *
 * OHLCV from Binance, so one response drives either a line chart (close) or
 * candles (open/high/low/close). Prices are USDT.
 */
export async function getAssetCandles(symbol, rangeParam) {
  const asset = resolveMarket(symbol);
  if (!asset) {
    throw new ApiError('NOT_FOUND', `No market data for '${symbol}'.`, {
      supported: MARKET_ASSETS.map((a) => a.symbol),
    });
  }

  const range = resolveRange(rangeParam);
  if (!range) {
    throw new ApiError('INVALID_REQUEST',
      `range must be one of ${RANGE_KEYS.join(', ')}.`, { supported: RANGE_KEYS });
  }

  try {
    return await fetchCandles(asset, range);
  } catch (error) {
    throw asMarketDataError(error);
  }
}

/**
 * GET /api/assets/:symbol/order-book
 *
 * A depth snapshot from ONE exchange. The response says so in `venue`, `scope`
 * and `scopeStatement` - a disclosure the interface renders rather than one it
 * decides whether to render, the same principle as isRealProtocol.
 *
 * There is no streaming endpoint, deliberately. Poll this every 2-3 seconds: at
 * a demo's timescale it looks the same as a live feed, and a dropped websocket
 * leaves a stale panel that looks like a working one.
 */
export async function getAssetOrderBook(symbol) {
  const asset = resolveMarket(symbol);
  if (!asset) {
    throw new ApiError('NOT_FOUND', `No market data for '${symbol}'.`, {
      supported: MARKET_ASSETS.map((a) => a.symbol),
    });
  }

  try {
    return await fetchDepth(asset);
  } catch (error) {
    throw asMarketDataError(error);
  }
}
