// Vault endpoints.
//
// ---------------------------------------------------------------------------
// NOTHING HERE REIMPLEMENTS ANYTHING.
// ---------------------------------------------------------------------------
//
// runMaturityPreflight and matureVault live in src/vault/maturity.js. They ran
// against real money on 3 Sep - the 3 USDC return, tx 0x72cb94ba - and are
// called here unchanged. All nine checks run, and the endpoint cannot skip one:
// matureVault runs the pre-flight itself and refuses on any failure, whatever
// this layer did or did not do beforehand.
//
// The recipient is resolved server-side (see recipient.js). There is no body
// field for it, so a browser cannot name where the money goes.

import { getVault, listVaultsByUser } from '../db/vaults.js';
import { getPosition } from '../db/positions.js';
import { runMaturityPreflight, matureVault } from '../vault/maturity.js';
import { getDemoUser } from './demoUser.js';
import { ApiError } from './errors.js';
import { payoutRecipient } from './recipient.js';
import { vaultView, maturability } from './vaultView.js';
import { checksView } from './loanView.js';
import { startJob, getJob, jobView } from './jobs.js';
import { depositToVault, runDepositPreflight, defaultDepositDeps } from '../vault/deposit.js';
import { getBalanceAmount, debitBalance } from '../db/balances.js';

/**
 * Resolve a vault the demo user owns, or refuse.
 *
 * NOT_FOUND for another user's vault, the same as loans and positions: "does
 * not exist" and "is not yours" must be indistinguishable.
 */
async function ownedVault(vaultId) {
  if (typeof vaultId !== 'string' || vaultId.trim() === '') {
    throw new ApiError('INVALID_REQUEST', 'A vault id is required.', { field: 'vaultId' });
  }

  const user = await getDemoUser();
  const vault = await getVault(vaultId);

  if (!vault || vault.user_id !== user.id) {
    throw new ApiError('NOT_FOUND', `No vault ${vaultId}.`);
  }

  return vault;
}

/**
 * GET /api/vault
 *
 * The user's deposits, newest first. Each carries `maturable` so a list can
 * render its buttons without nine chain calls per row.
 */
export async function getVaults() {
  const user = await getDemoUser();
  const vaults = await listVaultsByUser(user.id);

  return {
    vaults: vaults.map((v) => ({ ...vaultView(v), ...maturability(v) })),
  };
}

/**
 * GET /api/vault/:vaultId
 *
 * One deposit, with its backing call. Also the polling target while a deposit
 * or a maturity is in flight - both write the row before broadcasting, so the
 * resource always exists before the transaction does.
 */
export async function getVaultDetail(vaultId) {
  const vault = await ownedVault(vaultId);
  const position = vault.position_id ? await getPosition(vault.position_id) : null;

  // Null when nothing is running - which is NOT the same as "did not happen".
  // The row and the chain say what happened; this only says what is in flight.
  const job = jobView(getJob(`mature:${vault.id}`));
  // The domain code mapped to the API's, so a poll gets the same distinction a
  // synchronous call would have: nothing sent, reverted, or unknown.
  const maturityJob = job === null ? null : { ...job, error: maturityJobError(job.error) };

  return { ...vaultView(vault, position), ...maturability(vault), maturityJob };
}

/**
 * GET /api/vault/:vaultId/maturity-preflight
 *
 * The nine checks, run for real, sending nothing.
 *
 * ---------------------------------------------------------------------------
 * THIS IS A DRY RUN AND IT IS NOT A PERMISSION SLIP.
 * ---------------------------------------------------------------------------
 *
 * It exists so the interface can show what will be checked and what is
 * currently failing, the same way `npm run mature` without --confirm does. It
 * does NOT authorise anything: POST /mature runs the whole pre-flight again
 * against state at that moment, because between a passing dry run and a
 * transfer the call can settle, the balance can move, and a second maturity can
 * land. A check that ran a minute ago is not a check.
 */
