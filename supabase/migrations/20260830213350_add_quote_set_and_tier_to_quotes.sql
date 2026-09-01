-- Trace a persisted quote back to the set the user was actually shown.
--
-- A request produces a *set* of protection tiers, of which the user picks one.
-- Only the chosen tier is persisted: a `quotes` row records what was bought,
-- not every price that was ever displayed, and a 60-second offer does not
-- belong in Postgres.
--
-- But the set still needs to be identifiable. When a purchase is queried later
-- - by us, or by a judge asking "what else were they offered?" - the row has to
-- join up with the request that produced it. The purchase log records the set
-- id, so storing it here is what makes the log and the row correlatable.
--
-- tier_label records which of highest/middle/lowest was taken, so we can see
-- whether people accept the preselected middle tier (BR-41) or move off it.

alter table quotes add column quote_set_id uuid;
alter table quotes add column tier_label text;

create index quotes_quote_set_id_idx on quotes (quote_set_id);

comment on column quotes.quote_set_id is
  'The in-memory quote set this tier belonged to. Correlates a stored row with the purchase log.';
comment on column quotes.tier_label is
  'highest | middle | lowest - which tier of the set the user chose (BR-41).';
