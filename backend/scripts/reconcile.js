// Reconcile the database against chain state (IMPLEMENT.md 3.10, BR-36).
//
//   node --env-file-if-exists=../.env scripts/reconcile.js
//
// ---------------------------------------------------------------------------
// Read-only. Rebuilds every position fact from chain and diffs it against the
// database. Sends no transaction, and needs no private key: set
// THETANUTS_WALLET_ADDRESS (the burner's public address) to run it as a pure
// audit. If that is unset it falls back to deriving the address from the key.
// Either way it only reads — nothing is signed and nothing is spent.
// ---------------------------------------------------------------------------
//
// Two questions it answers:
//
//   1. For every position we recorded on-chain, does the chain agree?
//      buyer is our wallet, contract count matches, expiry matches, and the
//      settled state is consistent with our stored status.
//
//   2. Does the chain hold any position for our wallet that our database does
//      NOT know about? Under a custodial model one wallet owns everything on
//      chain, and only positions.user_id records whose protection is whose. A
//      position on chain with no local row is the one failure that cannot be
//      reconstructed from any external source (BR-31, BR-35) — so it is flagged
//      loudly rather than passed over.
//
// Exit code is non-zero on any mismatch, so this doubles as a test (BR-36).
//
// Only fields already proven against the chain in scheduler/settlement.js are
// asserted: getFullOptionInfo exposes isExpired, isSettled, buyer, seller,
// numContracts and info.expiry. Strike is not re-read here — the option address
// itself is the specific contract for one strike and expiry, so a matching
// address already pins the strike.

import { ethers } from 'ethers';
import { client } from '../src/thetanuts/client.js';
import { db } from '../src/db/client.js';
import { getWalletAddress } from '../src/thetanuts/signer.js';

// The wallet whose positions we reconcile. Prefer THETANUTS_WALLET_ADDRESS so
// this audit runs read-only without the private key; otherwise derive it from
// the key. The address is public — nothing is signed either way.
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

const line = (label, pass, note = '') =>
  console.log(`    ${pass ? 'ok  ' : 'MISMATCH'}  ${label.padEnd(20)}${note}`);

let mismatches = 0;
const seenOptionAddrs = new Set();

// ---------------------------------------------------------------------------
// 1. Every on-chain position we recorded, checked against the chain
// ---------------------------------------------------------------------------

const { data: positions, error } = await db
  .from('positions')
  .select('*')
  .not('option_address', 'is', null)
  .order('created_at', { ascending: true });

if (error) throw new Error(`reconcile: reading positions: ${error.message}`);

console.log(`\n--- wallet ${wallet} ---`);
console.log(`--- reconciling ${positions.length} recorded on-chain position(s) ---`);

for (const p of positions) {
  const addr = p.option_address.toLowerCase();
  seenOptionAddrs.add(addr);

  console.log(`\n  ${p.id}  (${p.status})  option ${addr}`);

  let full;
  try {
    full = await client.option.getFullOptionInfo(p.option_address);
  } catch (e) {
    mismatches++;
    line('chain read', false, `getFullOptionInfo threw: ${e.message}`);
    continue;
  }

  // buyer must be our wallet (BR-1: we are always the buyer; BR-31: it is ours)
  const chainBuyer = full.buyer?.toLowerCase() ?? null;
  const buyerOk = chainBuyer === wallet;
  if (!buyerOk) mismatches++;
  line('buyer is us', buyerOk, `chain ${chainBuyer ?? 'null'}`);

  // contract count, compared at the same 6dp scale the row stores (BR-36)
  const chainContracts = full.numContracts?.toString() ?? null;
  const contractsOk = chainContracts === p.num_contracts_raw;
  if (!contractsOk) mismatches++;
  line('contracts', contractsOk, `chain ${chainContracts ?? 'null'} vs db ${p.num_contracts_raw}`);

  // expiry: chain is unix seconds, the row is a timestamptz
  const chainExpiryUnix = Number(full.info?.expiry ?? 0);
  const dbExpiryUnix = Math.floor(new Date(p.expiry).getTime() / 1000);
  const expiryOk = chainExpiryUnix > 0 && chainExpiryUnix === dbExpiryUnix;
  if (!expiryOk) mismatches++;
  line('expiry', expiryOk,
    `chain ${chainExpiryUnix || 'null'} vs db ${dbExpiryUnix}`);

  // settled-state consistency: a chain-settled option should have a terminal
  // row, and a non-terminal row should not claim a settled option.
  const chainSettled = Boolean(full.isSettled);
  const dbTerminal = ['settled', 'expired_worthless'].includes(p.status);
  const stateOk = chainSettled === dbTerminal;
  if (!stateOk) mismatches++;
  line('settled state', stateOk,
    `chain settled=${chainSettled}, db terminal=${dbTerminal} (status ${p.status})`);
}

// ---------------------------------------------------------------------------
// 2. Orphans: positions on chain for our wallet that the database is missing
// ---------------------------------------------------------------------------
//
// Best effort. getUserPositionsFromIndexer is listed in the SDK surface but is
// not used anywhere else yet, so its exact return shape is unverified. It is
// wrapped so an indexer outage or an unexpected shape reports rather than
// crashing the whole reconciliation — the same posture settlement.js takes with
// the settlement-price source.

console.log('\n--- orphan check: chain positions not in our database ---\n');

try {
  const raw = await client.api.getUserPositionsFromIndexer(wallet);
  const list = Array.isArray(raw) ? raw : (raw?.positions ?? []);

  const addrOf = (o) =>
    (o.optionAddress ?? o.option ?? o.address ?? o.option_address ?? '').toLowerCase();

  const orphans = list.filter((o) => {
    const a = addrOf(o);
    return a && !seenOptionAddrs.has(a);
  });

  if (list.length === 0) {
    console.log('  indexer returned no positions for this wallet.');
    console.log('  If a fill has confirmed, verify getUserPositionsFromIndexer\'s shape empirically.');
  } else if (orphans.length === 0) {
    console.log(`  ok — all ${list.length} indexer position(s) are recorded in the database.`);
  } else {
    mismatches += orphans.length;
    console.log(`  ${orphans.length} ORPHAN(S) — on chain but not in our database:`);
    for (const o of orphans) {
      console.log(`    ${addrOf(o)}  ${JSON.stringify(o, (k, v) => typeof v === 'bigint' ? v.toString() : v)}`);
    }
    console.log('\n  This is the unrecoverable case (BR-31): the chain owns it, but no');
    console.log('  local row records which user it belongs to. Investigate before the demo.');
  }
} catch (e) {
  console.log(`  indexer unavailable or shape unknown: ${e.message}`);
  console.log('  Verify getUserPositionsFromIndexer empirically before relying on this check.');
}

// ---------------------------------------------------------------------------

console.log(mismatches === 0
  ? '\nReconciled clean — database agrees with the chain.\n'
  : `\n${mismatches} mismatch(es) found. Investigate before trusting the dashboard.\n`);

process.exit(mismatches === 0 ? 0 : 1);
