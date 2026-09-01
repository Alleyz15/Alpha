// Database check (IMPLEMENT.md Phase 2).
//
//   node --env-file-if-exists=../.env scripts/db-check.js
//
// Verifies the schema, the seeds, RLS, and a full position lifecycle including
// the event trail. Writes test rows and deletes them again - it touches no
// chain state and spends nothing.
//
// Set SUPABASE_PUBLISHABLE_KEY to also verify that an anonymous client is
// locked out. Without it that check is skipped and says so.

import { db } from '../src/db/client.js';
import { discardTestRows } from '../src/db/testCleanup.js';
import { listUsers, listBalances } from '../src/db/index.js';
import {
  insertQuote,
  insertPendingPosition,
  transitionPosition,
  listPositionEvents,
  listPositionsByUser,
} from '../src/db/index.js';

const ok = (label, pass, note = '') =>
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label.padEnd(52)}${note}`);

let failures = 0;
const check = (label, pass, note) => {
  if (!pass) failures++;
  ok(label, pass, note);
};

// --- schema -----------------------------------------------------------------

console.log('\n--- tables ---');
for (const table of ['users', 'balances', 'quotes', 'positions', 'position_events']) {
  const { error } = await db.from(table).select('*', { count: 'exact', head: true });
  check(`${table} exists and is readable`, !error, error?.message ?? '');
}

// --- seeds (2.6, 2.7) -------------------------------------------------------

console.log('\n--- seeded demo data ---');
const users = await listUsers();
check('two demo users seeded', users.length === 2, `found ${users.length}`);

for (const user of users) {
  const balances = await listBalances(user.id);
  const eth = balances.find((b) => b.asset === 'ETH');
  check(
    `${user.display_name} holds ETH`,
    Boolean(eth),
    eth ? `${eth.amount} ETH, source=${eth.source}` : 'no ETH balance',
  );
  check(
    `${user.display_name} balance is marked simulated`,
    eth?.source === 'demo_seed',
    `source=${eth?.source}`,
  );
}

// Every balance row, not just the seeded pair - a real deposit must not be
// able to hide among them (BR-50, BR-51).
const { data: allBalances } = await db.from('balances').select('source');
check(
  'every balance row has source = demo_seed',
  allBalances.every((b) => b.source === 'demo_seed'),
  `${allBalances.length} rows`,
);

// --- RLS (2.4) --------------------------------------------------------------

console.log('\n--- row level security ---');
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!publishable) {
  console.log('  skip  SUPABASE_PUBLISHABLE_KEY not set — anon lockout not verified');
} else {
  const { createClient } = await import('@supabase/supabase-js');
  const anon = createClient(process.env.SUPABASE_URL, publishable);
  for (const table of ['users', 'balances', 'quotes', 'positions', 'position_events']) {
    const { data, error } = await anon.from(table).select('*').limit(1);
    check(`anon cannot read ${table}`, Boolean(error) || (data ?? []).length === 0, error?.code ?? '');
  }
  const { error: insErr } = await anon.from('users').insert({ display_name: 'intruder' });
  check('anon cannot insert', Boolean(insErr), insErr?.code ?? 'INSERT SUCCEEDED');
}

// --- lifecycle round trip ---------------------------------------------------

console.log('\n--- write path: quote -> position -> transitions ---');
const user = users[0];
let quoteId = null;
let positionId = null;

try {
  const quote = await insertQuote({
    userId: user.id,
    asset: 'ETH',
    inputMode: 'percentage',
    inputAmount: 0.4,
    inputProtectionPct: 20,
    spotPrice: 2500,
    requestedStrike: 2000,
    actualStrike: 2150,
    expiry: new Date(Date.now() + 25 * 86400000).toISOString(),
    premium: 6.3,
    numContractsRaw: '400000',
    orderSnapshot: { note: 'db-check synthetic row' },
    validUntil: new Date(Date.now() + 60000).toISOString(),
  });
  quoteId = quote.id;
  check('quote inserted', Boolean(quote.id));

  const position = await insertPendingPosition({
    userId: user.id,
    quoteId: quote.id,
    asset: 'ETH',
    strike: 2150,
    strikeRaw: '215000000000',
    expiry: quote.expiry,
    numContractsRaw: '400000',
  });
  positionId = position.id;
  check('position written before broadcast (BR-14)', position.status === 'pending');

  // DR-3: a second position from the same quote must be impossible.
  let duplicateBlocked = false;
  try {
    await insertPendingPosition({
      userId: user.id,
      quoteId: quote.id,
      asset: 'ETH',
      strike: 2150,
      strikeRaw: '215000000000',
      expiry: quote.expiry,
      numContractsRaw: '400000',
    });
  } catch (e) {
    duplicateBlocked = e.code === '23505';
  }
  check('second position from same quote rejected (DR-3)', duplicateBlocked, '23505 unique_violation');

  await transitionPosition(position.id, {
    toStatus: 'active',
    eventType: 'confirmed',
    txHash: '0xABCDEF0123456789',
    optionAddress: '0xFEDCBA9876543210',
    premiumPaid: 6.31,
    payload: { note: 'db-check' },
  });

  const afterActive = (await listPositionsByUser(user.id)).find((p) => p.id === position.id);
  check('transitioned to active', afterActive.status === 'active');
  check('tx hash stored lowercase', afterActive.tx_hash === '0xabcdef0123456789', afterActive.tx_hash);

  await transitionPosition(position.id, {
    toStatus: 'settled',
    eventType: 'settled',
    settlementPrice: 1900,
    payout: 100,
    settledAt: new Date().toISOString(),
  });

  const events = await listPositionEvents(position.id);
  check('every status change left an event', events.length === 3, `${events.length} events`);
  check(
    'event trail reads created -> confirmed -> settled',
    events.map((e) => e.event_type).join(' -> ') === 'created -> confirmed -> settled',
    events.map((e) => e.event_type).join(' -> '),
  );

  // BR-19: settled positions are immutable.
  let terminalBlocked = false;
  try {
    await transitionPosition(position.id, { toStatus: 'active', eventType: 'confirmed' });
  } catch {
    terminalBlocked = true;
  }
  check('settled position cannot be modified (BR-19)', terminalBlocked);
} finally {
  // Clean up, so the check can be run repeatedly and leaves no synthetic rows
  // in a database the demo reads from.
  if (positionId) {
    await db.from('position_events').delete().eq('position_id', positionId);
    await db.from('positions').delete().eq('id', positionId);
  }
  if (quoteId) await db.from('quotes').delete().eq('id', quoteId);
  console.log('\n  test rows removed');
}

console.log(failures === 0
  ? '\nAll checks passed.\n'
  : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
