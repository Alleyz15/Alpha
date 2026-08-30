// Served quote sets, held in memory until they expire (BR-8).
//
// ---------------------------------------------------------------------------
// Why these are not in Postgres
// ---------------------------------------------------------------------------
// The `quotes` table records what was purchased, not every price that was ever
// displayed. Most quote sets are never acted on, they are valid for sixty
// seconds, and writing three rows per keystroke-driven request would fill the
// table with data whose only reader is a timeout.
//
// The chosen tier IS persisted, at purchase time, before the position is
// written - that is the boundary where a quote stops being a display and
// becomes a commitment (BR-40).
//
// Consequence, stated plainly: a restart drops every outstanding quote and
// those users must request a new one. For a locally-run demo that is the right
// trade; a hosted multi-instance deployment would need shared storage, and we
// do not have one (docs/SETUP.md, deployment).

/** quoteId -> { set, expiresAtMs } */
const sets = new Map();

/** How often to sweep. Frequent enough that nothing lingers long. */
const SWEEP_INTERVAL_MS = 30_000;

let sweepTimer = null;

/**
 * Drop everything past its validity window.
 * @returns {number} how many were removed
 */
export function sweepExpired(now = Date.now()) {
  let removed = 0;
  for (const [quoteId, entry] of sets) {
    if (now >= entry.expiresAtMs) {
      sets.delete(quoteId);
      removed++;
    }
  }
  return removed;
}

/**
 * Remember a served set until it expires.
 * @param {object} set - a buildQuoteSet() result
 */
export function rememberQuoteSet(set) {
  sets.set(set.quoteId, { set, expiresAtMs: new Date(set.expiresAt).getTime() });
}

/**
 * Look up a set, or null if it is unknown or expired.
 *
 * Expiry is checked on read as well as on sweep, so a set can never be used in
 * the window between lapsing and the next sweep. BR-8 is about the moment of
 * use, not the moment of cleanup.
 *
 * @param {string} quoteId
 * @returns {object|null}
 */
export function getQuoteSet(quoteId, now = Date.now()) {
  const entry = sets.get(quoteId);
  if (!entry) return null;
  if (now >= entry.expiresAtMs) {
    sets.delete(quoteId);
    return null;
  }
  return entry.set;
}

/** Drop one set - called once a purchase has consumed it. */
export function forgetQuoteSet(quoteId) {
  sets.delete(quoteId);
}

/** Start the periodic sweep. unref() so it never holds the process open. */
export function startSweeping(intervalMs = SWEEP_INTERVAL_MS) {
  if (sweepTimer) return sweepTimer;
  sweepTimer = setInterval(() => sweepExpired(), intervalMs);
  sweepTimer.unref?.();
  return sweepTimer;
}

export function stopSweeping() {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

/** Diagnostics only. */
export function size() {
  return sets.size;
}
