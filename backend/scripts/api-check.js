// API check (IMPLEMENT.md 5.1).
//
//   npm run api:check
//
// Starts the server on an ephemeral port, exercises every endpoint and every
// error path, and asserts the response shape matches what the interface
// destructures. Cleans up the rows it creates.
//
// Nothing here sends a transaction.

import { startApi, stopApi } from '../src/api/server.js';
import { getDemoUser } from '../src/api/demoUser.js';
import { db } from '../src/db/client.js';

const server = await startApi(0);
const base = `http://localhost:${server.address().port}`;

let failures = 0;
const check = (label, pass, note = '') => {
  if (!pass) failures++;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${label.padEnd(56)}${note}`);
};

const call = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
};

const created = { positions: [], quotes: [] };

try {
  // --- CORS (5.2) -----------------------------------------------------------

  console.log('\n--- CORS ---');
  const pre = await fetch(`${base}/api/quote`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' },
  });
  check('preflight returns 204', pre.status === 204);
  check('allows the Vite origin explicitly',
    pre.headers.get('access-control-allow-origin') === 'http://localhost:5173',
    pre.headers.get('access-control-allow-origin') ?? 'none');

  const foreign = await fetch(`${base}/health`, { headers: { Origin: 'http://evil.example' } });
  check('does not echo an unknown origin',
    foreign.headers.get('access-control-allow-origin') === null,
    foreign.headers.get('access-control-allow-origin') ?? 'none');

  // --- GET /api/demo-context ------------------------------------------------

  console.log('\n--- GET /api/demo-context ---');
  const ctx = await call('GET', '/api/demo-context');
  check('200', ctx.status === 200);
  check('has displayName', typeof ctx.body?.displayName === 'string', ctx.body?.displayName);
  check('balances are { asset, amount }',
    Array.isArray(ctx.body?.balances) && ctx.body.balances.every(
      (b) => typeof b.asset === 'string' && typeof b.amount === 'number'),
    JSON.stringify(ctx.body?.balances));
  check('simulated is true (BR-51)', ctx.body?.simulated === true);

  const holding = ctx.body.balances.find((b) => b.asset === 'ETH')?.amount ?? 0;
  // Deliberately not 0.4. Phase 3 fills at a fraction of a holding, and the
  // demo balance may change - derive the size from what is actually held.
  const units = Math.min(0.05, holding);

  // --- POST /api/quote ------------------------------------------------------

  console.log('\n--- POST /api/quote ---');
  const quote = await call('POST', '/api/quote', {
    asset: 'ETH', units, mode: 'percentage', protectionPct: 20,
  });
  check('200', quote.status === 200, quote.status === 200 ? '' : JSON.stringify(quote.body));

  const q = quote.body;
  check('has quoteId and expiresAt', Boolean(q?.quoteId && q?.expiresAt));
  check('returns up to three tiers', q?.tiers?.length >= 1 && q.tiers.length <= 3, `${q?.tiers?.length} tiers`);
  check('every tier has a tierId', q.tiers.every((t) => typeof t.tierId === 'string'));
  check('exactly one tier is recommended (BR-41)',
    q.tiers.filter((t) => t.recommended).length === 1);

  // The fields toQuoteViewModel destructures. If any is missing the interface
  // throws rather than degrading, so assert them explicitly.
  const shapeOk = q.tiers.every((t) =>
    typeof t.actual?.tier === 'string' &&
    typeof t.actual?.floorUsdc === 'number' &&
    typeof t.actual?.protectionPct === 'number' &&
    typeof t.actual?.expiry === 'string' &&
    typeof t.size?.protectedUnits === 'number' &&
    typeof t.cost?.premiumUsdc === 'number' &&
    typeof t.maxLoss?.forConfirmation === 'number' &&
    typeof t.disclosure?.sizeReduced === 'boolean' &&
    typeof t.disclosure?.unprotectedUnits === 'number' &&
    typeof t.disclosure?.unprotectedValueUsdc === 'number' &&
    typeof t.payout?.floorValueUsdc === 'number' &&
    typeof t.settlement?.paysIn === 'string');
  check('tier shape matches toQuoteViewModel', shapeOk);
  check('tier labels are highest/middle/lowest',
    q.tiers.every((t) => ['highest', 'middle', 'lowest'].includes(t.actual.tier)),
    q.tiers.map((t) => t.actual.tier).join(', '));
  check('no signed order leaks into the payload', q.tiers.every((t) => !('order' in t)));

  const goal = await call('POST', '/api/quote', {
    asset: 'ETH', units, mode: 'goal', targetValueUsdc: 80, targetDate: '2026-09-20',
  });
  check('goal mode works (1.7)', goal.status === 200,
    goal.status === 200 ? `requestedStrike ${goal.body.requested.requestedStrikeUsdc}` : JSON.stringify(goal.body));

  // --- error envelope -------------------------------------------------------

  console.log('\n--- errors ---');
  const cases = [
    ['BALANCE_EXCEEDED 400', 400, 'BALANCE_EXCEEDED',
      ['POST', '/api/quote', { asset: 'ETH', units: 9999, mode: 'percentage', protectionPct: 20 }]],
    ['NO_EXPIRY 404', 404, 'NO_EXPIRY',
      ['POST', '/api/quote', { asset: 'ETH', units, mode: 'goal', targetValueUsdc: 80, targetDate: '2027-01-01' }]],
    ['INVALID_REQUEST 400 (bad mode)', 400, 'INVALID_REQUEST',
      ['POST', '/api/quote', { asset: 'ETH', units, mode: 'sideways' }]],
    ['INVALID_REQUEST 400 (no units)', 400, 'INVALID_REQUEST',
      ['POST', '/api/quote', { asset: 'ETH', mode: 'percentage', protectionPct: 20 }]],
    ['QUOTE_EXPIRED 409 (unknown quote)', 409, 'QUOTE_EXPIRED',
      ['POST', '/api/purchase', { quoteId: '00000000-0000-4000-8000-000000000000', tierId: 'x' }]],
  ];

  for (const [label, status, code, [method, path, body]] of cases) {
    const res = await call(method, path, body);
    check(label, res.status === status && res.body?.error?.code === code,
      `${res.status} ${res.body?.error?.code}`);
  }

  const noExpiry = await call('POST', '/api/quote',
    { asset: 'ETH', units, mode: 'goal', targetValueUsdc: 80, targetDate: '2027-01-01' });
  check('NO_EXPIRY carries longestAvailableDate',
    typeof noExpiry.body?.error?.details?.longestAvailableDate === 'string',
    noExpiry.body?.error?.details?.longestAvailableDate ?? 'missing');

  const notFound = await call('GET', '/api/nope');
  check('unknown route 404', notFound.status === 404 && notFound.body?.error?.code === 'INVALID_REQUEST');

  // --- POST /api/purchase ---------------------------------------------------

  console.log('\n--- POST /api/purchase ---');
  const tier = q.tiers.find((t) => t.recommended);

  // BR-40: the client sends identifiers only. Inject contradictory amounts and
  // confirm none of them reach the stored row.
  const bought = await call('POST', '/api/purchase', {
    quoteId: q.quoteId,
    tierId: tier.tierId,
    premiumUsdc: 0.01,
    strike: 999999,
    units: 1000,
    contractsRaw: '999999999',
  });

  check('200', bought.status === 200, bought.status === 200 ? '' : JSON.stringify(bought.body));
  check('returns positionId', typeof bought.body?.positionId === 'string');
  check('txHash is null, not a synthesised hash', bought.body?.txHash === null);
  check('explorerUrl is null', bought.body?.explorerUrl === null);
  check('status is pending_fill', bought.body?.status === 'pending_fill', bought.body?.status);
  check('simulated is true (BR-51)', bought.body?.simulated === true);

  const positionId = bought.body.positionId;
  created.positions.push(positionId);

  const { data: row } = await db.from('positions').select('*').eq('id', positionId).single();
  created.quotes.push(row.quote_id);
  const { data: quoteRow } = await db.from('quotes').select('*').eq('id', row.quote_id).single();

  check('stored strike came from the server, not the client',
    Number(row.strike) === tier.actual.floorUsdc, `${row.strike} vs ${tier.actual.floorUsdc}`);
  check('stored contracts came from the server',
    row.num_contracts_raw === tier.size.contractsRaw, `${row.num_contracts_raw}`);
  check('stored premium came from the server',
    Number(quoteRow.premium) === tier.cost.premiumUsdc, `${quoteRow.premium}`);
  check('position is pending, nothing broadcast (BR-14)', row.status === 'pending', row.status);
  check('tx_hash is null in the database', row.tx_hash === null);
  check('quote row records the set and tier',
    quoteRow.quote_set_id === q.quoteId && quoteRow.tier_label === tier.actual.tier,
    `${quoteRow.tier_label}`);
  check('order snapshot stored', quoteRow.order_snapshot && Object.keys(quoteRow.order_snapshot).length > 0);

  const twice = await call('POST', '/api/purchase', { quoteId: q.quoteId, tierId: tier.tierId });
  check('second purchase of the same quote is refused',
    twice.status === 409 && twice.body?.error?.code === 'QUOTE_EXPIRED',
    `${twice.status} ${twice.body?.error?.code}`);

  // --- GET /api/positions ---------------------------------------------------

  console.log('\n--- GET /api/positions ---');
  const positions = await call('GET', '/api/positions');
  check('200', positions.status === 200);

  const p = positions.body.positions.find((x) => x.positionId === positionId);
  check('the new position is listed', Boolean(p));
  check('shape matches toPositionViewModel',
    typeof p?.asset === 'string' &&
    typeof p?.protectedAmount === 'number' &&
    typeof p?.protectionFloorUsdc === 'number' &&
    typeof p?.premiumPaidUsdc === 'number' &&
    typeof p?.expiry === 'string' &&
    typeof p?.status === 'string' &&
    (p?.payoutUsdc === null || typeof p?.payoutUsdc === 'number'));
  check('status renders via the interface status map',
    ['pending', 'pending_verification', 'active', 'failed', 'settled', 'expired_worthless', 'needs_review']
      .includes(p.status), p.status);
  check('explorerUrl is null until there is a transaction', p.explorerUrl === null);
} finally {
  for (const id of created.positions) {
    await db.from('position_events').delete().eq('position_id', id);
    await db.from('positions').delete().eq('id', id);
  }
  for (const id of created.quotes) {
    if (id) await db.from('quotes').delete().eq('id', id);
  }
  console.log('\n  test rows removed');
  await stopApi(server);
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
