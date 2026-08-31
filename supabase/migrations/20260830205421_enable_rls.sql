-- Row Level Security on every table (BR-16).
--
-- Supabase does not enable RLS by default. Our backend uses the secret key,
-- which bypasses RLS by design, so RLS is not what protects us today - the
-- frontend never talks to Postgres at all, only to our API.
--
-- It must still be on, so that a future change, or a leaked publishable key,
-- is not immediately fatal. A database that is only safe because nobody has
-- pointed a client at it yet is not safe.
--
-- No policies are created deliberately. RLS with no policy denies everything
-- to anon and authenticated, which is the correct posture for tables no client
-- should ever read. A permissive policy here would be the bug, not the fix.
-- When a low-privilege client genuinely needs access, that is a new migration
-- and a deliberate decision.

alter table users            enable row level security;
alter table balances         enable row level security;
alter table quotes           enable row level security;
alter table positions        enable row level security;
alter table position_events  enable row level security;
