// Balances (IMPLEMENT.md task 2.5, 2.7).
//
// Seeded holdings, never deposits (BR-50). BR-49 caps every quote by the
// balance recorded here: protection is only ever quoted against something the
// system has a record of, or it stops being insurance and becomes a bet.

import { db, unwrap } from './client.js';

/**
 * Every asset balance for one user.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listBalances(userId) {
  return unwrap(
    await db.from('balances').select('*').eq('user_id', userId).order('asset'),
    `listBalances(${userId})`,
  );
}

/**
 * One user's holding of one asset, or null if they hold none.
 *
 * Returns the row rather than the number so the caller can see `source` and
 * state that the holding is simulated (BR-51).
 *
 * @param {string} userId
 * @param {string} asset
 * @returns {Promise<object|null>}
 */
export async function getBalance(userId, asset) {
  return unwrap(
    await db.from('balances').select('*').eq('user_id', userId).eq('asset', asset).maybeSingle(),
    `getBalance(${userId}, ${asset})`,
  );
}
