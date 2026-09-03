// Buying the call that backs a deposit.
//
// ===========================================================================
// THE ROW EXISTS BEFORE THE MONEY MOVES. THAT IS THE WHOLE REASON THIS EXISTS.
// ===========================================================================
//
// This logic used to live inline in scripts/vault.js, and it wrote the vaults
// row AFTER the fill confirmed. A process that died in between left an option
// on chain that nothing in the database recorded owning - the exact gap BR-14
// exists to prevent, in the one place the rule was not applied.
//
// It was worse than an ordering mistake. The insert's failure was handled like
// this:
//
//     if (vault.error) { console.error(...); } else { ...print the row... }
//
// so a failed vault insert printed a wallet summary and exited zero. Twenty-one
// instances of that family are recorded in SETUP.md; this was very nearly the
// twenty-second, and it would have cost a real deposit rather than a log line.
//
// The order is now:
//
//   1. quote and split          nothing written, nothing sent
//   2. pre-flight by callStatic nothing sent
//   3. vault row  -> 'pending'  WRITTEN FIRST
//   4. position row -> 'pending_verification'
//   5. fillOrder                the only irreversible step
//   6. both rows -> confirmed, or resolved from chain on failure
//
// Extracted so the script and the API run the same code. A second path to
// spending money is a second thing that can be wrong, and only one of them
// would get the next fix.

import { quoteVault, yieldRateAnnualPct } from './vault.js';
import { resolveFillFailure, extractUsdcSpent } from '../thetanuts/fillOutcome.js';

/** USDC 6dp. */
const usdcRaw = (n) => BigInt(Math.round(n * 1e6));

/**
 * Price a deposit and confirm the chain would accept the fill.
 *
 * Sends nothing and writes nothing. Separated from the buy so both the script's
 * dry run and the API's estimate call exactly the code that runs for real -
 * a dry run that exercises a different path is not a dry run.
 *
 * @param {object} args
 * @param {string} [args.asset]
 * @param {number} args.principalUsdc
 * @param {object} deps - { client, walletBalances, quoteVault? }
 * @returns {Promise<{pass:boolean, checks:object[], quote:object, usdcAmountRaw:bigint, contractsRaw:bigint}>}
 */
export async function runDepositPreflight({ asset = 'ETH', principalUsdc }, deps) {
  const { client, walletBalances } = deps;
  const checks = [];
  const item = (label, pass, detail) => { checks.push({ label, pass, detail }); return pass; };

  // Injectable so the ordering of the steps below can be driven and asserted
  // without reaching the live book. Defaults to the real one, so the production
  // path is the untouched path.
  const priceIt = deps.quoteVault ?? quoteVault;
  const quote = await priceIt({ asset, principalUsdc });

  const usdcAmountRaw = usdcRaw(quote.optionPortion);
  const contractsRaw = usdcRaw(quote.contracts);

  // 1. The split has to account for the whole deposit, or the guarantee is
  //    against a number nobody deposited. The database enforces this too.
  const splitSums = Math.abs((quote.yieldPortion + quote.optionPortion) - principalUsdc) < 1e-6;
  item('the split accounts for the whole deposit', splitSums,
    `${quote.yieldPortion} yield + ${quote.optionPortion} option = ${principalUsdc}`);

  // 2. A call ABOVE spot. Below spot it is already in the money and is not
  //    upside participation, it is a different product bought by accident.
  item('the call strike is above spot', quote.strike > quote.spot,
    `strike $${quote.strike} vs spot $${quote.spot.toFixed(2)}`);

  // 3. Participation must come from the premium actually quoted (BR-38). Zero
  //    would mean the deposit buys nothing and the product is a savings account
  //    with extra steps.
  item('participation is derived and non-zero', quote.participationPct > 0,
    `${quote.participationPct}% from $${quote.exposureUsdc} exposure`);

  // 4. The operator wallet has to hold the option portion. The user's deposit
  //    is simulated (BR-50); the USDC that buys the call is real and ours.
  const balances = await walletBalances();
  item('wallet holds the option portion', balances.usdc >= quote.optionPortion,
    `holds ${balances.usdc.toFixed(6)}, spending ${quote.optionPortion}`);

  // 5. Ask the chain whether this exact fill would work, rather than assuming.
  //    Same simulation the put pre-flight runs.
  let sim = null;
  try {
    sim = await client.optionBook.callStaticFillOrder(quote.call.raw, usdcAmountRaw);
  } catch (error) {
    sim = { success: false, error };
  }
  item('callStaticFillOrder succeeded', Boolean(sim?.success),
    sim?.success
      ? `would succeed, gas estimate ${sim.gasEstimate}`
      : `WOULD REVERT — ${String(sim?.error?.message ?? '').slice(0, 90)}`);

  return {
    pass: checks.every((c) => c.pass),
    checks,
    quote,
    usdcAmountRaw,
    contractsRaw,
  };
}

