-- positions could not say whether it held a put or a call.
--
-- Every position was assumed to be a put, because for Phases 1-7 every position
-- was one. Phase 8 buys CALLS to fund the vault's upside share, and they landed
-- in the same table with no way to tell them apart - so the dashboard rendered a
-- call's strike as "Protection floor $2,680", a floor ABOVE spot, which reads as
-- a bug to anyone who looks.
--
-- The strike of a put is a floor: the price below which you are protected.
-- The strike of a call is a threshold: the price above which you share the gain.
-- Same column, opposite meaning, and nothing recorded which one applied.
--
-- Default 'put' because that is what every pre-Phase-8 row is, and the column is
-- NOT NULL so a future insert cannot omit it silently.

alter table public.positions
  add column if not exists option_type text not null default 'put';

alter table public.positions
  drop constraint if exists positions_option_type_valid;

alter table public.positions
  add constraint positions_option_type_valid
  check (option_type in ('put', 'call'));

-- Backfill from the only source of truth available: a position referenced by a
-- vault is the call that funds that vault's upside. Nothing else in the table is
-- a call.
update public.positions p
set option_type = 'call'
where exists (select 1 from public.vaults v where v.position_id = p.id);

comment on column public.positions.option_type is
  'put or call. A put strike is a protection floor; a call strike is the threshold above which the holder shares the gain. The interface must not render one as the other.';