export async function getMaturityPreflight(vaultId) {
  const vault = await ownedVault(vaultId);

  if (!vault.position_id) {
    throw new ApiError('CONFLICT',
      'This deposit has no backing call recorded, so it cannot be matured.', {
        vaultId: vault.id,
      });
  }

  const position = await getPosition(vault.position_id);
  if (!position) {
    throw new ApiError('CONFLICT',
      'The call backing this deposit is missing from our records.', { vaultId: vault.id });
  }

  const preflight = await runMaturityPreflight({
    vault,
    position,
    recipient: payoutRecipient(),
  });

  return {
    vault: { ...vaultView(vault, position), ...maturability(vault) },
    pass: preflight.pass,
    checks: checksView(preflight.checks),
    owed: preflight.owed === null || preflight.owed === undefined ? null : {
      principalUsdc: preflight.owed.principalUsdc,
      payoutUsdc: preflight.owed.payoutUsdc,
      totalUsdc: preflight.owed.totalUsdc,
    },
    recipientAddress: payoutRecipient(),
    // Said plainly, because the word "pre-flight" does not carry it.
    wouldSend: preflight.pass,
    sent: false,
  };
}

/**
 * POST /api/vault/:vaultId/mature
 *
 * Nine checks, then a real USDC transfer. **This spends money.**
 *
 * ---------------------------------------------------------------------------
 * RETURNS 202 AND THE INTERFACE POLLS. MEASURED, NOT ASSUMED.
 * ---------------------------------------------------------------------------
 *
 * The transfer itself is one block, about two seconds. The PRE-FLIGHT is not:
 *
 *   readSettlementState    222.0s
 *   runMaturityPreflight   316.4s      measured 3 Sep 2026
 *
 * Check 3 reads the settlement from chain, and the event scan walks 40
 * nine-block windows - about twelve minutes of chain - before falling back to
 * the oracle, which answers in a single call. When settlement happened outside
 * that window the scan finds nothing and costs the full 222 seconds anyway.
 *
 * A five-minute held request IS a hung request. It exceeds proxy and client
 * timeouts, and a timed-out POST that may or may not have sent money is exactly
 * the ambiguity this project exists to remove. So the work starts, a 202 comes
 * back at once, and GET /api/vault/:vaultId carries `maturityJob` until it
 * finishes.
 *
 * NOT FIXED HERE: the pre-flight is slow because the event scan is exhaustive
 * before the cheap source is tried. Reordering it would weaken check 3 - events
 * report what was PAID, the oracle only derives it - so it is left alone and
 * recorded in SETUP.md instead.
 *
 * ---------------------------------------------------------------------------
 * THE JOB KEY IS THE VAULT, WHICH MAKES IT A LOCK.
 * ---------------------------------------------------------------------------
 *
 * A second click while the first is in flight gets `started: false` and the
 * running job, not a second transfer. Two maturity transfers for one deposit
 * pays twice, and the pre-flight cannot help if both copies pass it at the same
 * moment.
 *
 * ---------------------------------------------------------------------------
 * AN UNKNOWN OUTCOME IS NOT A FAILURE AND MUST NEVER BE RETRIED.
 * ---------------------------------------------------------------------------
 *
 * If the transfer reverted, nothing moved and saying so is safe. If the RPC
 * stopped answering, the transfer MAY have landed - and a retry pays twice,
 * which cannot be undone. Those arrive as distinct codes from matureVault
 * rather than as similar-looking strings, and the second carries doNotRetry
 * with `sent: null` rather than false.
 */
