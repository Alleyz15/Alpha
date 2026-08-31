// Reconciliation (IMPLEMENT.md 3.10, BR-36).
//
// ---------------------------------------------------------------------------
// Extracted so it can be reused and tested, not only printed.
// ---------------------------------------------------------------------------
//
// scripts/reconcile.js audits; this module holds the logic it audits with, plus
// the one thing the audit cannot do: REPAIR a position whose outcome we never
// learned. Phase 7's disbursement is a second irreversible write and inherits
// this rather than discovering it needs its own.
//
// Reads use the READ-ONLY client. The only writes are to our own rows, through
// transitionPosition, so every repair leaves an event.

import { ethers } from 'ethers';
import { client } from './client.js';
import { db } from '../db/client.js';
import { getPosition, transitionPosition, listUnresolvedPositions } from '../db/positions.js';

/** A transaction that has not appeared this long is treated as never sent. */
const graceHours = () => Number(process.env.FILL_VERIFY_GRACE_HOURS ?? 1);

/** The option address on an indexer entry, however the field happens to be named. */
export const addrOf = (o) =>
  (o?.optionAddress ?? o?.option?.address ?? o?.address ?? o?.option_address ?? '').toLowerCase();

/** Compare tx hashes regardless of 0x prefix or case - the indexer omits 0x. */
export const stripHex = (h) => (h ?? '').toString().toLowerCase().replace(/^0x/, '');

/**
 * The wallet to reconcile. Prefers THETANUTS_WALLET_ADDRESS so the audit runs
 * without the private key present; the address is public either way.
 */
export function resolveWallet(fallbackAddress = null) {
  const fromEnv = process.env.THETANUTS_WALLET_ADDRESS?.trim();
  if (fromEnv) {
    try {
      return ethers.getAddress(fromEnv).toLowerCase();
    } catch {
      throw new Error(`THETANUTS_WALLET_ADDRESS is not a valid address: ${fromEnv}`);
    }
  }
  if (fallbackAddress) return fallbackAddress.toLowerCase();
  throw new Error('No wallet address: set THETANUTS_WALLET_ADDRESS or pass one in.');
}

/**
 * The chain's view of everything this wallet holds, keyed by option address.
 * @returns {Promise<{ ok: boolean, byAddr: Map, list: object[], error: string|null }>}
 */
export async function loadChainPositions(wallet) {
  try {
    const raw = await client.api.getUserPositionsFromIndexer(wallet);
    const list = Array.isArray(raw) ? raw : (raw?.positions ?? []);
    const byAddr = new Map();
    for (const o of list) {
      const a = addrOf(o);
      if (a) byAddr.set(a, o);
    }
    return { ok: true, byAddr, list, error: null };
  } catch (e) {
    return { ok: false, byAddr: new Map(), list: [], error: e.message };
  }
}

/**
 * Rebuild one position's facts from chain (BR-36).
 * @returns {object|null} null when the chain has no record of it
 */
export function rebuildFromChain(position, byAddr) {
  const idx = byAddr.get((position.option_address ?? '').toLowerCase());
  if (!idx) return null;

  return {
    optionAddress: addrOf(idx),
    side: idx.side ?? null,
    buyer: (idx.buyer ?? '').toLowerCase() || null,
    seller: (idx.seller ?? '').toLowerCase() || null,
    numContractsRaw: idx.amount?.toString() ?? null,
    strikeRaw: idx.option?.strikes?.[0]?.toString() ?? null,
    expiryUnix: idx.option?.expiry ?? null,
    entryTxHash: idx.entryTxHash ?? null,
    entryPriceRaw: idx.entryPrice?.toString() ?? null,
    status: idx.status ?? null,
  };
}

/**
 * BR-31 and BR-1, from chain rather than from memory.
 *
 * `user_id` is the one fact with no external source of truth, so the least we
 * can do is confirm the chain agrees the option is ours and that we are on the
 * buying side of it.
 */
export function assertBuyerIsUs(chain, wallet) {
  const sideOk = chain?.side === 'buyer';
  const buyerOk = chain?.buyer === wallet.toLowerCase();
  return {
    pass: sideOk && buyerOk,
    sideOk,
    buyerOk,
    detail: `side=${chain?.side ?? 'unknown'}, buyer=${chain?.buyer ?? 'unknown'}`,
  };
}

/**
 * Every field where our row and the chain disagree.
 * @returns {Array<{field: string, db: string, chain: string}>}
 */
export function diffPosition(position, chain) {
  const out = [];
  const cmp = (field, dbVal, chainVal) => {
    if (chainVal == null) return;
    if (String(dbVal) !== String(chainVal)) {
      out.push({ field, db: String(dbVal), chain: String(chainVal) });
    }
  };

  cmp('num_contracts_raw', position.num_contracts_raw, chain.numContractsRaw);
  cmp('strike_raw', position.strike_raw, chain.strikeRaw);
  if (chain.expiryUnix != null) {
    cmp('expiry', Math.floor(new Date(position.expiry).getTime() / 1000), chain.expiryUnix);
  }
  if (chain.entryTxHash) {
    cmp('tx_hash', stripHex(position.tx_hash), stripHex(chain.entryTxHash));
  }
  return out;
}

