// Vault shapes for the API, as pure functions.
//
// No database, no network, no credentials.
//
// ---------------------------------------------------------------------------
// TWO CLAIMS THIS PRODUCT MAKES, AND ONLY ONE OF THEM IS A GUARANTEE.
// ---------------------------------------------------------------------------
//
//   principal protection     GUARANTEED. The deposit comes back whole.
//   upside participation     NOT guaranteed. The call may expire unused.
//
// Conflating them is the single most misleading thing this endpoint could do,
// so `principalUsdc` and anything derived from the call are kept apart, and
// nothing here computes an expected payout. On 3 Sep the call expired unused
// and the depositor got every cent back - that is the promise working, and an
// interface that had promised upside would have looked like it failed.

/** USDC has 6 decimals; rounding there keeps float noise out of the payload. */
const usdc = (n) => Math.round(n * 1e6) / 1e6;
const pct = (n) => Math.round(n * 1e4) / 1e4;

/**
 * A vault, as the interface needs it.
 *
 * @param {object} vault - a vaults row
 * @param {object|null} [position] - the backing call, when it has been read
 */
export function vaultView(vault, position = null) {
  return {
    vaultId: vault.id,
    positionId: vault.position_id,
    status: vault.status,

    // --- the deposit and its split ---------------------------------------
    //
    // The split is the mechanism, and showing it is what makes the guarantee
    // legible: the yield portion is what grows back to the principal, and the
    // option portion is the only money at risk.
    principalUsdc: usdc(Number(vault.principal)),
    yieldPortionUsdc: usdc(Number(vault.yield_portion)),
    optionPortionUsdc: usdc(Number(vault.option_portion)),
    yieldRateAnnualPct: Number(vault.yield_rate_annual),

    // BR-37. Pinned true by a CHECK constraint that an UPDATE cannot flip, so
    // this is a fact about the schema rather than a flag someone remembered to
    // set. The interface MUST say the yield is simulated.
    yieldIsSimulated: vault.yield_is_simulated !== false,

    // --- the upside ------------------------------------------------------
    //
    // BR-38: participation comes from the premium actually paid for an option
    // actually held, not from a configured rate. It is a share of a real
    // exposure, which is why exposureUsdc travels with it.
    participationPct: pct(Number(vault.participation_rate)),
    exposureUsdc: usdc(Number(vault.exposure_usdc)),

    maturity: vault.maturity,

    // --- the outcome -----------------------------------------------------
    //
    // Null until settled. NEVER zero as a placeholder: a zero payout is a real
    // and expected result - the call expired unused and the principal came
    // back whole - and it must not be indistinguishable from "not yet known".
    payoutUsdc: vault.payout === null || vault.payout === undefined
      ? null
      : usdc(Number(vault.payout)),
    returnedUsdc: vault.returned_usdc === null || vault.returned_usdc === undefined
      ? null
      : usdc(Number(vault.returned_usdc)),

    recipientAddress: vault.recipient_address ?? null,
    maturityTx: vault.maturity_tx,
    maturityUrl: vault.maturity_tx
      ? `https://basescan.org/tx/${vault.maturity_tx}`
      : null,

    createdAt: vault.created_at,

    // The backing call, when it was read. Its strike is a THRESHOLD - the
    // price above which the depositor shares the gain - and never a floor.
    // Rendering it as a floor is a mistake the dashboard has already made once.
    call: position === null ? null : {
      positionId: position.id,
      asset: position.asset,
      upsideThresholdUsdc: Number(position.strike),
      expiry: position.expiry,
      status: position.status,
      settlementPriceUsdc: position.settlement_price === null
        ? null
        : Number(position.settlement_price),
    },
  };
}

/**
 * Whether this vault can be matured right now, and if not, why.
 *
 * Derived from the row alone - no chain call - so a list can show the state of
 * every button without nine pre-flights. The authoritative answer is still the
 * pre-flight; this only avoids offering an action that will certainly refuse.
 *
 * @param {object} vault
 * @returns {{maturable: boolean, reason: string|null}}
 */
export function maturability(vault) {
  if (vault.status === 'matured') {
    return { maturable: false, reason: 'This deposit has already been returned.' };
  }
  if (vault.status === 'superseded') {
    return { maturable: false, reason: 'This deposit was replaced and will not be returned.' };
  }
  if (vault.status === 'failed') {
    return { maturable: false, reason: 'This deposit did not complete.' };
  }
  if (new Date(vault.maturity).getTime() > Date.now()) {
    return { maturable: false, reason: 'The term has not finished yet.' };
  }
  return { maturable: true, reason: null };
}
