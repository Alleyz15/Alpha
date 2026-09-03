// Vault maturity (IMPLEMENT.md 8.6).
//
// ---------------------------------------------------------------------------
// THE THIRD IRREVERSIBLE WRITE. A USDC transfer cannot be recalled.
// ---------------------------------------------------------------------------
//
// At maturity the depositor gets their principal back in full, plus their share
// of any rise in the call. The principal is a modelled figure - nothing was ever
// deposited (BR-50) - but the transfer is real USDC leaving a real wallet, so it
// gets the same discipline as a fill:
//
//   1. pre-flight, ending in a dry run that must pass   (BR-28)
//   2. write the row BEFORE broadcasting                (BR-14's logic)
//   3. transfer
//   4. record the hash, or leave the row unresolved     - never retry
//
// WHAT THE PAYOUT IS, AND WHY IT IS USUALLY ZERO.
//
// The call is bought ABOVE spot. If the price finishes below the strike it
// expires unused and the payout is zero - the depositor still gets every cent of
// principal back, which is the whole promise. A zero payout is the expected
// outcome over a two-day tenor, not a failure, and the runbook says so because
// an operator seeing 0.00 at 16:00 will otherwise think something broke.
//
// computeMaturity() is pure and needs no credentials, so the money arithmetic is
// testable. Everything that touches the chain or the database is below it.

const USDC_SCALE = 1_000_000n;

/** Round to USDC's six decimals. */
const usdc6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * What a matured vault owes its depositor.
 *
 * Principal is returned WHOLE regardless of the payout - that is what
 * "principal protected" means, and a rounding that shaved it would break the
 * one promise the product makes.
 *
 * @param {object} vault - a vaults row
 * @param {number|string|null} payoutUsdc - the call's settled payout, 0 if unused
 * @returns {{principalUsdc:number, payoutUsdc:number, totalUsdc:number, totalRaw:bigint}}
 */
export function computeMaturity(vault, payoutUsdc) {
  const principalUsdc = Number(vault.principal);
  if (!(principalUsdc > 0)) {
    throw new Error(`computeMaturity: vault ${vault?.id} has a non-positive principal`);
  }

  const payout = Number(payoutUsdc ?? 0);
  if (!Number.isFinite(payout) || payout < 0) {
    throw new RangeError(`computeMaturity: payout must be zero or positive, got ${payoutUsdc}`);
  }

  const totalUsdc = principalUsdc + payout;

  // Round UP to the micro-unit, so a depositor is never returned less than the
  // principal they were promised.
  const totalRaw = BigInt(Math.ceil(totalUsdc * 1e6));

  return {
    principalUsdc: usdc6(principalUsdc),
    payoutUsdc: usdc6(payout),
    totalUsdc: Number(totalRaw) / 1e6,
    totalRaw,
  };
}

const item = (id, label, pass, detail) => ({ id, label, pass, detail });

/**
 * Pre-flight for a maturity transfer. Reads and simulates; writes nothing,
 * sends nothing. Reports every item rather than stopping at the first failure.
 *
 * @param {object} args
 * @param {object} args.vault
 * @param {object} args.position - the call backing it
 * @param {string} args.recipient
 * @returns {Promise<object>}
 */
