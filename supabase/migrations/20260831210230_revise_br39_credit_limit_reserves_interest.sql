-- BR-39 revised: the credit limit is the floor MINUS the interest the loan
-- charges over its term, solved backwards so principal + interest lands exactly
-- on the floor.
--
-- The old rule lent the whole floor and then charged interest on top, leaving
-- every loan under-collateralised by exactly its own interest from the moment
-- it was written. The first real loan came due owing 4.599410 against a floor
-- of 4.597700.
--
-- GRANDFATHERING. Loans disbursed under the old rule keep their terms - what was
-- lent is a historical fact and must not move. The trigger therefore re-validates
-- only when the terms themselves change. A status change or a repayment hash on
-- an existing row passes untouched; an attempt to edit credit_limit, position_id,
-- due_at or interest_rate is checked against the current rule.
--
-- A ratio is still impossible to insert: the limit must equal a figure derived
-- from the strike, the size and the loan's own stored rate.

create or replace function public.loans_enforce_position_terms()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_expiry    timestamptz;
  v_strike    numeric;
  v_contracts numeric;
  v_floor     numeric;
  v_term_days numeric;
  v_expected  numeric;
begin
  -- Historical rows keep their terms. Only a change to the terms is re-checked.
  if tg_op = 'UPDATE'
     and new.credit_limit  is not distinct from old.credit_limit
     and new.position_id   is not distinct from old.position_id
     and new.due_at        is not distinct from old.due_at
     and new.interest_rate is not distinct from old.interest_rate then
    return new;
  end if;

  select expiry, strike, (num_contracts_raw::numeric / 1000000)
    into v_expiry, v_strike, v_contracts
  from public.positions
  where id = new.position_id;

  if not found then
    raise exception 'loan references position % which does not exist', new.position_id;
  end if;

  -- BR-48: a loan matures exactly when its protection does.
  if new.due_at is null then
    new.due_at := v_expiry;
  elsif new.due_at <> v_expiry then
    raise exception
      'loan due_at (%) must equal the backing put expiry (%) - BR-48',
      new.due_at, v_expiry;
  end if;

  -- BR-39 (revised): floor / (1 + rate x term/365). Derived from the strike,
  -- the size and this loan's own rate. Never a ratio, never configured.
  v_floor := v_strike * v_contracts;

  v_term_days := extract(epoch from (new.due_at - now())) / 86400.0;
  if v_term_days < 0 then
    v_term_days := 0;
  end if;

  v_expected := v_floor / (1 + (new.interest_rate / 100.0) * (v_term_days / 365.0));

  -- Tolerance is one hundredth of a micro-USDC: wide enough for clock skew
  -- between this server and the application (the limit moves about 7e-9 USDC
  -- per second of term), far too tight for any haircut to hide in.
  if abs(new.credit_limit - v_expected) > 0.00001 then
    raise exception
      'credit_limit (%) must equal floor / (1 + rate x term/365) = % / (1 + %/100 x %/365) = % - BR-39, not a ratio',
      new.credit_limit, v_floor, new.interest_rate, v_term_days, v_expected;
  end if;

  return new;
end;
$$;
