// Vault reads.
//
// Writes live in src/vault/ - the deposit creates the row before it buys, and
// matureVault moves it through 'maturing' before any transfer. Keeping them
// there is the same decision as for loans: a vault row is the trace of an
// irreversible act, and the rules that govern it belong beside the act.

import { db, unwrap } from './client.js';

/**
 * One vault, or null.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getVault(id) {
  return unwrap(
    await db.from('vaults').select('*').eq('id', id).maybeSingle(),
    `getVault(${id})`,
  );
}

/**
 * A user's vaults, newest first.
 *
 * Includes superseded ones. The 100 USDC deposit could not pay its modelled
 * principal and is marked `superseded` rather than deleted - its call is real
 * and is held, and removing the record of an on-chain purchase to tidy a demo
 * is exactly the gap the database exists to prevent.
 *
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listVaultsByUser(userId) {
  return unwrap(
    await db.from('vaults').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }),
    `listVaultsByUser(${userId})`,
  );
}
