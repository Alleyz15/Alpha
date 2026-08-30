// Users (IMPLEMENT.md task 2.5).
//
// The demo has no login. Two users exist so the ownership mapping can be shown
// to work - see the seed migration for why one would not be enough.

import { db, unwrap } from './client.js';

/**
 * All demo users, oldest first.
 * @returns {Promise<object[]>}
 */
export async function listUsers() {
  return unwrap(
    await db.from('users').select('*').order('created_at', { ascending: true }),
    'listUsers',
  );
}

/**
 * One user, or null.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getUser(id) {
  return unwrap(
    await db.from('users').select('*').eq('id', id).maybeSingle(),
    `getUser(${id})`,
  );
}
