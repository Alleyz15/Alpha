import 'dotenv/config';
import { ThetanutsClient } from '@thetanuts-finance/thetanuts-client';
import { ethers } from 'ethers';

const client = new ThetanutsClient({
  chainId: 8453,
  provider: new ethers.JsonRpcProvider(process.env.THETANUTS_RPC_URL),
});

// Is the collar module even deployed on this chain?
console.log('collar deployed:', await client.collar.isDeployed?.());

// What lending opportunities exist right now?
const opps = await client.loan.getLendingOpportunities();
console.log('lending opportunities:', opps.length);
console.log(JSON.stringify(opps[0], (k, v) =>
  typeof v === 'bigint' ? v.toString() : v, 2));