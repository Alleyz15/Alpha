-- Loans (IMPLEMENT.md Phase 7).
--
-- A USDC loan against a put we already hold. The product's entire claim is that
-- the credit limit comes from the option's strike rather than from a
-- loan-to-value ratio we chose - so the schema is built to make the alternative
-- hard rather than merely discouraged.

create table loans (
  id                uuid primary key default gen_random_uuid(),

  -- Same rule as positions: ownership is the one fact with no external source
  -- of truth (BR-31), and history is retained rather than deleted (DR-10).
  user_id           uuid not null references users (id) on delete restrict,

  -- The put that provides the floor. DR-11: exactly one position per loan.
  position_id       uuid not null references positions (id) on delete restrict,

  status            text not null default 'active',

  -- What was actually disbursed. May be less than the limit - a borrower need
  -- not draw the whole line.
  principal         numeric not null check (principal > 0),

  -- BR-39: derived from the filled put as strike x num_contracts, computed once
  -- at disbursement and stored (BR-40). NEVER a ratio, never configuration.
  --
  -- This cannot be a CHECK constraint because it depends on another table, so
  -- the trigger below verifies it against the referenced position instead. A
  -- hardcoded ratio would produce the same number with or without the option,
  -- which would make the answer we give judges false.
  credit_limit      numeric not null check (credit_limit > 0),

  -- Stored so the figure is auditable rather than reconstructed from an env
  -- var that may have changed since.
  interest_rate     numeric not null,

  -- Units of the asset the put covers.
  collateral_amount numeric not null check (collateral_amount > 0),

  -- Where the USDC went. The prototype is custodial and users have no wallets,
  -- so this is an address we control standing in for a user address (BR-32).
  recipient_address text,

  disbursement_tx   text,
  repayment_tx      text,

  -- BR-48: equal to the backing put's expiry. Enforced by trigger below.
  due_at            timestamptz not null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint loans_status_valid check (status in ('active', 'repaid', 'defaulted')),

  -- Lowercase, like every other address we compare against chain data.
  constraint loans_recipient_lowercase check (recipient_address = lower(recipient_address)),
  constraint loans_disbursement_tx_lowercase check (disbursement_tx = lower(disbursement_tx)),
  constraint loans_repayment_tx_lowercase check (repayment_tx = lower(repayment_tx)),

  -- One loan per position. A second loan against the same put would be lending
  -- twice against one floor, which is the failure this product exists to avoid.
  constraint loans_position_id_key unique (position_id),

  -- A draw cannot exceed the line it is drawn against.
  constraint loans_principal_within_limit check (principal <= credit_limit)
);

create trigger loans_set_updated_at
  before update on loans
  for each row execute function set_updated_at();

create index loans_user_id_idx on loans (user_id);
create index loans_position_id_idx on loans (position_id);
create index loans_status_due_at_idx on loans (status, due_at);

-- ---------------------------------------------------------------------------
-- BR-48: a loan matures exactly when its protection does
-- ---------------------------------------------------------------------------
--
-- The collateral floor only exists AT expiry. Before then a put's market value
-- is not its strike, so a loan that can come due earlier has no floor at the
-- moment it matters and the product's central claim collapses.
--
-- The trigger fills due_at from the position when it is not supplied, and
-- refuses a value that disagrees. Convention would have been enough right up
-- until the one time somebody set it by hand.
--
-- It also verifies credit_limit against the position it is derived from, so a
-- ratio cannot be slipped in through the application layer (BR-39).

create or replace function loans_enforce_position_terms()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_expiry    timestamptz;
  v_strike    numeric;
  v_contracts numeric;
  v_expected  numeric;
begin
  select expiry, strike, (num_contracts_raw::numeric / 1000000)
    into v_expiry, v_strike, v_contracts
  from public.positions
  where id = new.position_id;

  if not found then
    raise exception 'loan references position % which does not exist', new.position_id;
  end if;

  -- BR-48
  if new.due_at is null then
    new.due_at := v_expiry;
  elsif new.due_at <> v_expiry then
    raise exception
      'loan due_at (%) must equal the backing put expiry (%) - BR-48',
      new.due_at, v_expiry;
  end if;

  -- BR-39: strike x contracts, and nothing else.
  v_expected := v_strike * v_contracts;
  if abs(new.credit_limit - v_expected) > 0.000001 then
    raise exception
      'credit_limit (%) must equal strike x contracts (% x % = %) - BR-39, not a ratio',
      new.credit_limit, v_strike, v_contracts, v_expected;
  end if;

  return new;
end;
$$;

create trigger loans_enforce_position_terms_trg
  before insert or update on loans
  for each row execute function loans_enforce_position_terms();

alter table loans enable row level security;

grant select, insert, update, delete on loans to service_role;
