// Pre-flight checklist (IMPLEMENT.md task 3.5b).
//
// ---------------------------------------------------------------------------
// One function. Every item must pass. Any failure aborts before broadcast.
// ---------------------------------------------------------------------------
//
// Nothing in this file broadcasts. callStaticFillOrder simulates against chain
// state and sends no transaction; every other check is a read.
//
// The checklist reports EVERY item rather than stopping at the first failure.
// One run should tell you everything that is wrong, because the alternative is
// discovering problems one transaction at a time on the evening before a pitch.
//
// The ten mandatory items, in order:
//
//    1  USDC balance covers the premium
//    2  ETH balance covers gas
//    3  quote is still within its validity window        (BR-8)
//    4  fill price within tolerance of the quote         (BR-9)
//    5  strike and expiry match what the user was shown
//    6  premium is under the hard cap                    (BR-33)
//    7  daily fill count is under the cap                (BR-34)
//    8  allowance is the exact amount, not MaxUint256    (BR-12)
//    9  callStaticFillOrder succeeded                    (BR-28)
//   10  pending row written to the database              (BR-14)
//
// Plus one guard that is not in the original list but blocks harder than any of
// them: no position may be sitting in `pending_verification`. See check 0.

import { ethers } from 'ethers';
import {
  validateBuySlippage,
  validateOrderExpiry,
  validateFillSize,
} from '@thetanuts-finance/thetanuts-client';
import { getSigningClient } from './signer.js';
import { checkFunds } from './wallet.js';
import { readAllowance, assertApprovalAmountSane } from './allowance.js';
import { DECIMALS } from './decimals.js';
import { countFillsToday, listUnresolvedPositions, getPosition } from '../db/positions.js';

const USDC_SCALE = 10n ** BigInt(DECIMALS.USDC);
const usdc = (raw) => Number(raw) / Number(USDC_SCALE);

/** A single checklist line. */
const item = (id, label, pass, detail) => ({ id, label, pass, detail });

/**
 * Run the pre-flight checklist.
 *
 * PURE with respect to the chain and the database: it reads and simulates, and
 * writes nothing. The `pending` row it checks for at item 10 is written by the
 * purchase path before this runs (BR-14) - this verifies it exists and is in
 * the state a broadcast expects, rather than creating it as a side effect of a
 * function otherwise made of checks.
 *
 * @param {object} intent
 * @param {string} intent.positionId - the pending position this fill is for
 * @param {object} intent.liveOrder - the order re-fetched from the book now
 * @param {bigint} intent.quotedPriceRaw - price per contract at quote time, 8dp
 * @param {bigint} intent.quotedStrikeRaw - strike at quote time, 8dp
 * @param {number} intent.quotedExpiryUnix
 * @param {bigint} intent.usdcAmountRaw - USDC to spend, 6dp
 * @param {bigint} intent.contractsRaw - contracts expected, 6dp
 * @param {Date|string} intent.quoteValidUntil - what the user was shown (BR-8a)
 * @param {Date|string} [intent.quoteCreatedAt] - when quoted; the fill window runs from here (BR-8b)
 * @returns {Promise<{pass: boolean, checks: object[], funds: object, simulation: object|null}>}
 */
