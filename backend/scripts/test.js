// Read-only connectivity check: no wallet, no signing, no funds at risk.
import { client } from '../src/thetanuts/client.js';

console.log((await client.api.fetchOrders()).length, 'live orders');
console.log(await client.api.getMarketData());
