-- Table privileges.
--
-- ---------------------------------------------------------------------------
-- Why this is needed
-- ---------------------------------------------------------------------------
-- This project's default privileges do not grant DML on new public tables to
-- anyone but `postgres`. service_role - the role the backend's secret key
-- resolves to - was left with only REFERENCES, TRIGGER and TRUNCATE, so every
-- read and write from the backend failed with 42501 permission denied.
--
-- Worth knowing the difference: a missing GRANT raises 42501, while RLS with
-- no matching policy returns an empty result for a select. Both look like
-- "nothing came back" from the application, and they have different fixes.
--
-- ---------------------------------------------------------------------------
-- Who gets what
-- ---------------------------------------------------------------------------
--   service_role   full DML. This is the backend, and it is the only actor.
--   anon           nothing. The frontend never touches Postgres (BR-16 note).
--   authenticated  nothing. There is no end-user login in this prototype.
--
-- anon and authenticated are already blocked by RLS with no policies. Leaving
-- them without grants too means an accidental permissive policy later is not
-- immediately a data leak. Two independent locks, deliberately.

grant usage on schema public to service_role;

grant select, insert, update, delete
  on all tables in schema public
  to service_role;

grant usage, select
  on all sequences in schema public
  to service_role;

-- Same for anything added later, so a future table is not silently unreadable
-- by the backend until someone rediscovers this.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- Explicit, so the intent survives someone later running a broad grant.
revoke all on all tables in schema public from anon, authenticated;
