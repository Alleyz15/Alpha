// USDC approvals (IMPLEMENT.md task 3.4).
//
// ---------------------------------------------------------------------------
// Exact amounts only. Never MaxUint256. (BR-12)
// ---------------------------------------------------------------------------
//
// An unbounded approval means a compromised or buggy OptionBook can move every
// USDC the wallet will ever hold, not just the premium for one fill. The
// convenience of approving once is not worth that, least of all in a public
// repository where the contract addresses are known.
//
// Reading an allowance broadcasts nothing. Granting one DOES send a transaction
// - it costs gas and it changes on-chain state - so it is kept in its own
// function and its own script, never as a side effect of a check.

import { ethers } from 'ethers';
import { getSigningClient, getWalletAddress } from './signer.js';
import { usdcAddress, optionBookAddress } from './wallet.js';
import { DECIMALS } from './decimals.js';

const USDC_SCALE = 10n ** BigInt(DECIMALS.USDC);

/**
 * A ceiling no legitimate fill will approach. The wallet holds about ten USDC
 * and BR-15 keeps trades at 1-3, so anything above this is a decimal error or
 * a mistake, not an intention.
 */
export const APPROVAL_SANITY_CAP_RAW = 100n * USDC_SCALE;   // 100 USDC

/**
 * Current allowance granted to the OptionBook.
 * @returns {Promise<bigint>} 6 decimals
 */
export async function readAllowance() {
  const client = getSigningClient();
  return client.erc20.getAllowance(usdcAddress(), getWalletAddress(), optionBookAddress());
}

/**
 * Reject an approval amount that is unbounded or implausible.
 *
 * Called before anything is sent, and again by the pre-flight checklist
 * against the allowance actually on chain.
 *
 * @param {bigint} amountRaw
 */
export function assertApprovalAmountSane(amountRaw) {
  if (typeof amountRaw !== 'bigint') {
    throw new TypeError(`approval amount must be a bigint, got ${typeof amountRaw}`);
  }
  if (amountRaw <= 0n) {
    throw new RangeError('approval amount must be positive');
  }
  if (amountRaw === ethers.MaxUint256) {
    throw new RangeError('refusing to approve MaxUint256 (BR-12)');
  }
  if (amountRaw > APPROVAL_SANITY_CAP_RAW) {
    throw new RangeError(
      `refusing to approve ${Number(amountRaw) / Number(USDC_SCALE)} USDC: ` +
      `above the ${Number(APPROVAL_SANITY_CAP_RAW) / Number(USDC_SCALE)} USDC sanity cap. ` +
      'This is a decimal error or a mistake, not an intention.',
    );
  }
}

/**
 * Grant the OptionBook an allowance for exactly this amount.
 *
 * **THIS SENDS A TRANSACTION** when the current allowance is short. It spends
 * gas. It moves no USDC and buys nothing - it authorises a later transfer of
 * at most `amountRaw`.
 *
 * Uses the SDK's ensureAllowance, which is a no-op when the existing allowance
 * already covers the amount. Note that it raises an insufficient allowance and
 * never lowers a larger one, so a leftover allowance from an earlier, larger
 * fill persists; the checklist reports the live figure so that is visible
 * rather than assumed.
 *
 * @param {bigint} amountRaw - exact USDC, 6 decimals
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun] - report what would happen, send nothing
 * @returns {Promise<object>}
 */
export async function ensureExactAllowance(amountRaw, { dryRun = false } = {}) {
  assertApprovalAmountSane(amountRaw);

  const before = await readAllowance();
  const sufficient = before >= amountRaw;

  if (sufficient) {
    return { sent: false, reason: 'already sufficient', before, after: before, txHash: null };
  }

  if (dryRun) {
    return { sent: false, reason: 'dry run - no transaction sent', before, after: before, txHash: null };
  }

  const client = getSigningClient();
  const receipt = await client.erc20.ensureAllowance(usdcAddress(), optionBookAddress(), amountRaw);

  // Re-read until the node reflects the write, rather than once immediately.
  // An RPC node can serve a read from a block that predates the transaction it
  // just confirmed, which reports the allowance as unchanged. That reads as a
  // failed approval and invites someone to send a second one - so poll, and
  // only report a figure the chain has actually caught up to.
  const after = await pollAllowanceUntil(amountRaw);

  return {
    sent: true,
    reason: 'approval sent',
    before,
    after,
    confirmed: after >= amountRaw,
    txHash: receipt?.hash ?? receipt?.transactionHash ?? null,
  };
}

/**
 * Poll the allowance until it reaches `expected`, or the attempts run out.
 * Returns whatever the last read was - the caller decides what that means.
 *
 * @param {bigint} expected
 * @param {number} [attempts]
 * @param {number} [delayMs]
 * @returns {Promise<bigint>}
 */
export async function pollAllowanceUntil(expected, attempts = 8, delayMs = 1500) {
  let current = await readAllowance();

  for (let i = 0; i < attempts && current < expected; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    current = await readAllowance();
  }

  return current;
}
