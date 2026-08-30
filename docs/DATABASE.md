# DATABASE

Schema for the custodial protection product. **Review this before any table is created** — changing a schema after data exists is far more painful than changing this file.

**Database:** Supabase (PostgreSQL), region Singapore.

---

## Why this schema matters more than usual

The product is **custodial** (requirements.md §0). On-chain, one burner wallet owns every position. Nothing on the blockchain records which position belongs to which user.

**This database is the only place that mapping exists.** If it's wrong, lost, or ambiguous, the product is broken even though the chain data is perfect. Treat `positions.user_id` as the most important column in the system (BR-31).

---

## Entity relationships

```
users
  ├──1:N──> quotes ──1:0..1──> positions ──1:N──> position_events
  ├──1:N──> positions                    <──0..1──┐
  ├──1:N──> loans  ──────────────────────────────┤  (Phase 7)
  └──1:N──> vaults ──────────────────────────────┘  (Phase 8)
```

Both `loans` and `vaults` reference a position — the option that makes the product work. A loan points at the put that floors its collateral; a vault points at the call that provides its upside.

| Relationship | Meaning |
|---|---|
| users → quotes | A user requests many quotes; most are never bought |
| quotes → positions | A quote becomes at most one position |
| users → positions | Denormalised on purpose — see note below |
| positions → position_events | Every state change is appended, never overwritten |

> **Why `user_id` is on both quotes and positions:** you could reach the user through the quote, but ownership is too important to depend on a join staying correct. Storing it directly makes the critical relationship explicit and survivable.

### Relationship rules

| # | Rule | Cardinality |
|---|---|---|
| **DR-1** | A user may request zero or more quotes. Each quote is requested by exactly one user. | 1 : M |
| **DR-2** | A user may hold zero or more positions. Each position belongs to exactly one user. | 1 : M |
| **DR-3** | A quote may result in zero or one position. Each position originates from exactly one quote. | 1 : 0..1 |
| **DR-4** | A position generates one or more position events. Each event records exactly one position. | 1 : M |
| **DR-11** | A user may hold zero or more loans. Each loan belongs to exactly one user and references exactly one position. | 1 : M |
| **DR-12** | A user may hold zero or more vaults. Each vault belongs to exactly one user and references at most one position. | 1 : M |

### Participation and attribute rules

| # | Rule |
|---|---|
| **DR-5** | `positions.user_id` is mandatory. A position with no owner is meaningless — on-chain the wallet owns everything, so an unowned row can never be reconstructed (BR-31). |
| **DR-6** | `quotes.user_id` is mandatory. |
| **DR-7** | A position holds exactly one status at any time, drawn from the defined status set. |
| **DR-8** | A quote records exactly one input mode. `percentage` requires `input_protection_pct`; `goal` requires both `input_target_value` and `input_target_date`. |
| **DR-9** | A position holds exactly one strike and one expiry. Both are fixed at fill time and never change, because on-chain values are immutable. |
| **DR-10** | Deleting a user is prohibited while positions reference them. History is retained, not removed. |
| **DR-13** | `loans.credit_limit` is derived from the referenced position's strike. It is never an independent figure that could drift from the option backing it. |
| **DR-14** | A vault records both `yield_rate_annual` and `participation_rate` as stored values, so any displayed number can be traced back to the row that produced it. |


---

## Conventions

| Rule | Reason |
|---|---|
| Money and prices use `NUMERIC`, never `FLOAT` | Floats lose precision. Never acceptable for money. |
| On-chain raw values stored as `TEXT` | They're `bigint` beyond JS safe-integer range. Store raw, convert for display. |
| Human-readable values stored alongside raw | Avoids repeating conversion logic (and its bugs) everywhere |
| Timestamps are `TIMESTAMPTZ`, always UTC | Judges, servers and the chain are in different zones |
| Every table has `created_at` | Debugging without it is guesswork |
| Addresses stored lowercase | Ethereum addresses are case-insensitive; mixed case breaks equality checks |

**Decimals recap:** strike and price use 8 decimals · USDC uses 6 · numContracts uses 18.