export async function postMature(vaultId) {
  const vault = await ownedVault(vaultId);

  // Cheap refusals first, so an obviously-closed vault does not start a
  // five-minute job to be told no. The pre-flight still re-checks all of it.
  const can = maturability(vault);
  if (!can.maturable) {
    throw new ApiError('CONFLICT', can.reason, {
      vaultId: vault.id,
      status: vault.status,
      maturityTx: vault.maturity_tx ?? null,
    });
  }

  const key = `mature:${vault.id}`;

  const { started, job } = startJob(key, async () => {
    // matureVault runs the whole pre-flight itself and refuses on any failure.
    // Nothing this layer did beforehand can cause a check to be skipped.
    const result = await matureVault({
      vaultId: vault.id,
      recipient: payoutRecipient(),
      confirmed: true,
    });

    return {
      txHash: result.txHash,
      explorerUrl: result.explorerUrl,
      principalUsdc: result.principalUsdc,
      payoutUsdc: result.payoutUsdc,
      totalUsdc: result.totalUsdc,
      recipientAddress: result.recipient,
      sent: true,
    };
  });

  return {
    // 202-shaped: accepted, not completed. `sent` is null because at this
    // instant nothing has been sent AND nothing has been ruled out - the
    // pre-flight has not finished. False would be a claim we cannot make.
    accepted: true,
    started,
    sent: null,
    vaultId: vault.id,
    maturityJob: jobView(job),

    // Where the answer will appear. Named rather than left for the interface
    // to guess, and it is the resource - not this job - that is authoritative.
    pollUrl: `/api/vault/${vault.id}`,

    // Said in the response because the number is surprising and a frontend
    // that assumes seconds will show a spinner that looks broken.
    expectedSeconds: 330,
  };
}

/**
 * Map a job's terminal error onto the API's codes.
 *
 * Used by the poll path: a job that failed carries the domain code, and the
 * interface needs the same distinction a synchronous call would have given it.
 *
 * @param {object|null} error - a jobView().error
 */
export function maturityJobError(error) {
  if (!error) return null;

  if (error.code === 'MATURITY_PREFLIGHT_FAILED') {
    return { code: 'PRECONDITION_FAILED', message: error.message, sent: false, doNotRetry: false };
  }
  if (error.code === 'MATURITY_REVERTED') {
    return { code: 'TRANSFER_REVERTED', message: error.message, sent: false, doNotRetry: false };
  }
  if (error.code === 'MATURITY_OUTCOME_UNKNOWN') {
    return { code: 'OUTCOME_UNKNOWN', message: error.message, sent: null, doNotRetry: true };
  }
  return { code: error.code ?? 'UPSTREAM_ERROR', message: error.message, sent: error.sent ?? false, doNotRetry: Boolean(error.doNotRetry) };
}

/**
 * POST /api/vault/deposit   { asset, principalUsdc }
 *
 * Buys a real call on Base. **Returns 202** — the fill is 9-30 seconds against
 * a book that re-signs every 60, so the request is not held.
 *
 * ---------------------------------------------------------------------------
 * THE CLIENT SENDS A PRINCIPAL AND NOTHING ELSE THAT BECOMES MONEY.
 * ---------------------------------------------------------------------------
 *
 * `principalUsdc` is the one number the user chooses, and it is bounded by
 * their balance. Everything downstream - the yield/option split, the strike,
 * the premium, the contract count, the participation rate - is computed on the
 * server from the live book. A browser cannot name a premium, a strike, or a
 * participation percentage.
 *
 * ---------------------------------------------------------------------------
 * THE BALANCE IS DEBITED ON SUCCESS, NOT BEFORE. DELIBERATELY DIFFERENT.
 * ---------------------------------------------------------------------------
 *
 * Protection debits first and compensates on failure, because the operator
 * fills it HOURS later and the money has to be reserved across that gap. A
 * deposit has no such gap: the call is bought inside this job, and the job is
 * keyed by user so a second deposit cannot start while one is running.
 *
 * So the balance moves only once the call is confirmed - which means a failed
 * deposit needs no compensating write at all. That is the point: we have just
 * spent a day on a refund path that had never run, and the best refund path is
 * one that does not need to exist.
 */
