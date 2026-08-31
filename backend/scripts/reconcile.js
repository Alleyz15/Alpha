// Reconcile the database against chain state (IMPLEMENT.md 3.10, BR-36).
//
//   node --env-file-if-exists=../.env scripts/reconcile.js
//
// ---------------------------------------------------------------------------
// Read-only. Rebuilds every position fact from chain and diffs it against the
// database. Sends no transaction, and needs no private key: set
// THETANUTS_WALLET_ADDRESS (the burner's public address) to run it as a pure
// audit. If that is unset it falls back to deriving the address from the key.
// ---------------------------------------------------------------------------
//
// Primary source is the Thetanuts INDEXER (client.api.getUserPositionsFromIndexer),
// which is an HTTP read and does not depend on the RPC endpoint. It returns
// buyer, side, size, strike, expiry and the entry tx per position - enough to
// verify the custody mapping. The direct contract read (getFullOptionInfo) is
// used only as an OPTIONAL settled-state check and degrades gracefully when the
// RPC is unavailable, so a dead RPC key does not blind the audit.
//
// Two questions it answers:
//
//   1. For every position we recorded, does the chain agree? buyer is our
//      wallet, we are on the buy side (BR-1), size/strike/expiry/tx match.
//
//   2. Does the chain hold any position for our wallet that our database does
//      NOT know about? Under a custodial model one wallet owns everything on
//      chain, and only positions.user_id records whose protection is whose. A
//      position on chain with no local row is the one failure that cannot be
//      reconstructed from any external source (BR-31, BR-35) - flagged loudly.
//
// Exit code is non-zero on any mismatch, so this doubles as a test (BR-36).

import { ethers } from 'ethers';
import { client } from '../src/thetanuts/client.js';
import { db } from '../src/db/client.js';
import { getWalletAddress } from '../src/thetanuts/signer.js';

// The wallet whose positions we reconcile. Prefer THETANUTS_WALLET_ADDRESS so
// this audit runs read-only without the private key; otherwise derive it from
// the key. The address is public - nothing is signed either way.
function resolveWallet() {
  const fromEnv = process.env.THETANUTS_WALLET_ADDRESS?.trim();
  if (fromEnv) {
    try {
      return ethers.getAddress(fromEnv).toLowerCase();  // validate + normalise
    } catch {
      throw new Error(`THETANUTS_WALLET_ADDRESS is not a valid address: ${fromEnv}`);
    }
  }
  return getWalletAddress();  // needs THETANUTS_PRIVATE_KEY
}

const wallet = resolveWallet();

/** The option address on an indexer entry, however the field is named. */
const addrOf = (o) =>
  (o.optionAddress ?? o.option?.address ?? o.address ?? o.option_address ?? '').toLowerCase();

/** Compare tx hashes regardless of 0x prefix / case (the indexer omits 0x). */
const stripHex = (h) => (h ?? '').toString().toLowerCase().replace(/^0x/, '');

const line = (label, pass, note = '') =>
  console.log(`    ${pass ? 'ok  ' : 'MISMATCH'}  ${label.padEnd(18)}${note}`);

let mismatches = 0;
let skipped = 0;
const seenOptionAddrs = new Set();

// ---------------------------------------------------------------------------
// Load both sides once: our recorded positions, and the indexer's view.
// ---------------------------------------------------------------------------

const { data: positions, error } = await db
  .from('positions')
  .select('*')
  .not('option_address', 'is', null)
  .order('created_at', { ascending: true });

if (error) throw new Error(`reconcile: reading positions: ${error.message}`);

const indexerByAddr = new Map();
let indexerList = [];
let indexerOk = false;
try {
  const raw = await client.api.getUserPositionsFromIndexer(wallet);
  indexerList = Array.isArray(raw) ? raw : (raw?.positions ?? []);
  for (const o of indexerList) {
    const a = addrOf(o);
    if (a) indexerByAddr.set(a, o);
  }
  indexerOk = true;
} catch (e) {
  console.log(`\n  WARNING: indexer unavailable (${e.message}) — cannot verify.`);
}

console.log(`\n--- wallet ${wallet} ---`);
console.log(`--- ${positions.length} recorded position(s) vs ${indexerList.length} on chain ---`);

// ---------------------------------------------------------------------------
// 1. Every recorded position, checked against the indexer (+ optional chain read)
// ---------------------------------------------------------------------------