/**
 * Positions the chain says we own that our database has never heard of.
 *
 * Reported, NEVER auto-assigned. Chain data is a rebuildable cache; the mapping
 * from a position to a user is not (BR-31, BR-35). Guessing an owner is the one
 * error with no external source of truth to correct it from, so a human decides.
 */
export function findOrphans(positions, chainList) {
  const known = new Set(
    positions.map((p) => (p.option_address ?? '').toLowerCase()).filter(Boolean),
  );
  return chainList.filter((o) => addrOf(o) && !known.has(addrOf(o)));
}

/**
 * Does an orphan plausibly correspond to this unresolved row?
 *
 * Matched on the three facts a fill cannot change: strike, expiry, and size
 * within the same scale band the fill path uses. Deliberately strict - adopting
 * the wrong option would attach a real position to the wrong user.
 */
export function orphanMatches(position, orphan) {
  const strikeOk = String(orphan.option?.strikes?.[0] ?? '') === String(position.strike_raw);
  const expiryOk = Number(orphan.option?.expiry ?? 0) ===
    Math.floor(new Date(position.expiry).getTime() / 1000);

  const quoted = BigInt(position.num_contracts_raw || '0');
  let sizeOk = false;
  try {
    const actual = BigInt(orphan.amount?.toString() ?? '0');
    sizeOk = quoted > 0n && actual * 2n >= quoted && actual <= quoted * 2n;
  } catch { sizeOk = false; }

  return { pass: strikeOk && expiryOk && sizeOk, strikeOk, expiryOk, sizeOk };
}

/**
 * Resolve positions stuck at `pending_verification`.
 *
 * ---------------------------------------------------------------------------
 * This is the hazard 3.10 exists to clear.
 * ---------------------------------------------------------------------------
 *
 * Pre-flight check 0 hard-blocks EVERY fill while any position sits unresolved,
 * and until now only hand-written SQL could clear one. A single timeout during
 * a rehearsal wedges the fill path.
 *
 * `pending_verification` means we do not know, not that it failed. So each row
 * is decided from evidence, never from a guess:
 *
 *   has a tx hash, receipt status 1  -> active   (the fill landed)
 *   has a tx hash, receipt status 0  -> failed   (it reverted; nothing bought)
 *   has a tx hash, no receipt yet    -> leave it (still genuinely unknown)
 *   no tx hash, an orphan matches    -> active, adopting the chain's hash
 *   no tx hash, nothing matches, past the grace period -> failed
 *
 * @param {object} [opts]
 * @param {string} opts.wallet
 * @param {boolean} [opts.apply] - false reports without writing
 * @returns {Promise<object[]>} one result per unresolved position
 */
export async function resolveUnverified({ wallet, apply = false } = {}) {
  const unresolved = await listUnresolvedPositions();
  if (unresolved.length === 0) return [];

  const chain = await loadChainPositions(wallet);
  const { data: allPositions } = await db.from('positions').select('id, option_address');
  const orphans = chain.ok ? findOrphans(allPositions ?? [], chain.list) : [];

  const results = [];

  for (const p of unresolved) {
    const result = { positionId: p.id, action: 'wait', reason: null, applied: false };
    const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3_600_000;

    if (p.tx_hash) {
      let receipt = null;
      try {
        receipt = await client.provider.getTransactionReceipt(p.tx_hash);
      } catch (e) {
        result.reason = `could not read receipt: ${e.message}`;
        results.push(result);
        continue;
      }

      if (!receipt) {
        result.reason = ageHours < graceHours()
          ? `no receipt yet, ${ageHours.toFixed(1)}h old (grace ${graceHours()}h)`
          : `no receipt after ${ageHours.toFixed(1)}h - the transaction was never mined`;
        result.action = ageHours < graceHours() ? 'wait' : 'failed';
      } else if (receipt.status === 1) {
        result.action = 'active';
        result.reason = `receipt confirmed in block ${receipt.blockNumber}`;
      } else {
        result.action = 'failed';
        result.reason = `receipt status 0 - reverted in block ${receipt.blockNumber}`;
      }
    } else {
      const match = orphans.map((o) => ({ o, m: orphanMatches(p, o) })).find((x) => x.m.pass);

      if (match) {
        result.action = 'active';
        result.reason = `adopted orphan ${addrOf(match.o)} (strike, expiry and size all agree)`;
        result.orphan = match.o;
      } else if (ageHours >= graceHours()) {
        result.action = 'failed';
        result.reason = `no transaction hash and no matching position on chain after ${ageHours.toFixed(1)}h`;
      } else {
        result.reason = `no hash yet, ${ageHours.toFixed(1)}h old (grace ${graceHours()}h)`;
      }
    }

    if (apply && (result.action === 'active' || result.action === 'failed')) {
      await transitionPosition(p.id, {
        toStatus: result.action,
        eventType: result.action === 'active' ? 'confirmed' : 'failed',
        txHash: result.orphan?.entryTxHash ?? null,
        optionAddress: result.orphan ? addrOf(result.orphan) : null,
        payload: { resolvedBy: 'reconcile', reason: result.reason },
      });
      result.applied = true;
    }

    results.push(result);
  }

  return results;
}

/** One position, refreshed. Convenience for callers acting on a result. */
export const reloadPosition = getPosition;
