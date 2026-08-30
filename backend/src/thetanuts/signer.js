// The signing client (IMPLEMENT.md Phase 3).
//
// ---------------------------------------------------------------------------
// This is the only module in the codebase that can spend money
// ---------------------------------------------------------------------------
//
// It is a SEPARATE ThetanutsClient from the one in client.js, and that is
// deliberate. Quoting, the API and every read path use a client built with a
// provider and no signer, so a stray fillOrder() on those paths throws
// SignerRequiredError instead of broadcasting a transaction. Adding a signer to
// the shared client would remove that guarantee from every file at once.
//
// The key is read from the environment and handed to ethers. It is never
// logged, never interpolated into a message, never returned. The wallet ADDRESS
// is public and safe to print; the key is not (BR-18, BR-30).

import 'dotenv/config';
import { ethers } from 'ethers';
import { ThetanutsClient } from '@thetanuts-finance/thetanuts-client';
import { CHAIN_ID } from './client.js';

let signingClient = null;
let wallet = null;

function build() {
  const key = process.env.THETANUTS_PRIVATE_KEY;

  if (!key) {
    throw new Error(
      'THETANUTS_PRIVATE_KEY is not set. It is required only for the fill path; ' +
      'read-only work uses src/thetanuts/client.js.',
    );
  }

  const provider = new ethers.JsonRpcProvider(process.env.THETANUTS_RPC_URL);

  try {
    wallet = new ethers.Wallet(key, provider);
  } catch {
    // Deliberately not including the underlying error: ethers puts the
    // offending value in its message, and that value is the private key.
    throw new Error('THETANUTS_PRIVATE_KEY is not a valid private key.');
  }

  signingClient = new ThetanutsClient({ chainId: CHAIN_ID, provider, signer: wallet });
}

/**
 * The client that can sign. Built on first use, not at import time, so merely
 * importing this module does not require a key to be present.
 *
 * @returns {import('@thetanuts-finance/thetanuts-client').ThetanutsClient}
 */
export function getSigningClient() {
  if (!signingClient) build();
  return signingClient;
}

/**
 * The burner wallet's address. Public information - safe to log and to show.
 * @returns {string} lowercase, to match how addresses are stored and compared
 */
export function getWalletAddress() {
  if (!wallet) build();
  return wallet.address.toLowerCase();
}

/** The checksummed address, for display and BaseScan links. */
export function getWalletAddressChecksummed() {
  if (!wallet) build();
  return wallet.address;
}