for (const p of positions) {
  const addr = p.option_address.toLowerCase();
  seenOptionAddrs.add(addr);

  console.log(`\n  ${p.id}  (${p.status})  option ${addr}`);

  const idx = indexerByAddr.get(addr);
  if (!idx) {
    mismatches++;
    line('on chain', false, indexerOk
      ? 'not found in the indexer for this wallet'
      : 'indexer unavailable — could not verify');
  } else {
    // BR-1: we must be the buyer.
    const sideOk = idx.side === 'buyer';
    if (!sideOk) mismatches++;
    line('buy side (BR-1)', sideOk, `side=${idx.side}`);

    // BR-31: the option's buyer is our wallet.
    const buyerOk = (idx.buyer ?? '').toLowerCase() === wallet;
    if (!buyerOk) mismatches++;
    line('buyer is us', buyerOk, `chain ${(idx.buyer ?? 'null').toLowerCase()}`);

    // Size, at the same 6dp scale the row stores (BR-36).
    const sizeOk = String(idx.amount) === p.num_contracts_raw;
    if (!sizeOk) mismatches++;
    line('contracts', sizeOk, `chain ${idx.amount} vs db ${p.num_contracts_raw}`);

    // Strike, 8dp string.
    const chainStrike = idx.option?.strikes?.[0] ?? idx.option?.strikePrice ?? null;
    const strikeOk = String(chainStrike) === p.strike_raw;
    if (!strikeOk) mismatches++;
    line('strike', strikeOk, `chain ${chainStrike} vs db ${p.strike_raw}`);

    // Expiry: indexer is unix seconds, the row is a timestamptz.
    const chainExpiryUnix = Number(idx.option?.expiry ?? 0);
    const dbExpiryUnix = Math.floor(new Date(p.expiry).getTime() / 1000);
    const expiryOk = chainExpiryUnix > 0 && chainExpiryUnix === dbExpiryUnix;
    if (!expiryOk) mismatches++;
    line('expiry', expiryOk, `chain ${chainExpiryUnix || 'null'} vs db ${dbExpiryUnix}`);

    // Entry tx, only when we have recorded one (the indexer drops the 0x prefix).
    if (p.tx_hash) {
      const txOk = stripHex(idx.entryTxHash) === stripHex(p.tx_hash);
      if (!txOk) mismatches++;
      line('entry tx', txOk, `chain ${stripHex(idx.entryTxHash).slice(0, 12)}… vs db ${stripHex(p.tx_hash).slice(0, 12)}…`);
    }

    // Settled-state consistency via the indexer status - no RPC needed. A live
    // position shows 'active'; a terminal DB row (settled/expired_worthless)
    // must line up with a non-active chain position, and vice-versa. This is the
    // authoritative settled-state check; the on-chain read below only confirms
    // it when the RPC is reachable.
    if (typeof idx.status === 'string') {
      const dbTerminal = ['settled', 'expired_worthless'].includes(p.status);
      const idxActive = idx.status === 'active';
      const stateOk = dbTerminal !== idxActive;   // consistent iff exactly one is "done"
      if (!stateOk) mismatches++;
      line('settled state', stateOk, `db ${p.status}, indexer ${idx.status}`);
    } else {
      skipped++;
      console.log('    skip      settled state       indexer reported no status');
    }
  }

  // Optional on-chain confirmation of the settled state. The indexer check above
  // is authoritative; this adds a second source when the RPC is reachable, and
  // is reported as SKIPPED (never as passed) when it is not - a skipped check
  // must not read as a clean one, which was the whole bug here.
  try {
    const full = await client.option.getFullOptionInfo(p.option_address);
    const chainSettled = Boolean(full.isSettled);
    const dbTerminal = ['settled', 'expired_worthless'].includes(p.status);
    const confirmOk = chainSettled === dbTerminal;
    if (!confirmOk) mismatches++;
    line('settled (on-chain)', confirmOk, `chain settled=${chainSettled}, db terminal=${dbTerminal}`);
  } catch (e) {
    skipped++;
    console.log(`    skip      settled (on-chain)  RPC read unavailable (${e.message.slice(0, 40)})`);
  }
}

// ---------------------------------------------------------------------------
// 2. Orphans: positions on chain for our wallet that the database is missing
// ---------------------------------------------------------------------------

console.log('\n--- orphan check: chain positions not in our database ---\n');

if (!indexerOk) {
  console.log('  skipped — indexer unavailable.');
} else {
  const orphans = indexerList.filter((o) => {
    const a = addrOf(o);
    return a && !seenOptionAddrs.has(a);
  });

  if (indexerList.length === 0) {
    console.log('  indexer returned no positions for this wallet.');
  } else if (orphans.length === 0) {
    console.log(`  ok — all ${indexerList.length} indexer position(s) are recorded in the database.`);
  } else {
    mismatches += orphans.length;
    console.log(`  ${orphans.length} ORPHAN(S) — on chain but not in our database:`);
    for (const o of orphans) {
      console.log(`    ${addrOf(o)}  side=${o.side} buyer=${(o.buyer ?? '').toLowerCase()} amount=${o.amount}`);
    }
    console.log('\n  This is the unrecoverable case (BR-31): the chain owns it, but no');
    console.log('  local row records which user it belongs to. Investigate before the demo.');
  }
}

// ---------------------------------------------------------------------------

console.log('');
if (mismatches > 0) {
  console.log(`${mismatches} mismatch(es) found${skipped ? `; ${skipped} check(s) skipped` : ''}. ` +
    'Investigate before trusting the dashboard.\n');
  process.exit(1);
} else if (skipped > 0) {
  // No mismatch, but not everything was verified - say so rather than "clean".
  console.log(`Reconciled clean against the indexer — ${skipped} on-chain cross-check(s) skipped ` +
    '(RPC unavailable). Settled-state was verified via the indexer, not confirmed on chain.\n');
  process.exit(0);
} else {
  console.log('Reconciled clean — database agrees with the chain (indexer + on-chain).\n');
  process.exit(0);
}
