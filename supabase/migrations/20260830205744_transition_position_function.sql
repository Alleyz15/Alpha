-- transition_position(): the only way a position's status changes.
--
-- ---------------------------------------------------------------------------
-- Why this is a database function and not two calls from the application
-- ---------------------------------------------------------------------------
-- The rule is that a position is never UPDATEd without a position_events row
-- (docs/DATABASE.md, BR-19). Two separate statements from Node cannot honour
-- that: if the update commits and the event insert then fails, the audit trail
-- has a silent gap at exactly the moment something was going wrong. When a fill
-- misbehaves the night before the pitch, that table is the only account of what
-- happened.
--
-- Inside one function both happen in a single transaction, or neither does.
--
-- SECURITY INVOKER (the default) on purpose: this must run with the caller's
-- privileges, so RLS still applies and only the backend's secret key can use
-- it. A SECURITY DEFINER function here would be callable by anon.

create or replace function transition_position(
  p_position_id      uuid,
  p_to_status        text,
  p_event_type       text,
  p_payload          jsonb       default null,
  p_tx_hash          text        default null,
  p_option_address   text        default null,
  p_premium_paid     numeric     default null,
  p_settlement_price numeric     default null,
  p_payout           numeric     default null,
  p_settled_at       timestamptz default null
)
returns public.positions
language plpgsql
set search_path = ''
as $$
declare
  v_from_status text;
  v_row         public.positions;
begin
  -- Lock the row so two concurrent transitions cannot interleave and produce
  -- an event history that contradicts the final status.
  select status into v_from_status
  from public.positions
  where id = p_position_id
  for update;

  if not found then
    raise exception 'position % not found', p_position_id;
  end if;

  -- BR-19: settled positions are immutable. Corrections are new rows, not
  -- edits. Enforced here so it holds even if application code forgets.
  if v_from_status in ('settled', 'expired_worthless') then
    raise exception 'position % is terminal (%) and cannot be modified (BR-19)',
      p_position_id, v_from_status;
  end if;

  -- coalesce so a caller only supplies the fields this transition actually
  -- learns. Passing null must never blank a value already recorded.
  update public.positions set
    status           = p_to_status,
    tx_hash          = coalesce(p_tx_hash, tx_hash),
    option_address   = coalesce(p_option_address, option_address),
    premium_paid     = coalesce(p_premium_paid, premium_paid),
    settlement_price = coalesce(p_settlement_price, settlement_price),
    payout           = coalesce(p_payout, payout),
    settled_at       = coalesce(p_settled_at, settled_at)
  where id = p_position_id
  returning * into v_row;

  insert into public.position_events (position_id, event_type, from_status, to_status, payload)
  values (p_position_id, p_event_type, v_from_status, p_to_status, p_payload);

  return v_row;
end;
$$;
