// What the book offers right now, per asset.
//
//   node --env-file-if-exists=../.env scripts/market.js
//
// ---------------------------------------------------------------------------
// READS ONLY. No wallet, no database writes, nothing broadcast.
// ---------------------------------------------------------------------------
//
// This is the pre-pitch check. The numbers it prints change every day: expiries
// roll, so what is a two-day tenor today is a one-day tenor tomorrow and may be
// nothing at all by the weekend.
//
// Run it before presenting and read the tenor off THIS output, not off any
// figure written down earlier. A presenter who says "two-day protection" when
// the screen says one day has contradicted themselves in front of a judge, and
// the screen is right.

import { buildMarketContext } from '../src/api/marketContext.js';
import { getDemoUser } from '../src/api/demoUser.js';
import { listBalances } from '../src/db/index.js';

const user = await getDemoUser();
const balances = await listBalances(user.id);
const holdings = Object.fromEntries(
  balances.filter((b) => b.asset !== 'USDC').map((b) => [b.asset, Number(b.amount)]),
);

const context = await buildMarketContext({ holdings });

console.log(`\n--- what the book offers, ${new Date().toISOString()} ---\n`);
console.log('  asset  price          held        protection   longest    floors');
console.log('  ' + '-'.repeat(68));

for (const a of context.assets) {
  const price = a.spotUsdc === null ? 'unavailable' : `$${a.spotUsdc.toLocaleString('en-US')}`;
  const tenor = a.protectionAvailable
    ? (a.longestProtectionDays === 0 ? 'today only' : `${a.longestProtectionDays} day(s)`)
    : '—';

  console.log(
    '  ' + a.symbol.padEnd(7) + price.padEnd(15) + String(a.holdingUnits).padEnd(12) +
    (a.protectionAvailable ? 'available' : 'NONE').padEnd(13) +
    tenor.padEnd(11) + String(a.strikesBelowSpot),
  );

  if (a.unavailableReason) console.log(`           ${a.unavailableReason}`);
}

const available = context.assets.filter((a) => a.protectionAvailable);
const longest = available.length
  ? Math.max(...available.map((a) => a.longestProtectionDays))
  : null;

console.log('\n--- what to say on stage ---\n');

if (available.length === 0) {
  console.log('  NOTHING is purchasable right now. Do not claim protection is available.');
  console.log('  Show the positions already held instead — they are real and on chain.');
} else {
  console.log(`  ${available.length} of ${context.assets.length} assets can be protected right now.`);
  console.log(`  The longest tenor anywhere on the book today is ${longest} day(s).`);
  console.log('');
  console.log('  Say "the longest the book offers today", not a fixed number of days.');
  console.log('  Read the figure off the screen during the demo — it is computed per');
  console.log('  request and it moves.');
}

if (available.some((a) => a.longestProtectionDays === 0)) {
  console.log('');
  console.log('  NOTE: an asset shows "today only". That is a real state, not a fault —');
  console.log('  the book carries no expiry beyond today for it.');
}

console.log('');
