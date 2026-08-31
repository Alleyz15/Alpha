// Confirmed reads.
//
// ---------------------------------------------------------------------------
// The failure mode this exists to prevent is a stale number that reads as fact.
// ---------------------------------------------------------------------------
//
// Read-your-own-write has bitten four times in one day (see the gotcha in
// docs/SETUP.md). Every instance had the same shape: something was read
// immediately after the state it describes changed, and the answer was served
// from a moment before the change.
//
// Staleness is not the real problem - a node lagging a block is normal and
// unavoidable. The problem is PRINTING a stale value as though it were
// confirmed. The disbursement script reported "USDC 9.371552 (was 9.371552)"
// after successfully sending 4.5977 USDC, which is not a small inaccuracy; it
// is a wrong number presented as a fact about money.
//
// So this returns { value, confirmed } and callers must decide what to do when
// confirmed is false. It never silently substitutes a guess, and formatRead()
// makes an unconfirmed value visibly unconfirmed in output.

/**
 * Read until the value satisfies a condition, or the attempts run out.
 *
 * @param {() => Promise<any>} read - the read to retry
 * @param {object} [opts]
 * @param {(value: any) => boolean} [opts.until] - what "settled" looks like.
 *   Default: any non-null, non-undefined value.
 * @param {number} [opts.attempts]
 * @param {number} [opts.delayMs] - base delay; backs off linearly
 * @param {string} [opts.label] - for the caller's own reporting
 * @returns {Promise<{ value: any, confirmed: boolean, attempts: number, error: string|null, label: string }>}
 */
export async function confirmedRead(read, {
  until = (v) => v !== null && v !== undefined,
  attempts = 6,
  delayMs = 800,
  label = 'read',
} = {}) {
  let value = null;
  let error = null;

  for (let i = 1; i <= attempts; i++) {
    try {
      value = await read();
      error = null;
      if (until(value)) {
        return { value, confirmed: true, attempts: i, error: null, label };
      }
    } catch (e) {
      error = e.message;
    }
    // Linear backoff. A fresh contract or a lagging node usually catches up in
    // a block or two; anything longer is a real problem, not a race.
    if (i < attempts) await new Promise((r) => setTimeout(r, delayMs * i));
  }

  return { value, confirmed: false, attempts, error, label };
}

/**
 * Read until the value CHANGES from a known previous one.
 *
 * The right check after a write whose effect you already know: a balance after
 * a transfer, an allowance after an approval. Waiting for "not null" would
 * accept the pre-write value, which is exactly the bug.
 *
 * @param {() => Promise<any>} read
 * @param {any} previous - the value before the write, compared by String()
 */
export function readUntilChanged(read, previous, opts = {}) {
  return confirmedRead(read, {
    ...opts,
    until: (v) => v !== null && v !== undefined && String(v) !== String(previous),
  });
}

/**
 * Render a read for a terminal, so an unconfirmed value cannot be mistaken for
 * a confirmed one.
 *
 * @param {object} result - a confirmedRead() result
 * @param {(value: any) => string} [format]
 * @returns {string}
 */
export function formatRead(result, format = (v) => String(v)) {
  if (result.confirmed) return format(result.value);

  const reason = result.error
    ? `read failed: ${result.error}`
    : `not confirmed after ${result.attempts} attempts`;

  // Deliberately ugly. An unconfirmed number should not look like a fact.
  return `UNCONFIRMED (${reason})` +
    (result.value !== null && result.value !== undefined
      ? ` — last seen ${format(result.value)}, which may be stale`
      : '');
}
