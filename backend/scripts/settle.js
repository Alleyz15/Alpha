// Settlement sweep (IMPLEMENT.md Phase 4).
//
//   node --env-file-if-exists=../.env scripts/settle.js            report only
//   node --env-file-if-exists=../.env scripts/settle.js --confirm  apply
//   node --env-file-if-exists=../.env scripts/settle.js --loop     run as a daemon
//
// ---------------------------------------------------------------------------
// Sends no transactions and needs no wallet. Settlement is automatic: the
// protocol pays the buyer, and this only records what already happened.
// ---------------------------------------------------------------------------
//
// OUR FIRST POSITION EXPIRES 2026-09-02 08:00 UTC = 16:00 Malaysia time,
// Tuesday afternoon. If the loop is not running as a daemon by then, someone
// runs this by hand that afternoon. "2 Sep" gets remembered as "sometime
// Tuesday"; 16:00 MYT does not.

import { listPositionsByUser, listPositionEvents } from '../src/db/positions.js';
import { getDemoUser } from '../src/api/demoUser.js';
import { runSettlementSweep, startScheduler } from '../src/scheduler/index.js';

const apply = process.argv.includes('--confirm');
const loop = process.argv.includes('--loop');

if (loop) {
  console.log('\nsettlement loop starting — reads only, sends nothing');
  console.log(`interval: ${process.env.SCHEDULER_INTERVAL_MINUTES ?? 60} minutes\n`);
  await startScheduler({ apply: true });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => { console.log(`\n${sig} — stopping`); process.exit(0); });
  }
} else {
  const result = await runSettlementSweep({ apply });

  console.log(`\n--- settlement sweep ${apply ? '(APPLYING)' : '(report only)'} ---\n`);
  console.log(`  positions due: ${result.checked}`);

  if (result.checked === 0) {
    console.log('  nothing is past its expiry yet.');
  }

  for (const r of result.results) {
    console.log(`\n  ${r.positionId}`);
    console.log(`    action  ${r.action}${r.applied ? ' (applied)' : ''}`);
    if (r.reason) console.log(`    reason  ${r.reason}`);
    if (r.state) {
      console.log(`    chain   expired=${r.state.expired} settled=${r.state.settled}` +
        (r.state.hoursPastExpiry > 0 ? ` (${r.state.hoursPastExpiry.toFixed(1)}h past expiry)` : ''));
      if (r.state.settlementPrice !== null && r.state.settlementPrice !== undefined) {
        console.log(`    price   $${r.state.settlementPrice} (via ${r.state.priceSource})`);
      }
      if (r.state.payoutUsdc !== null && r.state.payoutUsdc !== undefined) {
        console.log(`    payout  ${r.state.payoutUsdc} USDC`);
      }
      if (r.state.buyer) {
        console.log(`    buyer   ${r.state.buyer}  contracts match: ${r.state.contractsMatch}`);
      }
    }
  }

  console.log(`\n  settled ${result.settled} | expired worthless ${result.expiredWorthless} | ` +
    `needs review ${result.needsReview} | waiting ${result.waiting} | errors ${result.errors}`);

  if (!apply && result.checked > 0) {
    console.log('\n  report only — re-run with --confirm to write these to the database.');
  }
}

// --- current position state, so a hand-run shows the whole picture ----------

const user = await getDemoUser();
const positions = await listPositionsByUser(user.id);

console.log(`\n--- ${user.display_name}'s positions ---\n`);
for (const p of positions) {
  const hrs = (new Date(p.expiry).getTime() - Date.now()) / 3_600_000;
  console.log(`  ${p.id}`);
  // A put strike is a floor; a call strike is the threshold above which the
  // holder shares the gain. Printing "floor" for a call is how the dashboard
  // came to show a protection floor above spot.
  const strikeLabel = p.option_type === 'call' ? 'call strike' : 'floor';
  console.log(`    ${p.status.padEnd(20)} $${p.strike} ${strikeLabel} | expires ${p.expiry.slice(0, 16).replace('T', ' ')} UTC ` +
    `(${hrs > 0 ? 'in ' + hrs.toFixed(1) + 'h' : Math.abs(hrs).toFixed(1) + 'h ago'})`);
  if (p.option_address) console.log(`    option ${p.option_address}`);
  if (p.payout !== null) console.log(`    payout ${p.payout} USDC at $${p.settlement_price}`);
  const events = await listPositionEvents(p.id);
  console.log(`    ${events.length} events: ${events.map((e) => e.event_type).join(' -> ')}`);
}
console.log();
