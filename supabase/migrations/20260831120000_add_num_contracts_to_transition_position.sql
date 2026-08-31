-- Add num_contracts_raw to transition_position().
--
-- A fill executes by USDC amount, so the contracts that actually fill can land
-- a hair off the quoted count stored on the pending row. executeFill records the
-- real premium from the receipt but had no way to correct num_contracts_raw, so
-- the row kept the quote (e.g. 140000 stored vs 139999 on chain). That is a
-- reconciliation mismatch (BR-36) and a number shown to the user that no longer
-- traces to the fill (BR-40).
--
-- This lets the one sanctioned mutator write the actual on-chain contract count,
-- still in one transaction with its event. The parameter defaults to null and is
-- coalesced, so every existing caller is unaffected.
--
-- The signature changes (an added parameter), so the old 10-arg function is
-- dropped first — CREATE OR REPLACE alone would leave a second overload behind.

drop function if exists transition_position(
  uuid, text, text, jsonb, text, text, numeric, numeric, numeric, timestamptz
);

create or replace function transition_position(
  p_position_id       uuid,
  p_to_status         text,
  p_event_type        text,
  p_payload           jsonb       default null,
  p_tx_hash           text        default null,
  p_option_address    text        default null,
  p_premium_paid      numeric     default null,
  p_num_contracts_raw text        default null,
  p_settlement_price  numeric     default null,
  p_payout            numeric     default null,
  p_settled_at        timestamptz default null
)
returns public.positions
language plpgsql
set search_path = ''
as $$
declare
  v_from_status text;
  v_row         public.positions;
begin
  -- Lock the row so two concurrent transitions cannot interleave.
  select status into v_from_status
  from public.positions
  where id = p_position_id
  for update;

  if not found then
    raise exception 'position % not found', p_position_id;
  end if;

  -- BR-19: settled positions are immutable. Corrections are new rows, not edits.
  if v_from_status in ('settled', 'expired_worthless') then
    raise exception 'position % is terminal (%) and cannot be modified (BR-19)',
      p_position_id, v_from_status;
  end if;

  -- coalesce so a caller only supplies the fields this transition actually
  -- learns. Passing null must never blank a value already recorded.
  update public.positions set
    status            = p_to_status,
    tx_hash           = coalesce(p_tx_hash, tx_hash),
    option_address    = coalesce(p_option_address, option_address),
    premium_paid      = coalesce(p_premium_paid, premium_paid),
    num_contracts_raw = coalesce(p_num_contracts_raw, num_contracts_raw),
    settlement_price  = coalesce(p_settlement_price, settlement_price),
    payout            = coalesce(p_payout, payout),
    settled_at        = coalesce(p_settled_at, settled_at)
  where id = p_position_id
  returning * into v_row;

  insert into public.position_events (position_id, event_type, from_status, to_status, payload)
  values (p_position_id, p_event_type, v_from_status, p_to_status, p_payload);

  return v_row;
end;
$$;