export async function postVaultDeposit(body) {
  if (!body || typeof body !== 'object') {
    throw new ApiError('INVALID_REQUEST', 'A JSON body is required.');
  }

  const { asset, principalUsdc } = body;

  if (typeof asset !== 'string' || asset.trim() === '') {
    throw new ApiError('INVALID_REQUEST', 'asset is required.', { field: 'asset' });
  }
  if (typeof principalUsdc !== 'number' || !Number.isFinite(principalUsdc) || principalUsdc <= 0) {
    throw new ApiError('INVALID_REQUEST', 'principalUsdc must be a positive number.', {
      field: 'principalUsdc',
    });
  }

  const symbol = asset.trim().toUpperCase();
  const user = await getDemoUser();

  // The user cannot deposit money they do not have. Checked here so the refusal
  // is immediate rather than arriving through a poll two seconds later.
  const held = await getBalanceAmount(user.id, 'USDC');
  if (held < principalUsdc) {
    throw new ApiError('BALANCE_EXCEEDED',
      `Deposit of ${principalUsdc} USDC exceeds the ${held} USDC available.`, {
        requestedUsdc: principalUsdc,
        availableUsdc: held,
      });
  }

  // Keyed by USER, not by vault - the vault does not exist yet, and the thing
  // being guarded against is a second click starting a second purchase.
  const key = `deposit:${user.id}`;

  const { started, job } = startJob(key, async () => {
    const deps = await defaultDepositDeps();

    const result = await depositToVault(
      { userId: user.id, asset: symbol, principalUsdc, confirmed: true },
      deps,
    );

    // The call is confirmed on chain. Only now does the simulated balance move.
    // A failure above reaches here not at all, so there is nothing to reverse.
    await debitBalance({
      userId: user.id,
      asset: 'USDC',
      amount: principalUsdc,
      reason: `deposit into principal-protected vault ${result.vault.id}`,
    });

    return {
      vaultId: result.vault.id,
      positionId: result.position.id,
      participationPct: Number(result.vault.participation_rate),
      txHash: result.txHash,
      explorerUrl: result.explorerUrl,
      sent: true,
    };
  });

  return {
    accepted: true,
    started,
    // Nothing has been sent AND nothing has been ruled out. False would be a
    // claim we cannot make at this instant.
    sent: null,
    depositJob: jobView(job),
    // The vault id does not exist yet, so the poll target is the list. The row
    // appears there as 'pending' the moment it is written - before the fill.
    pollUrl: '/api/vault',
    expectedSeconds: 30,
  };
}

/**
 * GET /api/vault/deposit-preflight?asset=ETH&principalUsdc=3
 *
 * Prices the deposit and runs every check. Sends nothing, writes nothing.
 *
 * The SAME function the buy runs, so the figures shown are the figures that
 * will be used - a dry run that exercises a different path is not a dry run.
 */
export async function getDepositPreflight(asset, principalUsdcRaw) {
  const symbol = (asset ?? 'ETH').trim().toUpperCase();
  const principalUsdc = Number(principalUsdcRaw);

  if (!Number.isFinite(principalUsdc) || principalUsdc <= 0) {
    throw new ApiError('INVALID_REQUEST', 'principalUsdc must be a positive number.', {
      field: 'principalUsdc',
    });
  }

  const user = await getDemoUser();
  const held = await getBalanceAmount(user.id, 'USDC');
  const deps = await defaultDepositDeps();

  const pre = await runDepositPreflight({ asset: symbol, principalUsdc }, deps);
  const q = pre.quote;

  return {
    asset: q.asset,
    principalUsdc: q.principalUsdc,

    // The split, which is what makes the guarantee legible: the yield portion
    // grows back to the principal, and the option portion is the only money at
    // risk.
    yieldPortionUsdc: q.yieldPortion,
    optionPortionUsdc: q.optionPortion,
    // BR-37. The interface must say so wherever this number appears.
    yieldIsSimulated: true,

    // BR-38: from the premium actually quoted for a call actually on the book.
    participationPct: q.participationPct,
    exposureUsdc: q.exposureUsdc,

    spotUsdc: Math.round(q.spot * 100) / 100,
    upsideThresholdUsdc: q.strike,
    maturity: q.expiry.toISOString(),
    daysToMaturity: Math.round(q.daysToExpiry * 100) / 100,
    premiumPerContractUsdc: q.premiumPerContract,
    contracts: q.contracts,

    pass: pre.pass,
    checks: checksView(pre.checks),
    availableUsdc: held,
    affordable: held >= principalUsdc,
    wouldSend: pre.pass && held >= principalUsdc,
    sent: false,
  };
}