/**
 * Buy the call and record the deposit.
 *
 * **THIS SPENDS REAL USDC.** Requires `confirmed: true`.
 *
 * Throws with a `code` so a caller can tell the outcomes apart without reading
 * prose - the same reason matureVault does:
 *
 *   DEPOSIT_PREFLIGHT_FAILED   nothing written, nothing sent
 *   DEPOSIT_REVERTED           definitively refused; rows marked failed
 *   DEPOSIT_OUTCOME_UNKNOWN    may have landed; rows left pending. DO NOT RETRY
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {string} [args.asset]
 * @param {number} args.principalUsdc
 * @param {boolean} args.confirmed
 * @param {object} deps
 * @returns {Promise<object>}
 */
export async function depositToVault(
  { userId, asset = 'ETH', principalUsdc, confirmed = false },
  deps,
) {
  if (!confirmed) {
    throw new Error('depositToVault requires { confirmed: true }. This spends real USDC.');
  }

  const {
    client, walletBalances, insertVault, updateVault, insertPendingPosition,
    transitionPosition, confirmedRead, walletAddress,
  } = deps;

  const pre = await runDepositPreflight({ asset, principalUsdc }, deps);
  if (!pre.pass) {
    throw Object.assign(
      new Error('depositToVault refused: pre-flight failed. Nothing was written or sent.'),
      { code: 'DEPOSIT_PREFLIGHT_FAILED', preflight: pre, sent: false },
    );
  }

  const { quote, usdcAmountRaw, contractsRaw } = pre;

  // ---------------------------------------------------------------------
  // 3. THE VAULT ROW, FIRST. Before the position, before the broadcast.
  // ---------------------------------------------------------------------
  //
  // position_id is null: the call does not exist yet, and claiming one that
  // does not exist would be worse than leaving it open. It is filled in below.
  //
  // NOT wrapped in a try that continues - if this write fails, nothing has been
  // spent and the right thing is to stop. The old code logged and carried on.
  const vault = await insertVault({
    user_id: userId,
    position_id: null,
    status: 'pending',
    principal: quote.principalUsdc,
    yield_portion: quote.yieldPortion,
    option_portion: quote.optionPortion,
    yield_rate_annual: yieldRateAnnualPct(),
    participation_rate: quote.participationPct,
    exposure_usdc: quote.exposureUsdc,
    maturity: quote.expiry.toISOString(),
  });

  // 4. The position, through the same machinery a put uses.
  const position = await insertPendingPosition({
    userId,
    asset,
    strike: quote.strike,
    strikeRaw: String(quote.call.raw.order.strikePrice),
    expiry: quote.expiry.toISOString(),
    numContractsRaw: contractsRaw.toString(),
    // A CALL. Without this the dashboard renders its strike as a protection
    // floor above spot, which reads as a bug to anyone who looks.
    optionType: 'call',
  });

  await updateVault(vault.id, { position_id: position.id });

  await transitionPosition(position.id, {
    toStatus: 'pending_verification',
    eventType: 'broadcast',
    payload: {
      vault: true,
      vaultId: vault.id,
      usdcAmountRaw: usdcAmountRaw.toString(),
      submittedAt: new Date().toISOString(),
    },
  });

  // Captured before the call so a failure can be told apart from a refusal.
  let nonceBefore = null;
  try {
    nonceBefore = await client.provider.getTransactionCount(walletAddress, 'latest');
  } catch {
    nonceBefore = null;
  }

  // ---------------------------------------------------------------------
  // 5. THE ONLY IRREVERSIBLE STEP.
  // ---------------------------------------------------------------------
  let receipt;
  try {
    receipt = await client.optionBook.fillOrder(quote.call.raw, usdcAmountRaw);
  } catch (error) {
    // The SDK calls everything it does not recognise a revert. Ask the chain.
    const outcome = await resolveFillFailure({
      error, nonceBefore, wallet: walletAddress, provider: client.provider,
    });

    if (outcome.kind === 'succeeded') {
      receipt = { ...outcome.receipt, hash: outcome.txHash };
    } else if (outcome.kind === 'reverted' || outcome.kind === 'not_sent') {
      await transitionPosition(position.id, {
        toStatus: 'failed',
        eventType: 'failed',
        payload: { vault: true, outcome: outcome.kind, evidence: outcome.evidence },
      });
      await updateVault(vault.id, { status: 'failed' });

      throw Object.assign(
        new Error(`deposit ${outcome.kind}, nothing was bought (${outcome.evidence})`),
        { code: 'DEPOSIT_REVERTED', sent: false, vaultId: vault.id, positionId: position.id },
      );
    } else {
      // Unknown. Both rows stay where they are - vault 'pending', position
      // 'pending_verification' - because either may yet turn out to be real.
      throw Object.assign(
        new Error(
          `deposit outcome UNKNOWN for vault ${vault.id} (${outcome.evidence}). ` +
          'The transaction may have landed. DO NOT RETRY — resolve against chain state.',
        ),
        { code: 'DEPOSIT_OUTCOME_UNKNOWN', sent: null, vaultId: vault.id, positionId: position.id },
      );
    }
  }

  // ---------------------------------------------------------------------
  // 6. Record what actually happened, read back rather than assumed.
  // ---------------------------------------------------------------------
  const txHash = receipt?.txHash ?? receipt?.hash ?? receipt?.transactionHash ?? null;
  const mined = typeof receipt?.wait === 'function' ? await receipt.wait() : receipt;

  const optionAddress = (mined?.logs ?? [])
    .map((l) => l.address?.toLowerCase())
    .find((a) => a && a !== client.chainConfig.tokens.USDC.address.toLowerCase()
      && a !== client.chainConfig.contracts.optionBook.toLowerCase()) ?? null;

  // Read-your-own-write has bitten repeatedly, so this polls rather than
  // reading once and trusting it.
  const onChain = optionAddress
    ? await confirmedRead(
      async () => (await client.option.getFullOptionInfo(optionAddress))?.numContracts ?? null,
      { label: 'on-chain contract count', attempts: 6, delayMs: 900 })
    : { value: null, confirmed: false, attempts: 0, error: 'no option address in the receipt' };

  // What actually left the wallet - the premium to the maker PLUS the protocol
  // fee - rather than the figure we quoted. Without this the row records
  // premium_paid null, which the API renders as "not charged" for a position
  // that cost real money.
  const premiumPaid = extractUsdcSpent(
    mined, walletAddress, client.chainConfig.tokens.USDC.address,
  ) ?? Number(usdcAmountRaw) / 1e6;

  await transitionPosition(position.id, {
    toStatus: 'active',
    eventType: 'confirmed',
    txHash,
    optionAddress,
    premiumPaid,
    numContractsRaw: onChain.confirmed ? onChain.value.toString() : null,
    payload: {
      vault: true,
      vaultId: vault.id,
      quotedContractsRaw: contractsRaw.toString(),
      onChainContractsConfirmed: onChain.confirmed,
      onChainContractsRaw: onChain.confirmed ? onChain.value.toString() : null,
      readAttempts: onChain.attempts,
    },
  });

  const activated = await updateVault(vault.id, { status: 'active' });

  return {
    vault: activated,
    position,
    quote,
    txHash,
    explorerUrl: txHash ? `https://basescan.org/tx/${txHash}` : null,
    optionAddress,
    contractsConfirmed: onChain.confirmed,
    sent: true,
  };
}

