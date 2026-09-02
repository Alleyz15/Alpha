-- The money trail for the simulated user balances (BR-49 to BR-52).
--
-- ---------------------------------------------------------------------------
-- RECONSTRUCTED FROM THE LIVE DATABASE on 1 Sep 2026. See the note below.
-- ---------------------------------------------------------------------------
--
-- Applied 31 Aug 2026 through the Supabase MCP tool, which assigns its own
-- version stamp and does not write a file here. The database had this table and
-- both functions for a day with no record of them in the repository.
--
-- Definitions dumped from the applied schema rather than written from memory.
-- The version stamp matches the applied migration (20260831160111) so Supabase
-- treats this as already-applied. See docs/DATABASE.md.
--
-- Why an events table rather than just a balance column: a balance that only
-- ever holds a number cannot say why it moved. Every change is written here,
-- and a reversal is a COMPENSATING WRITE - a refund row beside the debit -
-- never a deletion. The ledger records that the user was charged and made
-- whole, rather than pretending neither happened.

create table if not exists public.balance_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete restrict,
  asset        text not null,

  -- Signed: negative for a debit, positive for a refund or seed. Never zero,
  -- because an event that moved nothing is not an event.
  amount       numeric not null check (amount <> 0),

  event_type   text not null,

  -- ON DELETE RESTRICT, deliberately. A financial event must not vanish because
  -- someone deleted the row it referenced. Test cleanup respects this by
  -- refunding and deleting the events first - see backend/src/db/testCleanup.js.
  position_id  uuid references public.positions (id) on delete restrict,

  reason       text,
  created_at   timestamptz not null default now(),

  constraint balance_events_type_valid check (event_type in ('seed', 'debit', 'refund'))
);

create index if not exists balance_events_user_asset_idx
  on public.balance_events (user_id, asset, created_at);
create index if not exists balance_events_position_idx
  on public.balance_events (position_id);

-- Debit and its compensating refund are both atomic: the balance update and the
-- event insert happen together or not at all. FOR UPDATE locks the balance row
-- so two concurrent purchases cannot both read the same starting figure.
create or replace function public.debit_balance(
  p_user_id uuid,
  p_asset text,
  p_amount numeric,
  p_position_id uuid default null,
  p_reason text default null
)
returns numeric
language plpgsql
set search_path to ''
as $$
declare
  v_balance numeric;
begin
  if p_amount <= 0 then
    raise exception 'debit_balance: amount must be positive, got %', p_amount;
  end if;

  select amount into v_balance
  from public.balances
  where user_id = p_user_id and asset = p_asset
  for update;

  if not found then
    raise exception 'INSUFFICIENT_BALANCE: user % holds no % balance', p_user_id, p_asset;
  end if;

  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_BALANCE: % % required, % held', p_amount, p_asset, v_balance;
  end if;

  update public.balances
  set amount = amount - p_amount
  where user_id = p_user_id and asset = p_asset;

  insert into public.balance_events (user_id, asset, amount, event_type, position_id, reason)
  values (p_user_id, p_asset, -p_amount, 'debit', p_position_id, p_reason);

  return v_balance - p_amount;
end;
$$;

-- Refusing a second refund for the same position is the point: a compensating
-- write that can run twice is a way to invent money.
create or replace function public.refund_balance(
  p_user_id uuid,
  p_asset text,
  p_amount numeric,
  p_position_id uuid default null,
  p_reason text default null
)
returns numeric
language plpgsql
set search_path to ''
as $$
declare
  v_balance numeric;
  v_already integer;
begin
  if p_amount <= 0 then
    raise exception 'refund_balance: amount must be positive, got %', p_amount;
  end if;

  if p_position_id is not null then
    select count(*) into v_already
    from public.balance_events
    where position_id = p_position_id and event_type = 'refund';

    if v_already > 0 then
      raise exception 'refund_balance: position % has already been refunded', p_position_id;
    end if;
  end if;

  update public.balances
  set amount = amount + p_amount
  where user_id = p_user_id and asset = p_asset
  returning amount into v_balance;

  if not found then
    raise exception 'refund_balance: user % holds no % balance row', p_user_id, p_asset;
  end if;

  insert into public.balance_events (user_id, asset, amount, event_type, position_id, reason)
  values (p_user_id, p_asset, p_amount, 'refund', p_position_id, p_reason);

  return v_balance;
end;
$$;

-- BR-16: RLS on, no policies - see the note in the vaults migration.
alter table public.balance_events enable row level security;

grant select, insert, update, delete on public.balance_events to service_role;
