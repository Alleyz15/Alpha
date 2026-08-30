-- Demo users and their balances (IMPLEMENT.md 2.6, 2.7).
--
-- ---------------------------------------------------------------------------
-- Why two users
-- ---------------------------------------------------------------------------
-- On-chain, one burner wallet owns every position. Nothing on the blockchain
-- says whose protection is whose - only positions.user_id does (BR-31). One
-- user cannot demonstrate that: with a single owner, a broken mapping and a
-- correct one look identical. Two users holding different positions is the
-- cheapest way to show the mapping is actually load-bearing.
--
-- ---------------------------------------------------------------------------
-- Why these balances
-- ---------------------------------------------------------------------------
-- Both are plausible retail holdings. They are deliberately different so the
-- two-user setup proves the ownership mapping and gives us a case for each
-- display path:
--
--   Demo User A   0.4 ETH    full coverage - the clean path
--   Demo User B   0.15 ETH   smaller holding - exercises BR-6 disclosure
--
-- No arithmetic backs these numbers and none is needed. The premium cap is not
-- applied when quoting - it guards broadcasting, not pricing (BR-33), so a
-- balance no longer has to be chosen around it. See the note in
-- backend/src/thetanuts/quote.js.
--
-- ---------------------------------------------------------------------------
-- Fixed UUIDs
-- ---------------------------------------------------------------------------
-- Not gen_random_uuid(). Fixed ids make this seed idempotent, re-runnable on a
-- fresh machine, and referenceable from the API and the demo script without a
-- lookup step that could pick the wrong row on stage.
--
-- Balances are seeded, never deposited. There is no deposit flow and building
-- one is out of scope (BR-50); the interface states that the holding is
-- simulated while quotes, fills and settlement are real (BR-51).

insert into users (id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'Demo User A'),
  ('22222222-2222-4222-8222-222222222222', 'Demo User B')
on conflict (id) do nothing;

insert into balances (user_id, asset, amount, source) values
  ('11111111-1111-4111-8111-111111111111', 'ETH', 0.4,  'demo_seed'),
  ('22222222-2222-4222-8222-222222222222', 'ETH', 0.15, 'demo_seed')
on conflict (user_id, asset) do nothing;
