// USDC disbursement (IMPLEMENT.md 7.3).
//
// ---------------------------------------------------------------------------
// THE SECOND IRREVERSIBLE WRITE. A USDC transfer cannot be recalled.
// ---------------------------------------------------------------------------
//
// This deliberately mirrors the fill path rather than inventing a second shape:
//
//   1. pre-flight checks, ending in a dry run that must pass
//   2. write the loan row BEFORE broadcasting          (BR-14's logic applies)
//   3. transfer
//   4. record the hash, or leave the row unresolved on a timeout - never retry
//
// The dry run is erc20.callStaticTransfer, the SDK's analogue of
// callStaticFillOrder: same { success, gasEstimate, error } shape, an eth_call
// that sends nothing. So a transfer gets the same rehearsal a fill does, rather
// than a substitute for one (BR-28).

import { getSigningClient, getWalletAddress } from '../thetanuts/signer.js';
import { usdcAddress, getWalletBalances } from '../thetanuts/wallet.js';
import { creditLimitFor, interestRateAnnualPct, dueAtFor } from './credit.js';
import { db, unwrap } from '../db/client.js';
import { getPosition } from '../db/positions.js';

const USDC_SCALE = 1_000_000n;
const usdc = (raw) => Number(raw) / Number(USDC_SCALE);

const item = (id, label, pass, detail) => ({ id, label, pass, detail });

/**
 * Pre-flight for a disbursement. Reads and simulates; writes nothing, sends
 * nothing. Reports every item rather than stopping at the first failure.
 *
 * @param {object} args
 * @param {object} args.position - the filled put backing the loan
 * @param {string} args.recipient - where the USDC goes
 * @param {bigint} args.principalRaw - USDC to send, 6dp
 * @returns {Promise<{pass: boolean, checks: object[], simulation: object|null, funds: object}>}
 */
export async function runDisbursePreflight({ position, recipient, principalRaw }) {
  const client = getSigningClient();
  const checks = [];

  // 1. The put must actually exist on chain and be ours.
  const filled = position.status === 'active' && Boolean(position.option_address);
  checks.push(item(1, 'backing put is filled and on chain', filled,
    `status ${position.status}, option ${position.option_address ?? 'none'}`));

  // 2. The limit, derived - never configured (BR-39).
  let limit = null;
  let limitOk = false;
  try {
    limit = creditLimitFor(position);
    limitOk = limit.creditLimitRaw > 0n;
  } catch (e) {
    checks.push(item(2, 'credit limit derives from the put', false, e.message));
  }
  if (limit) {
    checks.push(item(2, 'credit limit derives from the put', limitOk,
      `${limit.strike} x ${limit.contracts} = ${limit.creditLimitUsdc} USDC`));
  }

  // 3. A draw cannot exceed the line it is drawn against.
  const withinLimit = Boolean(limit) && principalRaw <= limit.creditLimitRaw;
  checks.push(item(3, 'principal is within the credit limit', withinLimit,
    `${usdc(principalRaw)} of ${limit ? limit.creditLimitUsdc : '?'} USDC`));

  // 4. We must hold the USDC we are about to send.
  const funds = await getWalletBalances();
  const hasUsdc = funds.usdcRaw >= principalRaw;
  checks.push(item(4, 'wallet holds the principal', hasUsdc,
    `holds ${funds.usdc.toFixed(6)}, sending ${usdc(principalRaw)} — ` +
    `${(funds.usdc - usdc(principalRaw)).toFixed(6)} would remain`));

  // 5. Gas.
  const gasNeededEth = Number(60_000n * funds.gasPriceWei) / 1e18;
  const hasGas = funds.eth > gasNeededEth;
  checks.push(item(5, 'wallet holds gas', hasGas,
    `holds ${funds.eth.toFixed(8)} ETH, needs ~${gasNeededEth.toFixed(8)}`));

  // 6. A recipient we meant. Sending USDC to the zero address burns it.
  const recipientOk = /^0x[0-9a-fA-F]{40}$/.test(recipient) &&
    recipient.toLowerCase() !== '0x0000000000000000000000000000000000000000' &&
    recipient.toLowerCase() !== getWalletAddress();
  checks.push(item(6, 'recipient is valid and not ourselves', recipientOk, recipient));

  // 7. One loan per position (BR-39's floor cannot back two draws).
  const { data: existing } = await db.from('loans').select('id').eq('position_id', position.id);
  const noDuplicate = (existing ?? []).length === 0;
  checks.push(item(7, 'no existing loan against this put', noDuplicate,
    noDuplicate ? 'none' : `already lent: ${existing.map((l) => l.id).join(', ')}`));

  // 8. The dry run (BR-28). callStaticTransfer is to a transfer what
  //    callStaticFillOrder is to a fill: an eth_call that broadcasts nothing.
  let simulation = null;
  let simulationOk = false;
  let simulationDetail = 'not attempted';
  try {
    simulation = await client.erc20.callStaticTransfer(usdcAddress(), recipient, principalRaw);
    simulationOk = simulation.success === true;
    simulationDetail = simulationOk
      ? `would succeed, gas estimate ${simulation.gasEstimate}`
      : `${simulation.error?.code ?? 'REVERT'}: ${(simulation.error?.message ?? '').slice(0, 100)}`;
  } catch (e) {
    simulationDetail = `threw: ${e.message.slice(0, 120)}`;
  }
  checks.push(item(8, 'callStaticTransfer succeeded', simulationOk, simulationDetail));

  return { pass: checks.every((c) => c.pass), checks, simulation, funds, limit };
}