---

## Tables

### `users`

Minimal by design — the demo has no login (IMPLEMENT.md 2.6).

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | `gen_random_uuid()` |
| `display_name` | `TEXT` NOT NULL | e.g. "Demo User" |
| `created_at` | `TIMESTAMPTZ` NOT NULL | default `now()` |

> ⚠️ **Decide:** is one seeded demo user enough, or do we want several so the dashboard shows separation? One is simpler; several demonstrate the mapping actually works. **My suggestion: seed two.** It costs nothing and proves BR-31 on stage.

---

### `balances`

What each demo user notionally holds. **Seeded, not deposited** — this is a
prototype and there is no deposit flow (BR-50).

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → users NOT NULL | |
| `asset` | `TEXT` NOT NULL | 'ETH', 'BTC' |
| `amount` | `NUMERIC` NOT NULL | Units held |
| `source` | `TEXT` NOT NULL | `demo_seed` — the only value this prototype produces |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |
| `updated_at` | `TIMESTAMPTZ` NOT NULL | |

**Relationship:** users 1:N balances.

> `source` exists so a seeded balance can never be silently reinterpreted as a real
> deposit — in a query, in a report, or in an answer to a judge. It has one value
> today, and that is the point: the moment a second value appears, someone built a
> deposit flow, and that should have been a conversation first.

---

### `quotes`

A priced offer shown to the user. Most expire unused; keeping them gives us an audit trail of what was actually shown before a purchase.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → users | |
| `asset` | `TEXT` NOT NULL | 'ETH', 'BTC', … |
| `input_mode` | `TEXT` NOT NULL | `'percentage'` or `'goal'` |
| `input_amount` | `NUMERIC` NOT NULL | How much of the asset they hold |
| `input_protection_pct` | `NUMERIC` NULL | Set when `input_mode = 'percentage'` |
| `input_target_value` | `NUMERIC` NULL | Set when `input_mode = 'goal'` |
| `input_target_date` | `DATE` NULL | Set when `input_mode = 'goal'` |
| `spot_price` | `NUMERIC` NOT NULL | Price at quote time |
| `requested_strike` | `NUMERIC` NOT NULL | What they asked for |
| `actual_strike` | `NUMERIC` NOT NULL | What the book could give (BR-6) |
| `expiry` | `TIMESTAMPTZ` NOT NULL | Actual expiry selected |
| `premium` | `NUMERIC` NOT NULL | Total cost in USDC |
| `num_contracts_raw` | `TEXT` NOT NULL | 18 decimals |
| `order_snapshot` | `JSONB` NOT NULL | The full order as quoted |
| `valid_until` | `TIMESTAMPTZ` NOT NULL | BR-8 |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |

> **Why `order_snapshot`:** when a fill fails, the first question is always "what exactly did we try to buy?". Without the snapshot, the book has already moved and the answer is unrecoverable.

---

### `positions` ← the important one

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → users NOT NULL | **BR-31 — the ownership mapping** |
| `quote_id` | `UUID` FK → quotes | |
| `status` | `TEXT` NOT NULL | See status values below |
| `asset` | `TEXT` NOT NULL | |
| `option_address` | `TEXT` NULL | Lowercase. Null until confirmed |
| `tx_hash` | `TEXT` NULL | Null until broadcast |
| `strike` | `NUMERIC` NOT NULL | Human-readable |
| `strike_raw` | `TEXT` NOT NULL | 8 decimals |
| `expiry` | `TIMESTAMPTZ` NOT NULL | |
| `num_contracts_raw` | `TEXT` NOT NULL | 18 decimals |
| `premium_paid` | `NUMERIC` NULL | Actual, may differ from quote |
| `settlement_price` | `NUMERIC` NULL | Filled at settlement |
| `payout` | `NUMERIC` NULL | Filled at settlement |
| `settled_at` | `TIMESTAMPTZ` NULL | |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |
| `updated_at` | `TIMESTAMPTZ` NOT NULL | |

**Status values**

