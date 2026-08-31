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
import { debitBalance } from '../db/balances.js';
import { getDemoUser } from './demoUser.js';
import { getQuoteSet, rememberQuoteSet, forgetQuoteSet } from './quoteStore.js';
import { ApiError } from './errors.js';

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

  return {
    positions: rows.map((p) => ({
      positionId: p.id,
      asset: p.asset,
      // 6 decimals: one contract protects one unit of the underlying.
      protectedAmount: Number(p.num_contracts_raw) / 1e6,
      protectionFloorUsdc: Number(p.strike),
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
    })),
  };
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
export async function getLoanStress(loanId, priceParam) {
  if (priceParam === null || priceParam === undefined || priceParam === '') {
    throw new ApiError('INVALID_REQUEST', 'A price is required, e.g. ?price=1800.');
  }

  const price = Number(priceParam);
  if (!Number.isFinite(price) || price <= 0) {
    throw new ApiError('INVALID_REQUEST', `price must be a positive number, got '${priceParam}'.`);
  }

  try {
    return await stressLoanById(loanId, price);
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
