-- Four assets offered equally (1 Sep 2026).
--
-- Listing only ETH implied the product supports one coin, which is untrue - the
-- quote engine has never hardcoded an asset. Verified against the LIVE book
-- before seeding, at roughly $120-155 of notional each:
--
--   ETH   9 strikes below spot, deepest 5.90%, expiries to 2.7d, 1.095555 USDC
--   BTC   7 strikes below spot, deepest 4.98%, expiries to 2.7d, 0.947638 USDC
--   SOL  10 strikes below spot, deepest 9.83%, expiries to 1.7d, 0.906960 USDC
--   BNB  11 strikes below spot, deepest 9.71%, expiries to 1.7d, 1.213135 USDC
--
-- All four produce three tiers and every premium sits inside BR-15.
--
-- AVAX and XRP are deliberately absent: 2 of 6 and 0 of 6 in simulation.
--
-- SOL and BNB carry no expiry beyond ~1.7 days while ETH and BTC reach ~2.7, so
-- a two-day request refuses for them under BR-6 (never offer an earlier expiry
-- than asked). That is a property of the BOOK ON A GIVEN DAY, not of the asset,
-- and it is why /api/market-context computes the available tenor per request
-- rather than storing it here.
--
-- Holdings are round numbers rather than price-matched: a seeded balance is a
-- fixed quantity of the asset, and pinning it to today's price would make it
-- wrong tomorrow.

insert into public.balances (user_id, asset, amount, source)
values
  ('11111111-1111-4111-8111-111111111111', 'BTC', 0.01,  'demo_seed'),
  ('11111111-1111-4111-8111-111111111111', 'SOL', 10,    'demo_seed'),
  ('11111111-1111-4111-8111-111111111111', 'BNB', 1.5,   'demo_seed'),
  ('22222222-2222-4222-8222-222222222222', 'BTC', 0.005, 'demo_seed'),
  ('22222222-2222-4222-8222-222222222222', 'SOL', 3,     'demo_seed'),
  ('22222222-2222-4222-8222-222222222222', 'BNB', 0.5,   'demo_seed')
on conflict (user_id, asset) do nothing;
