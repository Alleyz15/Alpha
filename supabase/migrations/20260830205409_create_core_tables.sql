-- Core schema for the downside-protection product.
-- Tables per docs/DATABASE.md: users, balances, quotes, positions, position_events.
--
-- Conventions (docs/DATABASE.md):
--   money and prices  numeric, never float
--   on-chain raw      text, because they are bigint beyond JS safe-integer range
--   timestamps        timestamptz, always UTC
--   addresses         lowercase, enforced by check
--
-- loans and vaults (Phases 7 and 8) are deliberately not created here. They
-- arrive with the features that need them.

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
-- Set by the database rather than the application. An updated_at that depends
-- on every caller remembering to set it is an updated_at that is quietly wrong.

create or replace function set_updated_at()
returns trigger
language plpgsql
-- Pinned rather than inherited: a mutable search_path on a security-relevant
-- function is a known escalation vector, and Supabase's advisor flags it.
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- Minimal by design: the demo has no login (IMPLEMENT.md 2.6).

create table users (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- balances
-- ---------------------------------------------------------------------------
-- What each demo user notionally holds. Seeded, never deposited - this is a
-- prototype and there is no deposit flow (BR-50).

create table balances (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete restrict,
  asset      text not null,
  amount     numeric not null check (amount >= 0),
  source     text not null default 'demo_seed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One balance row per user per asset. Two rows for the same pair would make
  -- "how much do they hold" ambiguous, and BR-49 caps quotes by that number.
  unique (user_id, asset),

  -- `source` exists so a seeded balance can never be silently reinterpreted as
  -- a real deposit - in a query, in a report, or in an answer to a judge. The
  -- check pins it to the single value this prototype produces. Widening it
  -- means writing a migration, which means the deposit-flow conversation
  -- happens first, which is the point (BR-50, BR-51).
  constraint balances_source_is_demo_seed check (source = 'demo_seed')
);

create trigger balances_set_updated_at
  before update on balances
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- quotes
-- ---------------------------------------------------------------------------
-- A priced offer that was shown to a user. Most expire unused; keeping them
-- gives an audit trail of what was actually on screen before a purchase.

create table quotes (
  id                   uuid primary key default gen_random_uuid(),

  -- DR-6: mandatory. A quote nobody requested cannot be reasoned about.
  user_id              uuid not null references users (id) on delete restrict,

  asset                text not null,
  input_mode           text not null,
  input_amount         numeric not null check (input_amount > 0),
  input_protection_pct numeric,
  input_target_value   numeric,
  input_target_date    date,

  spot_price           numeric not null,

  -- BR-6: both are stored. What the user asked for and what the book could
  -- actually give are different numbers, and the difference is disclosed.
  requested_strike     numeric not null,
  actual_strike        numeric not null,

  expiry               timestamptz not null,
  premium              numeric not null,

  -- 6 decimals - the scale the Order struct carries and fillOrder consumes.
  -- NOT 18. The payout helpers (calculatePayoutAtPrice, calculateMaxPayout)
  -- take 18dp, but that is a conversion boundary, not a storage format:
  -- multiply by 10^12 when calling them. Storing the fill scale means a row
  -- can be compared against chain state without rescaling (BR-36).
  -- Passing a 6dp value to a payout helper returns a plausible number 10^12
  -- too small, and does not throw. See backend/src/thetanuts/decimals.js.
  num_contracts_raw    text not null,

  -- When a fill fails the first question is always "what exactly did we try to
  -- buy?". By then the book has moved and only this answers it.
  order_snapshot       jsonb not null,

  valid_until          timestamptz not null,
  created_at           timestamptz not null default now(),

  constraint quotes_input_mode_valid check (input_mode in ('percentage', 'goal')),

  -- DR-8: a quote records exactly one input mode, and carries the inputs that
  -- mode requires - and only those. These columns record what the user typed,
  -- not what was derived from it; derived figures live in requested_strike and
  -- actual_strike. A goal quote with a protection percentage would be a
  -- derived value stored in an input column, which is how columns start
  -- meaning two things.
  constraint quotes_input_mode_fields check (
    (input_mode = 'percentage'
      and input_protection_pct is not null
      and input_target_value is null
      and input_target_date is null)
    or
    (input_mode = 'goal'
      and input_target_value is not null
      and input_target_date is not null
      and input_protection_pct is null)
  )
);

create index quotes_user_id_idx on quotes (user_id);

-- ---------------------------------------------------------------------------
-- positions  <- the important one
-- ---------------------------------------------------------------------------
-- On-chain, one burner wallet owns every position. Nothing on the blockchain
-- records whose protection is whose. Chain data is a cache we can always
-- rebuild; user_id is the one fact with no external source of truth
-- (BR-31, BR-35).

create table positions (
  id                uuid primary key default gen_random_uuid(),

  -- DR-5: mandatory. DR-10: deleting a user is prohibited while positions
  -- reference them - history is retained, not removed.
  user_id           uuid not null references users (id) on delete restrict,

  -- Nullable on purpose. DR-3 pairs a position with the quote that produced
  -- it, but the reconciliation script (BR-36, IMPLEMENT.md 3.10) rebuilds
  -- positions from chain state, and a position discovered on-chain has no
  -- local quote. Refusing to record it would lose the ownership mapping we
  -- most need to keep.
  quote_id          uuid references quotes (id) on delete restrict,

  status            text not null,
  asset             text not null,
  option_address    text,
  tx_hash           text,

  strike            numeric not null,
  strike_raw        text not null,          -- 8 decimals
  expiry            timestamptz not null,
  num_contracts_raw text not null,          -- 6 decimals, as above

  premium_paid      numeric,
  settlement_price  numeric,
  payout            numeric,
  settled_at        timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- DR-3: a quote may result in at most one position.
  --
  -- Stating the cardinality is not enforcing it. Without this constraint a
  -- double-click, a retried request or a client-side timeout produces two
  -- positions from one quote - and each one spends real money on a fill that
  -- cannot be undone. The database is the only layer that sees concurrent
  -- attempts, so it is the only layer that can make this impossible.
  --
  -- Postgres permits multiple NULLs in a unique index, so this constrains
  -- quote-backed positions without blocking reconciled ones.
  constraint positions_quote_id_key unique (quote_id),

  -- DR-7: exactly one status, drawn from the defined set.
  constraint positions_status_valid check (status in (
    'pending',                -- row written, transaction not yet broadcast (BR-14)
    'pending_verification',   -- broadcast, outcome unknown - never blind-retry
    'active',                 -- confirmed on-chain, not yet expired
    'failed',                 -- reverted; nothing was bought
    'settled',                -- expired in the money, payout recorded
    'expired_worthless',      -- expired out of the money, payout zero
    'needs_review'            -- past expiry but still unsettled on-chain (BR-27)
  )),

  -- Ethereum addresses are case-insensitive; mixed case breaks equality
  -- checks, and these are compared against chain data constantly.
  constraint positions_option_address_lowercase check (option_address = lower(option_address)),
  constraint positions_tx_hash_lowercase check (tx_hash = lower(tx_hash))
);

create trigger positions_set_updated_at
  before update on positions
  for each row execute function set_updated_at();

create index positions_user_id_idx on positions (user_id);          -- dashboard
create index positions_status_expiry_idx on positions (status, expiry);  -- scheduler
create index positions_option_address_idx on positions (option_address); -- reconciliation

-- ---------------------------------------------------------------------------
-- position_events
-- ---------------------------------------------------------------------------
-- Append-only history. Required by BR-19 (settled positions are immutable) and
-- the only thing that will explain what happened when something breaks at 2am
-- before the pitch.
--
-- Never UPDATE a position without inserting a row here. The db layer enforces
-- this by exposing no bare update - see backend/src/db/positions.js.

create table position_events (
  id          uuid primary key default gen_random_uuid(),

  -- DR-4: every event records exactly one position.
  position_id uuid not null references positions (id) on delete restrict,

  event_type  text not null,
  from_status text,
  to_status   text,
  payload     jsonb,
  created_at  timestamptz not null default now(),

  constraint position_events_type_valid check (event_type in (
    'created', 'broadcast', 'confirmed', 'failed', 'settled', 'flagged'
  ))
);

create index position_events_position_id_created_at_idx
  on position_events (position_id, created_at);
