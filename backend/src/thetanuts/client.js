// Shared Thetanuts SDK client.
//
// Every script and backend module imports `client` from here instead of
// constructing its own ThetanutsClient, so the chain id and RPC wiring live
// in exactly one place. Config only - no feature logic.

import 'dotenv/config';
import { ThetanutsClient } from '@thetanuts-finance/thetanuts-client';
import { ethers } from 'ethers';

// Base mainnet. Thetanuts has no testnet (see docs/SETUP.md).
export const CHAIN_ID = 8453;

export const client = new ThetanutsClient({
  chainId: CHAIN_ID,
  provider: new ethers.JsonRpcProvider(process.env.THETANUTS_RPC_URL),
});