/** Render a disbursement checklist for a terminal. */
export function formatDisbursePreflight(result) {
  const lines = result.checks.map((c) =>
    `  ${c.pass ? 'PASS' : 'FAIL'}  ${String(c.id).padStart(2)}. ${c.label.padEnd(42)} ${c.detail}`);
  lines.push('');
  lines.push(result.pass
    ? '  ALL CHECKS PASSED — a disbursement would be allowed to broadcast.'
    : '  BLOCKED — at least one check failed. Nothing may be sent.');
  return lines.join('\n');
}

/**
 * Disburse a loan.
 *
 * ---------------------------------------------------------------------------
 * THIS SENDS REAL USDC. The transfer cannot be recalled.
 * ---------------------------------------------------------------------------
 *
 * @param {object} args
 * @param {string} args.positionId
 * @param {string} args.recipient
 * @param {bigint} [args.principalRaw] - defaults to the full credit limit
 * @param {boolean} args.confirmed - must be true
 * @returns {Promise<object>}
 */
export async function disburse({ positionId, recipient, principalRaw, confirmed = false }) {
  if (!confirmed) {
    throw new Error('disburse requires { confirmed: true }. This sends real USDC and cannot be recalled.');
  }

  const position = await getPosition(positionId);
  if (!position) throw new Error(`disburse: position ${positionId} not found`);

  const limit = creditLimitFor(position);
  const principal = principalRaw ?? limit.creditLimitRaw;

  const preflight = await runDisbursePreflight({ position, recipient, principalRaw: principal });
  if (!preflight.pass) {
    throw new Error('disburse refused: pre-flight failed. Nothing was sent.');
  }

  // BR-14's logic: the row exists before the transfer, so an interrupted
  // process leaves a traceable record rather than a silent gap. disbursement_tx
  // stays null until we have a hash - a loan row with no hash is exactly the
  // "we do not know" state, and reconcile can resolve it against chain state.
  const loan = unwrap(
    await db.from('loans').insert({
      user_id: position.user_id,
      position_id: position.id,
      status: 'active',
      principal: Number(principal) / Number(USDC_SCALE),
      credit_limit: limit.creditLimitUsdc,
      interest_rate: interestRateAnnualPct(),
      collateral_amount: limit.contracts,
      recipient_address: recipient.toLowerCase(),
      due_at: dueAtFor(position),
    }).select().single(),
    'disburse: writing the loan row',
  );

  const client = getSigningClient();
  let receipt;
  try {
    receipt = await client.erc20.transfer(usdcAddress(), recipient, principal);
  } catch (error) {
    // A revert is a definite answer: nothing moved.
    const reverted = /revert|insufficient/i.test(error?.message ?? '');
    if (reverted) {
      await db.from('loans').update({ status: 'defaulted' }).eq('id', loan.id);
      throw new Error(`disbursement reverted, nothing was sent: ${error?.message ?? error}`);
    }
    // Anything else is NOT an answer. The transfer may have landed; retrying
    // would send twice. The row stays with a null disbursement_tx for a human.
    throw new Error(
      `disbursement outcome UNKNOWN for loan ${loan.id}: ${error?.message ?? error}\n` +
      `The transfer may have landed. DO NOT RETRY — check ` +
      `https://basescan.org/address/${getWalletAddress()} and resolve by hand.`,
    );
  }

  const txHash = receipt?.hash ?? receipt?.transactionHash ?? null;

  unwrap(
    await db.from('loans').update({ disbursement_tx: txHash ? txHash.toLowerCase() : null })
      .eq('id', loan.id).select().single(),
    'disburse: recording the transaction',
  );

  return {
    loanId: loan.id,
    txHash,
    explorerUrl: txHash ? `https://basescan.org/tx/${txHash}` : null,
    principalUsdc: Number(principal) / Number(USDC_SCALE),
    creditLimitUsdc: limit.creditLimitUsdc,
    recipient,
    receipt,
  };
}
