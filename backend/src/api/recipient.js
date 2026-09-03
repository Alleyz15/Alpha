// Where money goes when the product pays out.
//
// ===========================================================================
// THE CLIENT NEVER CHOOSES THIS. NOT AS A BODY FIELD, NOT AS A QUERY STRING.
// ===========================================================================
//
// Two endpoints send real USDC out of the operator wallet - a loan
// disbursement and a vault maturity. If a browser could name the destination,
// the API would be a faucet: post a loan request with your own address and the
// wallet pays you.
//
// So the address is resolved here, server-side, and the request bodies have no
// field for it. That is not a validation rule that could be relaxed; there is
// nowhere for the value to arrive.
//
// ---------------------------------------------------------------------------
// WHAT THIS ADDRESS ACTUALLY IS
// ---------------------------------------------------------------------------
//
// A second wallet the team controls. There is no deposit flow and no wallet
// connection, so there is no external user to pay - the honest analogue is a
// genuine on-chain transfer to an address that is not the one we spend from.
//
// It received the 3 USDC maturity on 3 Sep (tx 0x72cb94ba) and the 4.5977 USDC
// loan disbursement on 31 Aug. ONCHAIN-EVIDENCE.md records it as a team wallet
// rather than as a customer, and the interface must not call it "your wallet".

import { ethers } from 'ethers';

/**
 * The team's payout wallet. Overridable by environment for a different demo
 * machine, never by a request.
 */
const DEFAULT_RECIPIENT = '0xc169c7c000cAA28807Ab2585D707C7A6457d718E';

/**
 * The address loan disbursements and vault maturities pay.
 *
 * Validated on every call rather than at module load: a malformed override in
 * `.env` must fail the one endpoint that would send money, loudly, rather than
 * take down an API that is mostly read-only.
 *
 * @returns {string} checksummed address
 * @throws {Error} if the configured value is not a valid address
 */
export function payoutRecipient() {
  const configured = process.env.PAYOUT_RECIPIENT_ADDRESS?.trim() || DEFAULT_RECIPIENT;

  if (!ethers.isAddress(configured)) {
    throw new Error(
      `PAYOUT_RECIPIENT_ADDRESS is not a valid address: ${JSON.stringify(configured)}. ` +
      'Nothing was sent.',
    );
  }

  // Checksummed, so a mixed-case typo cannot masquerade as a different address
  // that happens to be valid.
  return ethers.getAddress(configured);
}
