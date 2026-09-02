-- Two-day principal protection (Phase 8).
--
-- ---------------------------------------------------------------------------
-- RECONSTRUCTED FROM THE LIVE DATABASE on 1 Sep 2026. See the note below.
-- ---------------------------------------------------------------------------
--
-- This migration was applied on 31 Aug 2026 through the Supabase MCP tool,
-- which assigns its own version stamp and does NOT write a file into this
-- directory. The result: the database had this table for a day while the
-- repository had no record that it existed.
--
-- The definitions here were dumped from the applied schema
-- (pg_get_constraintdef, pg_indexes, pg_get_functiondef, pg_get_triggerdef)
-- rather than written from memory, because the live database is the truth and
-- this file is the thing that was wrong. See docs/DATABASE.md.
--
-- The version stamp matches the applied migration exactly (20260831150551), so
-- Supabase treats this as already-applied rather than trying to run it again.

create table if not exists public.vaults (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users (id) on delete restrict,

  -- The call that funds the upside share. Nullable so the row can exist before
  -- the fill confirms (BR-14's logic), unique so one call backs one vault.
  position_id         uuid unique references public.positions (id) on delete restrict,

  status              text not null default 'active',

  principal           numeric not null check (principal > 0),
  yield_portion       numeric not null check (yield_portion > 0),
  option_portion      numeric not null check (option_portion > 0),
  yield_rate_annual   numeric not null,
  participation_rate  numeric not null check (participation_rate > 0),
  exposure_usdc       numeric not null check (exposure_usdc > 0),

  -- BR-37: the yield is simulated and the schema will not let anyone claim
  -- otherwise. A CHECK pinned to true cannot be flipped by an UPDATE.
  yield_is_simulated  boolean not null default true,

  maturity            timestamptz not null,
  payout              numeric,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint vaults_status_valid check (status in ('active', 'matured', 'failed')),

  -- The split must account for the whole deposit. Tolerance is one micro-unit
  -- of USDC, because the split is computed in floating point before rounding.
  constraint vaults_split_sums check (abs((yield_portion + option_portion) - principal) < 0.000001),

  constraint vaults_yield_is_simulated check (yield_is_simulated = true)
);

create index if not exists vaults_user_id_idx on public.vaults (user_id);
create index if not exists vaults_status_maturity_idx on public.vaults (status, maturity);

-- A vault matures exactly when its call expires. The guarantee only exists at
-- expiry; before then the call's market value is not its payout. Enforced in
-- the database as well as the code, because getting it wrong is silent.
create or replace function public.vaults_enforce_position_terms()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_expiry timestamptz;
begin
  if new.position_id is null then
    return new;
  end if;

  select expiry into v_expiry from public.positions where id = new.position_id;
  if not found then
    raise exception 'vault references position % which does not exist', new.position_id;
  end if;

  if new.maturity <> v_expiry then
    raise exception
      'vault maturity (%) must equal the call expiry (%) - the guarantee only exists at expiry',
      new.maturity, v_expiry;
  end if;

  return new;
end;
$$;

drop trigger if exists vaults_enforce_position_terms_trg on public.vaults;
create trigger vaults_enforce_position_terms_trg
  before insert or update on public.vaults
  for each row execute function public.vaults_enforce_position_terms();

drop trigger if exists vaults_set_updated_at on public.vaults;
create trigger vaults_set_updated_at
  before update on public.vaults
  for each row execute function public.set_updated_at();

-- BR-16: RLS on, and deliberately NO policies. The anon key can reach this
-- table and without RLS it would be world-writable. No policy means no access
-- through the anon or authenticated roles at all; the backend uses the service
-- role, which bypasses RLS by design.
alter table public.vaults enable row level security;

grant select, insert, update, delete on public.vaults to service_role;
