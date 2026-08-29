import 'dotenv/config';
import { ThetanutsClient } from '@thetanuts-finance/thetanuts-client';
import { ethers } from 'ethers';

const client = new ThetanutsClient({
  chainId: 8453,
  provider: new ethers.JsonRpcProvider(process.env.THETANUTS_RPC_URL),
});

// Read-only calls: no wallet, no signing, no funds at risk
console.log((await client.api.fetchOrders()).length, 'live orders');
console.log(await client.api.getMarketData());