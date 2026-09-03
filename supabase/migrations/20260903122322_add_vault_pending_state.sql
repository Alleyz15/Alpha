-- A vault state for "the row exists, the call has not been bought yet".
--
-- BR-14's rule is that the row is written BEFORE anything is broadcast, so an
-- interrupted process leaves a traceable record rather than a silent gap. The
-- vault deposit did the opposite: scripts/vault.js bought the call first and
-- inserted the vaults row afterwards, which means a process that died in
-- between left an option nobody had a record of owning.
--
-- Worse, the insert's failure was logged and execution continued - so a failed
-- vault row printed a wallet summary and exited zero.
--
-- Fixing the order needs a status the row can legitimately hold before the fill
-- confirms. 'active' would be a lie: nothing has been bought.
--
--   'pending'   the deposit is recorded and the call has not been bought. The
--               same meaning 'pending' has on positions.
--
-- 'failed' already exists and is where a pending vault goes when the fill is
-- definitively refused. A fill whose outcome is UNKNOWN leaves the vault at
-- 'pending' and its position at 'pending_verification', for a human - never a
-- guess in either direction.

alter table public.vaults
  drop constraint if exists vaults_status_valid;

alter table public.vaults
  add constraint vaults_status_valid
  check (status in ('pending', 'active', 'maturing', 'matured', 'superseded', 'failed'));

comment on column public.vaults.status is
  'pending: row written, call not yet bought. active: call held. maturing: return transfer prepared, outcome unknown. matured: returned. superseded: replaced, principal not returnable. failed: the call was definitively not bought.';

-- position_id is already nullable and unique, so a pending vault can exist
-- before its call does, and no two vaults can ever claim the same position.
comment on column public.vaults.position_id is
  'The call that funds the upside share. Null while the vault is pending - the row exists before the fill, per BR-14.';
