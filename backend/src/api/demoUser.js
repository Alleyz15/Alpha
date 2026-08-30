// Which user the API acts for.
//
// The demo has no login. The client never sends a user id - if it could, it
// could read and buy on behalf of anyone, and BR-31's ownership mapping would
// be decided by whoever was holding the browser.
//
// One user, chosen server-side. Two are seeded, and switching between them is
// a Phase 6 demo need, not an API one - there is no caller for a switcher yet,
// so there is no switcher.

import { listUsers, getUser } from '../db/index.js';

let cached = null;

/**
 * The demo user this server acts for.
 *
 * DEMO_USER_ID pins it explicitly; otherwise the earliest seeded user is used,
 * which is deterministic because the seed inserts them in a fixed order with
 * fixed ids.
 *
 * @returns {Promise<object>}
 */
export async function getDemoUser() {
  if (cached) return cached;

  const pinned = process.env.DEMO_USER_ID;
  if (pinned) {
    const user = await getUser(pinned);
    if (!user) {
      throw new Error(`DEMO_USER_ID=${pinned} does not match any seeded user. Run the migrations.`);
    }
    cached = user;
    return cached;
  }

  const [first] = await listUsers();
  if (!first) {
    throw new Error('No demo users exist. Apply supabase/migrations/ before starting the API.');
  }
  cached = first;
  return cached;
}

/** Test seam - clears the memoised user. */
export function resetDemoUser() {
  cached = null;
}