/**
 * The real wiring, resolved at CALL time.
 *
 * Imported dynamically so this module stays importable without credentials -
 * db/client.js and signer.js both throw at load without them, and a module that
 * cannot be imported cannot be tested. runDepositPreflight and depositToVault
 * take their dependencies as arguments for the same reason.
 *
 * Both the script and the API call this, so there is exactly one wiring. A
 * second path to spending money is a second thing that can be wrong, and only
 * one of the two would ever get the next fix.
 *
 * @returns {Promise<object>}
 */
export async function defaultDepositDeps() {
  const [{ getSigningClient, getWalletAddress }, wallet, vaults, positions, confirm] =
    await Promise.all([
      import('../thetanuts/signer.js'),
      import('../thetanuts/wallet.js'),
      import('../db/vaults.js'),
      import('../db/positions.js'),
      import('../thetanuts/confirmRead.js'),
    ]);

  return {
    client: getSigningClient(),
    walletAddress: getWalletAddress(),
    walletBalances: wallet.getWalletBalances,
    quoteVault,
    insertVault: vaults.insertVault,
    updateVault: vaults.updateVault,
    insertPendingPosition: positions.insertPendingPosition,
    transitionPosition: positions.transitionPosition,
    confirmedRead: confirm.confirmedRead,
  };
}