| Status | Meaning |
|---|---|
| `pending` | Row written, transaction not yet broadcast (BR-14) |
| `pending_verification` | Broadcast, outcome unknown — **never blind-retry** |
| `active` | Confirmed on-chain, not yet expired |
| `failed` | Transaction reverted; nothing was bought |
| `settled` | Expired in the money, payout recorded |
| `expired_worthless` | Expired out of the money, payout zero |
| `needs_review` | Past expiry but still unsettled on-chain (BR-27) |

**Indexes**

- `(user_id)` — dashboard queries
- `(status, expiry)` — the scheduler's main query
- `(option_address)` — reconciling against chain events

---

### `loans` (Phase 7)

A USDC loan against protected collateral. The credit limit comes from the put's strike.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → users NOT NULL | Ownership, same rule as positions |
| `position_id` | `UUID` FK → positions NOT NULL | The put that provides the floor |
| `status` | `TEXT` NOT NULL | `active`, `repaid`, `defaulted` |
| `principal` | `NUMERIC` NOT NULL | USDC disbursed |
| `credit_limit` | `NUMERIC` NOT NULL | **Derived from strike × contracts, never a hardcoded ratio** |
| `interest_rate` | `NUMERIC` NOT NULL | Stored so the figure is auditable |
| `collateral_amount` | `NUMERIC` NOT NULL | Asset units held |
| `disbursement_tx` | `TEXT` NULL | Lowercase. On-chain USDC transfer |
| `repayment_tx` | `TEXT` NULL | |
| `due_at` | `TIMESTAMPTZ` NOT NULL | Matches the put's expiry |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |
| `updated_at` | `TIMESTAMPTZ` NOT NULL | |

> **`credit_limit` must be computed, not configured:**
>
> ```
> credit_limit = strike × num_contracts
> ```
>
> Read straight from the put that was filled. No haircut, no loan-to-value ratio. The product's entire claim is that the limit comes from the option's strike — a hardcoded ratio would make that claim false, and the answer we give judges a lie.
>
> It is computed once at disbursement and stored. It never changes, because the strike never changes.

---

### `vaults` (Phase 8)

A principal-protected deposit. The yield portion is simulated; the option portion buys a real call.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `user_id` | `UUID` FK → users NOT NULL | Ownership |
| `position_id` | `UUID` FK → positions | The real call bought on-chain |
| `status` | `TEXT` NOT NULL | `active`, `matured`, `failed` |
| `principal` | `NUMERIC` NOT NULL | Total deposited, USDC |
| `yield_portion` | `NUMERIC` NOT NULL | **Simulated** |
| `option_portion` | `NUMERIC` NOT NULL | Real premium paid |
| `yield_rate_annual` | `NUMERIC` NOT NULL | Assumed rate, stored so it's auditable |
| `participation_rate` | `NUMERIC` NOT NULL | Calculated at deposit, displayed to the user |
| `maturity` | `TIMESTAMPTZ` NOT NULL | Matches the call's expiry |
| `payout` | `NUMERIC` NULL | Filled at maturity |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |

> **How the split and the rate are computed:**
>
> ```
> yield_portion       = principal ÷ (1 + yield_rate_annual × days / 365)
> option_portion      = principal − yield_portion
> exposure            = option_portion ÷ premium_per_contract × contract_size
> participation_rate  = exposure ÷ principal
> ```
>
> The first line is solved backwards — not "95 grows into 100" but "to reach exactly 100, set aside this much today". That makes the protection exact rather than approximate.
>
> `participation_rate` depends on the live premium, so it differs between deposits made on different days. **It is fixed for a given vault at deposit time and stored**, so a number shown to a user always traces back to the row that produced it.

---

### `position_events`

