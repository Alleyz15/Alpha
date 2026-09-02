// Finding a size the chain will actually accept.
//
// ===========================================================================
// EMPIRICAL. THE RULE IS UNKNOWN AND THIS CODE DOES NOT PRETEND OTHERWISE.
// ===========================================================================
//
// Filling an order can revert with
//
//     InvalidNumContracts(uint256,uint256)   selector 0xad4c3ef7
//
// carrying (requested, allowed), always differing by exactly one: we ask for n,
// the contract permits n-1. WHY it permits n-1 for some sizes and not others is
// NOT KNOWN. The OptionBook at 0x1bDff855d6811728acaDC00989e79143a2bdfDed is
// unverified on Etherscan, Sourcify and Blockscout, and is not a proxy, so
// there is no source to read. We declined to decompile it.
//
// Four rules were inferred from behaviour and all four were disproved:
//
//   ceil vs floor on the premium      identical fill rates
//   contracts x price divides 1e8     fits 16/16 of one order, fails on ETH
//   recomputed contracts == asked     ETH off by 1 FILLS, AVAX off by 28 reverts
//   the SDK's cap exceeds the chain's the cap is never reached
//
// So this module does not encode a rule. It ASKS THE CHAIN, via callStatic,
// which spends nothing and is the same simulation the pre-flight already runs
// before any fill.
//
// ---------------------------------------------------------------------------
// WHAT WAS MEASURED, 2 Sep 2026
// ---------------------------------------------------------------------------
//
// Stepping the contract count DOWN in whole contracts (1e6 raw) and probing
// each size found a fillable size in 6 of 6 orders tested, within 20 steps:
//
//   XRP order 0   fills at 80, 60                        (of 80..60)
//   XRP order 1   fills at 80, 74, 68, 67, 61, 60
//   XRP order 2   fills at 79, 70
//   AVAX order 0  fills at 15, 10, 5                      (of 15..1)
//   AVAX order 1  fills at every size
//   AVAX order 2  fills at 9 only
//
// Coarser step-downs - rounding to 100, 1e3 ... 1e8 raw - found NOTHING in any
// order where the computed size failed. That approach is dead; do not retry it.
//
// THIS IS A MEASUREMENT, NOT A LAW. Six orders on one afternoon. It may not
// generalise to orders we have not seen, and the bound below is a guess
// calibrated to those six. If it stops working, re-measure before re-tuning.
//
// ---------------------------------------------------------------------------
// NEVER CACHE A RESULT FROM HERE
// ---------------------------------------------------------------------------
//
// The book re-signs every ~60 seconds and prices move with it. The sizes that
// filled a minute ago are not the sizes that fill now - measured directly:
// three consecutive runs against "the same" XRP order returned prices 175091,
// 429377 and 449595, with different fillable sets each time. A cached size is a
// stale size, and the failure would present as the sizing being wrong rather
// than the cache being stale, which is much harder to diagnose.

import { sizePosition } from './sizing.js';

/** One whole contract, at the 6dp scale numContracts uses. */
const ONE_CONTRACT = 1_000_000n;

/**
 * How many sizes to probe, including the computed one.
 *
 * Twenty covered the first six orders measured. A seventh, live-tested the same
 * afternoon, filled only at 60 contracts from a requested 80 - twenty-one steps,
 * one outside the bound - and came back with nothing. Raised to 25 for headroom.
 *
 * That is the honest history: the number is calibrated to what we have seen and
 * was already wrong once. It is not a limit anyone derived.
 *
 * Cost is flat, because the probes run in PARALLEL - 25 sequential eth_calls
 * would be 25 round trips inside the 20-second quote window (BR-8a). Measured
 * at roughly 800ms for the whole batch.
 */
const MAX_PROBES = 25;

/**
 * The candidate sizes to try, largest first.
 *
 * Only ever DOWNWARD from what was asked. Sizing up would protect more units
 * than the user holds and cost more premium than they were shown.
 *
 * @param {bigint} contractsRaw - the computed size
 * @returns {bigint[]}
 */
export function candidateSizes(contractsRaw) {
  const out = [];
  for (let i = 0; i < MAX_PROBES; i += 1) {
    const c = contractsRaw - BigInt(i) * ONE_CONTRACT;
    if (c <= 0n) break;
    out.push(c);
  }
  return out;
}

/** premium for a contract count, matching sizing.js exactly. */
const premiumFor = (contractsRaw, priceRaw) => (contractsRaw * priceRaw) / 100_000_000n;

