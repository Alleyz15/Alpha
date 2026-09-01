// Wallet balances (IMPLEMENT.md task 3.3).
//
// Read-only. Reading a balance broadcasts nothing.
//
// BR-10: every purchase is preceded by a balance check for both USDC and gas.
// A fill that runs out of either does not fail cleanly - it reverts after the
// approval has already been sent, leaving the wallet in a state nobody planned.

import { ethers } from 'ethers';
import { getSigningClient, getWalletAddress } from './signer.js';
import { DECIMALS } from './decimals.js';

const USDC_SCALE = 10n ** BigInt(DECIMALS.USDC);

/** The USDC contract this chain uses as collateral. */
export function usdcAddress() {
  return getSigningClient().chainConfig.tokens.USDC.address;
}

/** The OptionBook - the only contract we ever approve. */
export function optionBookAddress() {
  return getSigningClient().chainConfig.contracts.optionBook;
}

/**
 * Current balances for the burner wallet.
 *
 * @returns {Promise<{address: string, usdcRaw: bigint, usdc: number, weiRaw: bigint, eth: number, gasPriceWei: bigint}>}
 */
export async function getWalletBalances() {
  const client = getSigningClient();
  const address = getWalletAddress();

  const [usdcRaw, weiRaw, feeData] = await Promise.all([
    client.erc20.getBalance(usdcAddress(), address),
    client.provider.getBalance(address),
    client.provider.getFeeData(),
  ]);

  return {
    address,
    usdcRaw,
    usdc: Number(usdcRaw) / Number(USDC_SCALE),
    weiRaw,
    eth: Number(ethers.formatEther(weiRaw)),
    gasPriceWei: feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n,
  };
}

/**
 * Estimated gas cost in wei for a given gas limit.
 *
 * Base is cheap enough that gas is rarely the binding constraint, but "rarely"
 * is not "never" and the check costs one multiplication.
 */
export function gasCostWei(gasLimit, gasPriceWei) {
  return BigInt(gasLimit) * BigInt(gasPriceWei);
}

/**
 * Does the wallet hold enough USDC for this premium, and enough ETH for gas?
 *
 * Returns the shortfalls rather than throwing, so the pre-flight checklist can
 * report every problem in one run instead of surfacing them one at a time.
 *
 * @param {object} args
 * @param {bigint} args.premiumRaw - USDC to spend, 6 decimals
 * @param {bigint} args.gasLimit
 * @returns {Promise<object>}
 */
export async function checkFunds({ premiumRaw, gasLimit = 1_000_000n }) {
  const balances = await getWalletBalances();
  const gasNeededWei = gasCostWei(gasLimit, balances.gasPriceWei);

  return {
    ...balances,
    premiumRaw,
    gasNeededWei,
    gasNeededEth: Number(ethers.formatEther(gasNeededWei)),
    hasUsdc: balances.usdcRaw >= premiumRaw,
    hasGas: balances.weiRaw >= gasNeededWei,
    // What the wallet would hold once this fill settles. With a small balance
    // and several fills still to come, this is the number that decides whether
    // the schedule is still achievable - so it is surfaced every time rather
    // than discovered when a later fill fails.
    usdcRemainingRaw: balances.usdcRaw - premiumRaw,
    usdcRemaining: Number(balances.usdcRaw - premiumRaw) / Number(USDC_SCALE),
  };
}
