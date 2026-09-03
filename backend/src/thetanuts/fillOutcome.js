// What actually happened, when a fill call throws after we broadcast.
//
// ===========================================================================
// NO IMPORTS. THAT IS THE POINT.
// ===========================================================================
//
// fill.js reaches db/client.js at module load, which throws without
// credentials - so a test cannot import it, and this logic could not be
// exercised where it lived. The same shape that once made stress.js and
// repay.js untestable. A module that cannot be imported cannot be tested, and
// this is code that ONLY runs when something has already gone wrong.

/**
 * The transaction hash an error is talking about, if it names one.
 *
 * Structured fields first. The regex is a LAST RESORT and is deliberately
 * narrow: the SDK wraps RPC failures and the hash can end up only inside the
 * serialised payload text, as it did on 3 Sep -
 *
 *   "method": "eth_getTransactionReceipt", "params": [ "0x2913c6e2..." ]
 *
 * A hash found this way is still corroborated against the chain before anything
 * is concluded from it, so a wrong match cannot produce a wrong outcome - it
 * produces an unreadable receipt, which is "unknown".
 *
 * @param {any} error
 * @returns {string|null}
 */
export function txHashFromError(error) {
  const direct = error?.transactionHash ?? error?.hash ?? error?.transaction?.hash
    ?? error?.receipt?.hash ?? error?.info?.payload?.params?.[0];
  if (typeof direct === 'string' && /^0x[0-9a-fA-F]{64}$/.test(direct)) return direct;

  const match = String(error?.message ?? '').match(/0x[0-9a-fA-F]{64}/);
  return match ? match[0] : null;
}

/**
 * What actually happened, once fillOrder has thrown AFTER we broadcast.
 *
 * ===========================================================================
 * THE SDK'S CLASSIFICATION IS NOT EVIDENCE. ASK THE CHAIN.
 * ===========================================================================
 *
 * The SDK maps EVERY unrecognised Error to a ContractRevertError:
 *
 *   return new ContractRevertError(`Contract call failed: ${error.message}`, error);
 *
 * so `error.code === 'CONTRACT_REVERT'` answers yes to an RPC failure reading a
 * receipt. On 3 Sep that turned a SUCCESSFUL fill - tx 0x2913c6e2, status 1,
 * option 0x3e6c2C5b created, 0.46096 USDC spent - into a row marked `failed`.
 * Unknown became definitely-not, in the direction that loses money silently.
 *
 * Before broadcasting, a revert claim is useful: nothing has been sent, so
 * being wrong costs nothing. After broadcasting only the chain knows, and a
 * claim is not evidence. This function therefore ignores the error's own
 * opinion entirely and establishes the outcome from two chain facts:
 *
 *   the receipt, when the error names a transaction
 *   the sender's NONCE, when it does not
 *
 * The nonce is what distinguishes "reverted during gas estimation, nothing was
 * ever sent" from "sent, and we cannot see it". An unchanged nonce means no
 * transaction left this wallet - which is the only safe basis for refunding.
 *
 * ASSUMES ONE FILL AT A TIME from this wallet, which the operator model
 * guarantees: fills are run by a person, one script at a time. A concurrent
 * transaction would advance the nonce and turn `not_sent` into `unknown` -
 * conservative in the safe direction, never the other way.
 *
 * @param {object} deps
 * @param {any} deps.error
 * @param {number} deps.nonceBefore - sender nonce captured BEFORE the call
 * @param {string} deps.wallet
 * @param {{getTransactionReceipt:Function, getTransactionCount:Function}} deps.provider
 * @returns {Promise<{kind:'succeeded'|'not_sent'|'reverted'|'unknown', txHash:string|null, receipt:object|null, evidence:string}>}
 */
export async function resolveFillFailure({ error, nonceBefore, wallet, provider }) {
  const txHash = txHashFromError(error);

  if (txHash) {
    let receipt = null;
    try {
      receipt = await provider.getTransactionReceipt(txHash);
    } catch {
      receipt = null;   // unreadable is not absent
    }

    if (receipt && receipt.status === 1) {
      // The fill WORKED. This is the 3 Sep case, and recording `failed` here
      // is what cost us a position we owned.
      return {
        kind: 'succeeded', txHash, receipt,
        evidence: `receipt for ${txHash} has status 1`,
      };
    }
    if (receipt && receipt.status === 0) {
      return {
        kind: 'reverted', txHash, receipt,
        evidence: `receipt for ${txHash} has status 0`,
      };
    }

    // A hash we cannot resolve. It may be mined and unreadable, or it may not
    // be ours at all. Either way we do not know.
    return {
      kind: 'unknown', txHash, receipt: null,
      evidence: `a transaction ${txHash} was named but its receipt could not be read`,
    };
  }

  // No hash. The nonce decides whether anything left the wallet.
  let nonceAfter = null;
  try {
    nonceAfter = await provider.getTransactionCount(wallet, 'latest');
  } catch {
    nonceAfter = null;
  }

  if (nonceAfter === null) {
    return {
      kind: 'unknown', txHash: null, receipt: null,
      evidence: 'no transaction was named and the nonce could not be read',
    };
  }

  if (nonceAfter === nonceBefore) {
    // Nothing was ever sent. The only outcome that justifies refunding.
    return {
      kind: 'not_sent', txHash: null, receipt: null,
      evidence: `nonce unchanged at ${nonceAfter}: no transaction left the wallet`,
    };
  }

  return {
    kind: 'unknown', txHash: null, receipt: null,
    evidence: `nonce moved ${nonceBefore} -> ${nonceAfter} but no transaction was named`,
  };
}
