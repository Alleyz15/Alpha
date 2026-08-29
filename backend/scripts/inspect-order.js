import { client } from '../src/thetanuts/client.js';

// Read-only calls: no wallet, no signing, no funds at risk
const orders = await client.api.fetchOrders();

console.log('total orders:', orders.length);
// BigInt is not JSON-serializable by default, so convert it to string
console.log(JSON.stringify(orders[0], (key, value) =>
  typeof value === 'bigint' ? value.toString() : value, 2
));
