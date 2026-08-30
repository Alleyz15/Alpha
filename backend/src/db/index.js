// Supabase client and queries (IMPLEMENT.md Phase 2).
//
// SERVER-SIDE ONLY - see client.js. The secret key bypasses RLS, and the
// frontend never reaches Postgres directly.

export { db, unwrap } from './client.js';
export { listUsers, getUser } from './users.js';
export { listBalances, getBalance } from './balances.js';
export { insertQuote, getQuote, listQuotesByUser } from './quotes.js';
export {
  insertPendingPosition,
  transitionPosition,
  getPosition,
  listPositionsByUser,
  listPositionsDueForSettlement,
  listPositionEvents,
} from './positions.js';
