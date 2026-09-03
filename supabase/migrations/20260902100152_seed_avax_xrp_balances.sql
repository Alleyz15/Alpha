-- AVAX and XRP holdings (2 Sep 2026).
--
-- ---------------------------------------------------------------------------
-- RECONSTRUCTED FROM THE APPLIED DATABASE, 3 Sep 2026.
-- ---------------------------------------------------------------------------
--
-- This migration was applied without a file being committed, so the directory
-- and the database drifted apart again - the same gap that was reconciled once
-- before. The rows below are read back from `balances`, where all four carry
-- `created_at = 2026-09-02T10:01:52.896242Z`, matching this file's version
-- exactly. The content is therefore recovered rather than guessed.
--
-- `on conflict do nothing` makes re-running it a no-op against the live
-- database, so restoring the file cannot change anything that already exists.
--
-- Why the assets were added: they had been excluded because they scored 2/6 and
-- 0/6 when contract sizes were computed and sent unverified. findFillableSize
-- now confirms every size against the chain before quoting it and refuses the
-- tier when none passes, so the reason no longer held. Measured through the
-- real quote path on 2 Sep: AVAX offered 2 tiers, XRP offered 3.
--
-- Holdings are round numbers rather than price-matched, for the same reason as
-- the four before them: a seeded balance is a fixed quantity of the asset, and
-- pinning it to a day's price would make it wrong the next day.

insert into public.balances (user_id, asset, amount, source)
values
  ('11111111-1111-4111-8111-111111111111', 'AVAX', 40,  'demo_seed'),
  ('11111111-1111-4111-8111-111111111111', 'XRP',  300, 'demo_seed'),
  ('22222222-2222-4222-8222-222222222222', 'AVAX', 15,  'demo_seed'),
  ('22222222-2222-4222-8222-222222222222', 'XRP',  100, 'demo_seed')
on conflict (user_id, asset) do nothing;
