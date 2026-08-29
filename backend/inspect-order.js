import 'dotenv/config';
import { ThetanutsClient } from '@thetanuts-finance/thetanuts-client';
import { ethers } from 'ethers';

const client = new ThetanutsClient({
  chainId: 8453,
  provider: new ethers.JsonRpcProvider(process.env.THETANUTS_RPC_URL),
});

// Read-only calls: no wallet, no signing, no funds at risk
const orders = await client.api.fetchOrders();

console.log('total orders:', orders.length);
// BigInt is not JSON-serializable by default, so convert it to string
console.log(JSON.stringify(orders[0], (key, value) =>
  typeof value === 'bigint' ? value.toString() : value, 2
));