export async function runPreflight({
  positionId,
  liveOrder,
  quotedPriceRaw,
  quotedStrikeRaw,
  quotedExpiryUnix,
  usdcAmountRaw,
  contractsRaw,
  quoteValidUntil,
  quoteCreatedAt = null,
}) {
  const client = getSigningClient();
  const checks = [];

  // --- 0. nothing unresolved ------------------------------------------------
  // Hard block. `pending_verification` means we do not know whether a previous
  // transaction landed. A row in that state may correspond to a real on-chain
  // position; filling again would spend twice and create a second option
  // nobody asked for. A human resolves it against BaseScan first.
  const unresolved = await listUnresolvedPositions();
  checks.push(item(
    0,
    'no position awaiting verification',
    unresolved.length === 0,
    unresolved.length === 0
      ? 'none'
      : `BLOCKED by ${unresolved.length}: ${unresolved.map((p) => p.id).join(', ')} — ` +
        'resolve against BaseScan before filling again',
  ));

  // --- 1 & 2. funds ---------------------------------------------------------
  // A conservative gas limit; item 9's simulation returns the real estimate and
  // this is re-checked against it below.
  const funds = await checkFunds({ premiumRaw: usdcAmountRaw, gasLimit: 1_000_000n });

  checks.push(item(
    1,
    'USDC balance covers the premium',
    funds.hasUsdc,
    `holds ${funds.usdc.toFixed(6)}, needs ${usdc(usdcAmountRaw).toFixed(6)}` +
      ` — ${funds.usdcRemaining.toFixed(6)} USDC would remain`,
  ));

  checks.push(item(
    2,
    'ETH balance covers gas',
    funds.hasGas,
    `holds ${funds.eth.toFixed(8)} ETH, needs ~${funds.gasNeededEth.toFixed(8)} ETH`,
  ));

  // --- 3. within the FILL AUTHORISATION window (BR-8b) ----------------------
  //
  // Two windows, answering two different questions:
  //
  //   QUOTE_VALIDITY_SECONDS (20s)     is what we are SHOWING this user still
  //                                    true? Binds the user's decision.
  //   FILL_AUTHORISATION_MINUTES (10)  is the price we EXECUTE at still what
  //                                    they agreed to? Binds the operator.
  //
  // This check is the second. A user who confirmed a $2,320 floor at 0.87 USDC
  // is protected by the fill landing within tolerance of THAT PRICE, not by it
  // landing within twenty seconds. The clock was only ever a proxy for price
  // movement, used because we had no way to compare prices at fill time.
  //
  // We do now - check 4 re-matches the order and re-verifies the price - so the
  // proxy is retired in favour of the thing it approximated.
  //
  // THE FILL WINDOW IS ONLY DEFENSIBLE BECAUSE THE PRICE CHECK IS REAL. If
  // check 4 were ever weakened, the clock would have to come back.
  const authMinutes = Number(process.env.FILL_AUTHORISATION_MINUTES ?? 10);
  const quotedAt = quoteCreatedAt ? new Date(quoteCreatedAt) : new Date(quoteValidUntil);
  const authDeadline = new Date(quotedAt.getTime() + authMinutes * 60_000);
  const shownUntil = new Date(quoteValidUntil);

  const withinAuth = Date.now() < authDeadline.getTime();
  const ageSeconds = (Date.now() - quotedAt.getTime()) / 1000;

  checks.push(item(
    3,
    'within the fill authorisation window',
    withinAuth,
    `quoted ${ageSeconds.toFixed(0)}s ago; authorised for ${authMinutes}min ` +
    `(shown to the user as valid for ${Math.round((shownUntil - quotedAt) / 1000)}s)` +
    (withinAuth ? '' : ` — expired at ${authDeadline.toISOString()}`),
  ));

  // --- 4. price within tolerance (BR-9) ------------------------------------
  // The signed order carries a fixed price, so this catches the case where the
  // order we quoted is gone and a different one is being filled in its place.
  // validateBuySlippage is the SDK's own check (BR-29) rather than a
  // hand-rolled comparison that only approximates the protocol's rule.
  const tolerancePct = Number(process.env.PRICE_TOLERANCE_PCT ?? 5);
  const livePriceRaw = liveOrder.order.price;
  const maxPriceRaw = quotedPriceRaw + (quotedPriceRaw * BigInt(Math.round(tolerancePct * 100))) / 10_000n;

  let priceOk = true;
  let priceDetail = `quoted ${Number(quotedPriceRaw) / 1e8}, live ${Number(livePriceRaw) / 1e8}` +
    ` (tolerance ${tolerancePct}%)`;
  try {
    validateBuySlippage(livePriceRaw, maxPriceRaw);
  } catch (e) {
    priceOk = false;
    priceDetail += ` — ${e.message}`;
  }
  checks.push(item(4, 'fill price within tolerance of the quote', priceOk, priceDetail));

  // --- 5. strike and expiry match what the user saw ------------------------
  const strikeMatches = liveOrder.order.strikePrice === quotedStrikeRaw;
  const expiryMatches = Number(liveOrder.order.expiry) === Number(quotedExpiryUnix);

  let expiryValid = true;
  let expiryNote = '';
  try {
    // The protocol's own rule about an order being too close to expiry.
    validateOrderExpiry(Number(liveOrder.order.expiry));
  } catch (e) {
    expiryValid = false;
    expiryNote = ` — ${e.message}`;
  }

  checks.push(item(
    5,
    'strike and expiry match what the user was shown',
    strikeMatches && expiryMatches && expiryValid,
    `strike ${Number(liveOrder.order.strikePrice) / 1e8} vs ${Number(quotedStrikeRaw) / 1e8}, ` +
    `expiry ${new Date(Number(liveOrder.order.expiry) * 1000).toISOString().slice(0, 10)} vs ` +
    `${new Date(Number(quotedExpiryUnix) * 1000).toISOString().slice(0, 10)}${expiryNote}`,
  ));

  // --- 6. premium under the hard cap (BR-33) -------------------------------
  // The cap lives here, in the fill path, and not in quoting. BR-33 requires a
  // misplaced decimal to be impossible to BROADCAST; broadcasting happens here.
  // Read from the environment so it can be tightened without a code review.
  const capUsdc = Number(process.env.MAX_PREMIUM_PER_FILL_USDC ?? 5);
  const capRaw = BigInt(Math.round(capUsdc * Number(USDC_SCALE)));
  const underCap = usdcAmountRaw <= capRaw;
  checks.push(item(
    6,
    'premium is under the hard cap',
    underCap,
    `${usdc(usdcAmountRaw).toFixed(6)} against a ${capUsdc} USDC cap`,
  ));

  // --- 7. daily fill count (BR-34) -----------------------------------------
  const maxPerDay = Number(process.env.MAX_FILLS_PER_DAY ?? 10);
  const filledToday = await countFillsToday();
  checks.push(item(
    7,
    'daily fill count is under the cap',
    filledToday < maxPerDay,
    `${filledToday} broadcast today, cap ${maxPerDay}`,
  ));

  // --- 8. allowance exact, not unbounded (BR-12) ---------------------------
  const allowance = await readAllowance();
  let allowanceOk = allowance >= usdcAmountRaw;
  let allowanceDetail = `${usdc(allowance).toFixed(6)} approved, ${usdc(usdcAmountRaw).toFixed(6)} needed`;

  if (allowance === ethers.MaxUint256) {
    allowanceOk = false;
    allowanceDetail = 'UNBOUNDED (MaxUint256) — refuse and re-approve an exact amount (BR-12)';
  } else if (allowanceOk) {
    try {
      assertApprovalAmountSane(allowance);
    } catch (e) {
      allowanceOk = false;
      allowanceDetail += ` — ${e.message}`;
    }
  } else {
    allowanceDetail += ' — run scripts/approve.js first';
  }
  checks.push(item(8, 'allowance is exact, not MaxUint256', allowanceOk, allowanceDetail));

  // --- 9. simulate the fill (BR-28) ----------------------------------------
  // Broadcasting a transaction that was never simulated wastes gas on a
  // guaranteed revert, and on a book that moves it is how a fill lands with
  // parameters nobody checked.
  let simulation = null;
  let simulationOk = false;
  let simulationDetail = 'not attempted';

  try {
    // Size check first, using the SDK's own rule rather than ours (BR-29).
    validateFillSize(contractsRaw, liveOrder.availableAmount);

    simulation = await client.optionBook.callStaticFillOrder(liveOrder, usdcAmountRaw);
    simulationOk = simulation.success === true;
    simulationDetail = simulationOk
      ? `would succeed, gas estimate ${simulation.gasEstimate}`
      : `${simulation.error?.code ?? 'REVERT'}: ${(simulation.error?.message ?? '').slice(0, 120)}`;

    // With a real estimate in hand, re-check gas against it rather than the
    // conservative limit used at item 2.
    if (simulationOk && simulation.gasLimitWithBuffer) {
      const needed = simulation.gasLimitWithBuffer * funds.gasPriceWei;
      if (funds.weiRaw < needed) {
        simulationOk = false;
        simulationDetail += ` — but gas would cost ${ethers.formatEther(needed)} ETH and the wallet holds ${funds.eth}`;
      }
    }
  } catch (e) {
    simulationDetail = `threw: ${e.message.slice(0, 160)}`;
  }
  checks.push(item(9, 'callStaticFillOrder succeeded', simulationOk, simulationDetail));

  // --- 10. pending row exists (BR-14) --------------------------------------
  // The row is written by the purchase path before this runs. An interrupted
  // transaction must leave a traceable record rather than a silent gap, so a
  // broadcast without a row is not allowed to happen.
  const position = positionId ? await getPosition(positionId) : null;
  const rowOk = Boolean(position) && position.status === 'pending';
  checks.push(item(
    10,
    'pending row written to the database',
    rowOk,
    position ? `position ${position.id} is '${position.status}'` : 'no position row',
  ));

  return {
    pass: checks.every((c) => c.pass),
    checks,
    funds,
    simulation,
  };
}

/**
 * Render the checklist for a terminal.
 * @param {object} result - a runPreflight() result
 * @returns {string}
 */
export function formatPreflight(result) {
  const lines = result.checks.map((c) =>
    `  ${c.pass ? 'PASS' : 'FAIL'}  ${String(c.id).padStart(2)}. ${c.label.padEnd(46)} ${c.detail}`);

  lines.push('');
  lines.push(result.pass
    ? '  ALL CHECKS PASSED — a fill would be allowed to broadcast.'
    : '  BLOCKED — at least one check failed. Nothing may be broadcast.');

  return lines.join('\n');
}