/**
 * A simulator that needs no private key.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT client.optionBook.callStaticFillOrder: IT REQUIRES A SIGNER.
 * ---------------------------------------------------------------------------
 *
 * The SDK builds its Contract with `this.client.requireSigner()`, so on the
 * read-only client every probe fails with "Signer is required for this
 * operation" - not a refusal, an inability to ask. Wiring this to the signing
 * client would drag the burner's private key into the quote path, which is
 * served by src/api/ and structurally must never reach it.
 *
 * An eth_call needs no key, only a `from` address to simulate as. The filler's
 * PUBLIC address is enough, and THETANUTS_WALLET_ADDRESS exists for exactly
 * this - .env.example describes it as letting read-only tools run without the
 * private key.
 *
 * The simulation is therefore from the perspective of the wallet that will
 * actually fill, which is the right question: it accounts for that wallet's
 * USDC balance and its allowance to the OptionBook. A size can be refused here
 * because the allowance is short rather than because the size is bad - the
 * remedy is to top up the approval, and the pre-flight's own allowance check
 * (BR-12) reports that separately.
 *
 * @returns {Promise<(order: object, premiumRaw: bigint) => Promise<boolean>>}
 */
async function defaultProbe() {
  const from = process.env.THETANUTS_WALLET_ADDRESS;
  if (!from) {
    throw new Error(
      'THETANUTS_WALLET_ADDRESS is not set. Sizes are confirmed against the ' +
      'chain before being quoted, which needs the filling wallet\'s PUBLIC ' +
      'address to simulate from - not its key. Add it to the root .env; it is ' +
      'already described in .env.example.',
    );
  }

  const { ethers } = await import('ethers');
  const { client } = await import('./client.js');
  const { OPTION_BOOK_ABI } = await import('@thetanuts-finance/thetanuts-client');

  return async (orderWithSig, premiumRaw) => {
    const target = client.optionBook.resolveOptionBookTarget(orderWithSig);

    // Mirror fillOrder EXACTLY, including the clamp. The SDK caps the count at
    // the maker's collateral before calling, and omitting that here made the
    // probe refuse three ETH tiers the signing client fills - a false negative
    // that would have dropped working tiers from every quote.
    const maxContracts = client.optionBook.calculateMaxContracts(orderWithSig);
    let numContracts = client.optionBook.calculateNumContracts(
      premiumRaw, orderWithSig.order.price,
    );
    if (numContracts > maxContracts) numContracts = maxContracts;

    const contractOrder = client.optionBook.buildContractOrder(orderWithSig, numContracts);
    const contract = new ethers.Contract(target, OPTION_BOOK_ABI, client.provider);

    // Throws on revert, which the caller reads as "this size will not fill".
    await contract.getFunction('fillOrder').staticCall(
      contractOrder, orderWithSig.signature, ethers.ZeroAddress, { from },
    );
    return true;
  };
}

/**
 * The largest size at or below the requested one that the chain will accept.
 *
 * Probes every candidate in parallel and takes the largest that passes.
 * Broadcasts nothing: callStatic is an eth_call.
 *
 * RETURNS null IF NONE PASS. It never falls back to the computed size - that
 * size has just been measured as failing, and sending it would put the revert
 * after the user confirmed rather than before. A refusal costs a re-quote; a
 * fallback costs a failed transaction and a held balance.
 *
 * @param {object} orderWithSig
 * @param {object} opts - passed through to sizePosition
 * @param {object} [deps] - { optionBook }, injectable for tests
 * @returns {Promise<{contractsRaw:bigint, premiumRaw:bigint, probed:number, adjusted:boolean, requestedRaw:bigint}|null>}
 */
export async function findFillableSize(orderWithSig, opts, deps) {
  const base = sizePosition(orderWithSig, opts);
  const requestedRaw = base.contractsRaw;

  if (requestedRaw <= 0n) return null;

  const probe = deps?.probe ?? await defaultProbe();

  const priceRaw = BigInt(orderWithSig.order.price);
  const candidates = candidateSizes(requestedRaw);

  // All at once. A rejected probe is not an error - it is the answer to the
  // question we asked - so a throw is treated the same as a refusal.
  const results = await Promise.all(candidates.map(async (contractsRaw) => {
    const premiumRaw = premiumFor(contractsRaw, priceRaw);
    if (premiumRaw <= 0n) return null;
    try {
      return await probe(orderWithSig, premiumRaw) ? { contractsRaw, premiumRaw } : null;
    } catch {
      return null;
    }
  }));

  // candidates is ordered largest first, so the first hit is the largest.
  const hit = results.find((r) => r !== null);
  if (!hit) return null;

  const adjusted = hit.contractsRaw !== requestedRaw;

  // Re-derive the WHOLE size from the count that will actually fill, rather
  // than patching the count into the original result. maxPayout, protectedUnits
  // and the premium all follow from the contract count; carrying any of them
  // over from the requested size would show the user figures for a position
  // they are not getting. One contract protects one unit, so the count converts
  // straight back to units.
  const size = adjusted
    ? sizePosition(orderWithSig, { ...opts, units: Number(hit.contractsRaw) / 1e6 })
    : base;

  return {
    size,
    contractsRaw: hit.contractsRaw,
    premiumRaw: hit.premiumRaw,
    probed: candidates.length,
    // Whether the user is getting less than they asked for. The caller MUST
    // surface this: a size the user did not agree to is a premium they did not
    // agree to, even when it is smaller.
    adjusted,
    requestedRaw,
    requestedUnits: Number(requestedRaw) / 1e6,
    actualUnits: Number(hit.contractsRaw) / 1e6,
  };
}
