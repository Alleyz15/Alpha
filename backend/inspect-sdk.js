import 'dotenv/config';
import { ThetanutsClient } from '@thetanuts-finance/thetanuts-client';
import { ethers } from 'ethers';

const client = new ThetanutsClient({
  chainId: 8453,
  provider: new ethers.JsonRpcProvider(process.env.THETANUTS_RPC_URL),
});

// List the top-level modules on the client
console.log('--- client ---');
console.log(Object.keys(client));

// List methods on each module
for (const key of Object.keys(client)) {
  const mod = client[key];
  if (mod && typeof mod === 'object') {
    const methods = [
      ...Object.keys(mod),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(mod) || {}),
    ].filter(m => m !== 'constructor');
    console.log(`\n--- client.${key} ---`);
    console.log([...new Set(methods)].sort());
  }
}