export async function runMaturityPreflight({ vault, position, recipient }) {
  const { getSigningClient, getWalletAddress } = await import('../thetanuts/signer.js');
  const { usdcAddress, getWalletBalances } = await import('../thetanuts/wallet.js');
  const { readSettlementState } = await import('../scheduler/settlement.js');

  const client = getSigningClient();
  const checks = [];

  // 1. The vault must be in a state that can mature.
  const statusOk = ['active', 'maturing'].includes(vault.status);
  checks.push(item(1, 'vault is active or already maturing', statusOk,
    `status ${vault.status}` + (vault.status === 'matured' ? ` (tx ${vault.maturity_tx})` : '')));

  // 2. Maturity is a date, and it must have arrived. The guarantee exists at
  //    expiry and not before (BR-48's sibling for vaults).
  const matured = new Date(vault.maturity).getTime() <= Date.now();
  checks.push(item(2, 'maturity date has arrived', matured,
    `matures ${new Date(vault.maturity).toISOString()}` +
    (matured ? '' : ` — ${((new Date(vault.maturity) - Date.now()) / 3_600_000).toFixed(1)}h to go`)));

  // 3. The call must have settled on chain, or the payout is unknown. Settlement
  //    is automatic but NOT guaranteed - the protocol emits a failure event -
  //    so this is read, never assumed.
  let settlement = null;
  let settledOk = false;
  let settledDetail = 'not read';
  try {
    settlement = await readSettlementState(position);
    settledOk = Boolean(settlement.readable && settlement.settled);
    // Three distinct states, and an operator must be able to tell them apart.
    // "expired but not settled" told to someone whose option has not expired
    // yet sends them looking for a protocol fault that does not exist.
    if (!settlement.readable) {
      settledDetail = `unreadable: ${settlement.reason}`;
    } else if (settlement.settled) {
      settledDetail = `settled at $${settlement.settlementPrice ?? '?'}`;
    } else if (!settlement.expired) {
      settledDetail = 'the call has not expired yet — nothing to settle, come back after expiry';
    } else {
      settledDetail = `expired ${settlement.hoursPastExpiry?.toFixed(1) ?? '?'}h ago but NOT yet ` +
        'settled on chain — wait and re-run; do not assume the payout is zero';
    }
  } catch (error) {
    settledDetail = `threw: ${error.message.slice(0, 90)}`;
  }
  checks.push(item(3, 'the call has settled on chain', settledOk, settledDetail));

  // 4. What is owed. Payout may legitimately be zero.
  let owed = null;
  let owedOk = false;
  let owedDetail = 'not computed';
  try {
    const payout = settlement?.payoutUsdc ?? position.payout ?? 0;
    owed = computeMaturity(vault, payout);
    owedOk = owed.totalUsdc >= Number(vault.principal);
    owedDetail = `${owed.principalUsdc} principal + ${owed.payoutUsdc} payout = ${owed.totalUsdc} USDC` +
      (owed.payoutUsdc === 0 ? '  (payout zero: the call finished below its strike, as expected)' : '');
  } catch (error) {
    owedDetail = error.message.slice(0, 90);
  }
  checks.push(item(4, 'principal is returned whole', owedOk, owedDetail));

  // 5. We must hold it.
  const funds = await getWalletBalances();
  const needRaw = owed?.totalRaw ?? 0n;
  const hasUsdc = owed ? funds.usdcRaw >= needRaw : false;
  checks.push(item(5, 'wallet holds the full return', hasUsdc,
    `holds ${funds.usdc.toFixed(6)}, sending ${owed ? owed.totalUsdc : '?'} — ` +
    `${owed ? (funds.usdc - owed.totalUsdc).toFixed(6) : '?'} would remain`));

  // 6. Gas.
  const gasNeededEth = Number(60_000n * funds.gasPriceWei) / 1e18;
  checks.push(item(6, 'wallet holds gas', funds.eth > gasNeededEth,
    `holds ${funds.eth.toFixed(8)} ETH, needs ~${gasNeededEth.toFixed(8)}`));

  // 7. A recipient we meant. Sending USDC to the zero address burns it.
  const recipientOk = /^0x[0-9a-fA-F]{40}$/.test(recipient ?? '') &&
    recipient.toLowerCase() !== '0x0000000000000000000000000000000000000000' &&
    recipient.toLowerCase() !== getWalletAddress();
  checks.push(item(7, 'recipient is valid and not ourselves', recipientOk, recipient ?? '(none given)'));

  // 8. One maturity per vault.
  const notPaid = vault.maturity_tx == null;
  checks.push(item(8, 'not already matured', notPaid,
    notPaid ? 'no maturity transaction recorded' : `already paid: ${vault.maturity_tx}`));

  // 9. The dry run (BR-28).
  let simulation = null;
  let simulationOk = false;
  let simulationDetail = 'not attempted';
  if (owed && recipientOk) {
    try {
      simulation = await client.erc20.callStaticTransfer(usdcAddress(), recipient, owed.totalRaw);
      simulationOk = simulation.success === true;
      simulationDetail = simulationOk
        ? `would succeed, gas estimate ${simulation.gasEstimate}`
        : `${simulation.error?.code ?? 'REVERT'}: ${(simulation.error?.message ?? '').slice(0, 80)}`;
    } catch (error) {
      simulationDetail = `threw: ${error.message.slice(0, 90)}`;
    }
  } else {
    simulationDetail = 'skipped: nothing valid to simulate';
  }
  checks.push(item(9, 'callStaticTransfer succeeded', simulationOk, simulationDetail));

  return { pass: checks.every((c) => c.pass), checks, owed, settlement, funds };
}

