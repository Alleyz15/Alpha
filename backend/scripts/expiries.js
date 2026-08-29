import { client } from '../src/thetanuts/client.js';

const orders = await client.api.fetchOrders();

// List every distinct expiry currently on the book
const expiries = [...new Set(orders.map(o => Number(o.order.expiry)))].sort();

console.log('now:', new Date().toISOString());
console.log('total orders:', orders.length);
console.log('--- expiries ---');

for (const e of expiries) {
  const days = ((e * 1000 - Date.now()) / 86400000).toFixed(1);
  const count = orders.filter(o => Number(o.order.expiry) === e).length;
  console.log(new Date(e * 1000).toISOString(), `(+${days} days)`, `${count} orders`);
}
