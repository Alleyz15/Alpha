-- Two states a vault could not express (8.6).
--
-- 'maturing'    a maturity transfer has been prepared and its outcome is not
--               yet known. The same trace BR-14 leaves for a fill: the row is
--               written BEFORE the money moves, so an interrupted transfer
--               leaves a record rather than a gap.
--
-- 'superseded'  the 100 USDC vault. Its modelled principal was never returnable
--               from a wallet holding 4.66, so a smaller one was bought to make
--               maturity real. Its call is genuine, is held, and settles on 3
--               Sep like any other - it simply cannot pay its principal.
--
--               Marking it 'failed' would be untrue. Deleting it would remove
--               the record of a real on-chain purchase to tidy a demo.

alter table public.vaults
  drop constraint if exists vaults_status_valid;

alter table public.vaults
  add constraint vaults_status_valid
  check (status in ('active', 'maturing', 'matured', 'superseded', 'failed'));

alter table public.vaults
  add column if not exists maturity_tx text
    check (maturity_tx is null or maturity_tx = lower(maturity_tx));

alter table public.vaults
  add column if not exists returned_usdc numeric
    check (returned_usdc is null or returned_usdc >= 0);

alter table public.vaults
  add column if not exists recipient_address text
    check (recipient_address is null or recipient_address = lower(recipient_address));

comment on column public.vaults.returned_usdc is
  'What was actually transferred at maturity: principal plus any call payout. Fixed when the maturity is prepared, so the verification checks the figure the operator was given.';

-- The 100 USDC vault, retired now that a returnable one exists.
update public.vaults set status = 'superseded'
where principal = 100 and status = 'active';