/** Render a maturity checklist for a terminal. */
export function formatMaturityPreflight(result) {
  const lines = result.checks.map((c) =>
    `  ${c.pass ? 'PASS' : 'FAIL'}  ${String(c.id).padStart(2)}. ${c.label.padEnd(38)} ${c.detail}`);
  lines.push('');
  lines.push(result.pass
    ? '  ALL CHECKS PASSED — a maturity transfer would be allowed to broadcast.'
    : '  BLOCKED — at least one check failed. Nothing may be sent.');
  return lines.join('\n');
}

/**
 * Pay a matured vault.
 *
 * ---------------------------------------------------------------------------
 * THIS SENDS REAL USDC. The transfer cannot be recalled.
 * ---------------------------------------------------------------------------
 *
 * @param {object} args
 * @param {string} args.vaultId
 * @param {string} args.recipient
 * @param {boolean} args.confirmed - must be true
 */
export async function matureVault({ vaultId, recipient, confirmed = false }) {
  if (!confirmed) {
    throw new Error('matureVault requires { confirmed: true }. This sends real USDC and cannot be recalled.');
  }

  const { db, unwrap } = await import('../db/client.js');
  const { getSigningClient, getWalletAddress } = await import('../thetanuts/signer.js');
  const { usdcAddress } = await import('../thetanuts/wallet.js');

  const vault = unwrap(
    await db.from('vaults').select('*').eq('id', vaultId).single(),
    'matureVault: reading the vault',
  );
  const position = unwrap(
    await db.from('positions').select('*').eq('id', vault.position_id).single(),
    'matureVault: reading the call',
  );

  const preflight = await runMaturityPreflight({ vault, position, recipient });
  if (!preflight.pass) {
    // Typed, not merely worded. A caller other than the CLI has to tell these
    // three outcomes apart, and the difference between them is the difference
    // between "fix it and try again", "nothing happened" and "DO NOT TOUCH
    // THIS". Matching on message text would make that distinction depend on
    // prose that someone will one day reword.
    throw Object.assign(
      new Error('matureVault refused: pre-flight failed. Nothing was sent.'),
      { code: 'MATURITY_PREFLIGHT_FAILED', preflight, sent: false },
    );
  }

  const owed = preflight.owed;

  // BR-14's logic: the row records the intent and the exact figure BEFORE the
  // money moves. A vault left at 'maturing' means the outcome is unknown and a
  // human must check the chain - which is a different and more useful thing
  // than a row that still says 'active' after a transfer may have landed.
  unwrap(
    await db.from('vaults').update({
      status: 'maturing',
      returned_usdc: owed.totalUsdc,
      recipient_address: recipient.toLowerCase(),
    }).eq('id', vault.id).select().single(),
    'matureVault: recording the intended maturity',
  );

  const client = getSigningClient();
  let receipt;
  try {
    receipt = await client.erc20.transfer(usdcAddress(), recipient, owed.totalRaw);
  } catch (error) {
    const reverted = /revert|insufficient/i.test(error?.message ?? '');
    if (reverted) {
      // A revert is a definite answer: nothing moved.
      const marked = await db.from('vaults').update({ status: 'active' }).eq('id', vault.id);
      if (marked.error) {
        console.error('[maturity] FAILED to reset vault', vault.id, ':', marked.error.message);
      }
      throw Object.assign(
        new Error(`maturity transfer reverted, nothing was sent: ${error?.message ?? error}`),
        { code: 'MATURITY_REVERTED', sent: false },
      );
    }
    // Anything else is NOT an answer. The transfer may have landed; retrying
    // would pay twice. The row stays at 'maturing' for a human.
    throw Object.assign(
      new Error(
        `maturity outcome UNKNOWN for vault ${vault.id}: ${error?.message ?? error}\n` +
        `The transfer may have landed. DO NOT RETRY — check ` +
        `https://basescan.org/address/${getWalletAddress()} and resolve by hand.`,
      ),
      // `sent` is deliberately null rather than false. The transfer may have
      // landed, and anything reading this as "not sent" would retry and pay
      // twice. Unknown is its own answer, and it is not a smaller kind of no.
      { code: 'MATURITY_OUTCOME_UNKNOWN', sent: null, vaultId: vault.id },
    );
  }

  const txHash = receipt?.hash ?? receipt?.transactionHash ?? null;

  const updated = unwrap(
    await db.from('vaults').update({
      status: 'matured',
      maturity_tx: txHash ? txHash.toLowerCase() : null,
    }).eq('id', vault.id).select().single(),
    'matureVault: recording the transaction',
  );

  return {
    vault: updated,
    txHash,
    explorerUrl: txHash ? `https://basescan.org/tx/${txHash}` : null,
    ...owed,
    recipient,
  };
}