Append-only history. Required by BR-19 (settled positions are immutable) and invaluable for debugging.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID` PK | |
| `position_id` | `UUID` FK → positions | |
| `event_type` | `TEXT` NOT NULL | `created`, `broadcast`, `confirmed`, `failed`, `settled`, `flagged` |
| `from_status` | `TEXT` NULL | |
| `to_status` | `TEXT` NULL | |
| `payload` | `JSONB` NULL | Tx receipt, error message, settlement data |
| `created_at` | `TIMESTAMPTZ` NOT NULL | |

> **Never UPDATE a position without inserting an event.** When something goes wrong at 2am before the pitch, this table is the only thing that will tell you what actually happened.

---

## Row Level Security

**Every table gets RLS enabled** (BR-16). Supabase does not do this by default. Our backend uses the secret key, which bypasses RLS by design, so RLS is not what protects us today — but it must still be on, so that a future change or a leaked publishable key doesn't leave the database wide open.

| Table | Frontend (no direct access) | Backend (secret key) |
|---|---|---|
| `users` | none | full |
| `quotes` | none | full |
| `positions` | none | full |
| `position_events` | none | full |

Policies should still be written as if a low-privilege client existed. If we ever expose a publishable key, the database must already be safe — not made safe afterwards.

**All reads and writes go through the backend using the secret key.** The frontend never talks to Supabase at all — it only calls our API. This is simpler to secure and matches the custodial model: the frontend is a view, not an actor.

> We use Supabase's **new API key format** (`sb_publishable_...` / `sb_secret_...`). The legacy `anon` and `service_role` JWT keys are deprecated by the end of 2026, and a new project should not start on them. A further benefit: multiple secret keys can exist, so a leaked one can be revoked individually instead of regenerating the whole JWT secret.

**Verify it:** after enabling RLS, query each table with a publishable key and confirm you get nothing you shouldn't. Assuming RLS works is how databases leak.

---

## Migrations — how and why

Your friend is right, and this is worth doing properly.

**A migration is a numbered SQL file describing one change.** Applied in order, they rebuild the exact schema on any machine.

```
supabase/
  migrations/
    20260829120000_create_users.sql
    20260829120100_create_quotes.sql
    20260829120200_create_positions.sql
    20260829120300_create_position_events.sql
    20260829120400_enable_rls.sql
```

### The one rule

**Never edit a migration that has already been applied. Ever.**

Need a change? Write a new file:

```sql
-- 20260901093000_add_referrer_to_positions.sql
alter table positions add column referrer text;
```

Editing an applied file means your machine and the server silently diverge — and you won't find out until something breaks in a way that makes no sense.

### Why it matters here specifically

- **Reproducibility** — a teammate or a fresh server runs the migrations and gets an identical database. Nobody hand-creates tables and forgets a column.
- **History** — the folder *is* the change log. "When did we add that column and why" is answerable.
- **AI context** — an assistant reading `supabase/migrations/` knows the true current schema. Without it, it guesses at column names and writes code against tables that don't exist. This is exactly the failure mode your friend is warning about.
- **Rollback** — you can see precisely what changed when something breaks.

### Rules for this project

| Rule | Detail |
|---|---|
| One logical change per file | Easier to read, easier to reverse |
| Filename: `YYYYMMDDHHMMSS_description.sql` | Timestamp guarantees ordering |
| Always committed to git | The schema is part of the codebase |
| Never edit an applied migration | Add a new one instead |
| Include RLS policies in migrations | Security shouldn't live only in the dashboard UI |
| Comment non-obvious constraints | Future-you won't remember why |

> ⚠️ **Supabase caveat:** changing tables through the web dashboard does **not** create a migration file. If anyone edits the schema by clicking around, the migration folder and the real database diverge and the whole system stops being trustworthy. **All schema changes go through migration files.** Tell the team this before they discover the table editor.

---

## Open questions for review

1. **How many demo users?** One is simpler; two proves the ownership mapping visibly. Suggest two.
2. **Do we keep `quotes` at all?** Cutting it saves a table but loses the audit trail of what was shown before a purchase. Suggest keeping — it's cheap and it's where "why did we buy that" gets answered.
3. **Store premium in USDC only, or also a display currency?** USDC only is simpler. A display currency is nicer for the "my rent is in AUD" pitch. Suggest USDC only, with conversion in the UI.
4. **Retention:** nothing gets deleted during the hackathon. Fine as is, but worth stating.