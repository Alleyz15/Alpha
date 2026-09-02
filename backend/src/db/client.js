// Supabase client (IMPLEMENT.md task 2.5).
//
// SERVER-SIDE ONLY. This module holds the secret key, which bypasses every RLS
// policy by design. It must never reach a browser bundle.
//
// The frontend does not talk to Supabase at all - it calls our API, which calls
// this. That is simpler to secure than a second access path, and it matches the
// custodial model: the frontend is a view, not an actor.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url) {
  throw new Error('SUPABASE_URL is not set. Copy backend/.env.example to .env and fill it in.');
}
if (!secretKey) {
  throw new Error('SUPABASE_SECRET_KEY is not set. Copy backend/.env.example to .env and fill it in.');
}

// BR-17: a VITE_ prefix bundles a variable into the browser, where anyone can
// read it. A secret key behind that prefix is a total compromise of the
// database, so fail loudly at startup rather than leaving it to review.
const leaked = Object.keys(process.env).filter((key) =>
  key.startsWith('VITE_') &&
  (process.env[key] === secretKey || String(process.env[key]).startsWith('sb_secret_')));

if (leaked.length > 0) {
  // Names only. Never print the value.
  throw new Error(
    `A Supabase secret key is exposed behind a VITE_ prefix (${leaked.join(', ')}). ` +
    'VITE_ variables are bundled into the browser. Remove it and rotate the key (BR-17).',
  );
}

// Belt and braces: if this module is ever bundled into a browser, say so
// loudly rather than shipping the key to every visitor.
if (typeof window !== 'undefined') {
  throw new Error('backend/src/db is server-side only and must never be imported into browser code (BR-17).');
}

export const db = createClient(url, secretKey, {
  auth: {
    // No user sessions here. The backend is the only actor and it authenticates
    // with the key on every request.
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Throw on a Supabase error, with context worth reading at 2am.
 *
 * Fail loudly: a swallowed database error during a purchase leaves a position
 * unrecorded, and BR-14 exists precisely so that cannot happen quietly.
 *
 * @param {{ data: any, error: any }} result
 * @param {string} context
 */
export function unwrap({ data, error }, context) {
  if (error) {
    const err = new Error(`${context}: ${error.message}`);
    err.code = error.code;
    err.details = error.details;
    throw err;
  }
  return data;
}
