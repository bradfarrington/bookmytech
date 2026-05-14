# Data Model

Supabase Postgres schema for Book My Tech. Row Level Security (RLS) is enabled on every table — every query must respect the policies defined here.

> **READ THE RLS PATTERNS SECTION BEFORE YOU WRITE A POLICY.** We've hit two non-obvious Postgres-RLS traps already (infinite recursion via inline subqueries, and "new row violates RLS" on UPDATE when the new state hides the row from SELECT). Both are documented under "RLS patterns to follow" below with concrete templates. Copy from those.

## Current schema (as of Task 02 Stage 4)

Tables: `profiles`, `services`, `service_categories`, `bookings`. More will be added as later tasks need them (`mechanics`, `payments`, `reviews`, `disputes`).

### `profiles`

Extends Supabase's built-in `auth.users` with role and contact info.

| Column      | Type        | Notes                                           |
|-------------|-------------|-------------------------------------------------|
| id          | uuid PK     | References `auth.users(id)`, cascades on delete |
| role        | user_role   | enum: 'customer' \| 'mechanic' \| 'admin'       |
| full_name   | text        | nullable                                        |
| phone       | text        | nullable                                        |
| created_at  | timestamptz | default now()                                   |
| updated_at  | timestamptz | default now()                                   |

A trigger (`handle_new_user`) auto-inserts a profile with role='customer' whenever a new `auth.users` row is created. Admins are promoted manually via SQL.

### `services`

The bookable services catalogue. Admin manages these; booking flow reads them.

| Column                | Type        | Notes                                       |
|-----------------------|-------------|---------------------------------------------|
| id                    | uuid PK     | default gen_random_uuid()                   |
| name                  | text        | e.g. "Full Service", "Diagnostic"           |
| slug                  | text UNIQUE | URL-safe identifier; auto-generated from name on create, stable on edit |
| description           | text        | nullable                                    |
| starting_price_pence  | integer     | store money in pence, never floats          |
| category              | text        | soft-FK slug → `service_categories.slug`    |
| is_active             | boolean     | default true; soft delete via this flag     |
| display_order         | integer     | default 0; controls order in booking flow   |
| created_at            | timestamptz | default now()                               |
| updated_at            | timestamptz | default now()                               |

### `service_categories`

Admin-managed list of categories that services are grouped under. Added in Task 02 Stage 4.

| Column        | Type        | Notes                                                              |
|---------------|-------------|--------------------------------------------------------------------|
| id            | uuid PK     | default gen_random_uuid()                                          |
| name          | text        | e.g. "Brakes"                                                      |
| slug          | text UNIQUE | URL-safe identifier; auto-generated from name on create, stable on edit |
| description   | text        | nullable; internal admin note                                      |
| display_order | integer     | default 0; controls order in admin dropdowns                       |
| is_active     | boolean     | default true; inactive categories are hidden from new-service form |
| created_at    | timestamptz | default now()                                                      |
| updated_at    | timestamptz | default now()                                                      |

`services.category` stores the **slug** of a row in `service_categories`. It's deliberately a soft reference (no FK constraint) so renaming a category's display name is free and `services` rows never need migrating. Slugs are kept stable on edit (the admin UI never updates them) to protect this reference. Hard-deleting a category is blocked by the admin UI when services reference it; soft-delete via `is_active` is the safe default.

### `bookings`

The core transaction record.

| Column           | Type        | Notes                                    |
|------------------|-------------|------------------------------------------|
| id               | uuid PK     | default gen_random_uuid()                |
| customer_id      | uuid FK     | → profiles(id), nullable for guest flows |
| mechanic_id      | uuid FK     | → profiles(id), nullable until assigned  |
| service_id       | uuid FK     | → services(id), required                 |
| vehicle_reg      | text        | UK reg plate                             |
| vehicle_make     | text        | from DVLA lookup                         |
| vehicle_model    | text        | from DVLA lookup                         |
| postcode         | text        | customer's postcode                      |
| scheduled_at     | timestamptz | nullable until slot picked               |
| status           | text        | 'pending' \| 'confirmed' \| etc.         |
| total_pence      | integer     | final price                              |
| created_at       | timestamptz | default now()                            |
| updated_at       | timestamptz | default now()                            |

## RLS policies in effect

A `public.is_admin()` `SECURITY DEFINER` function is the single source of truth for "is the current user an admin?" used by every admin policy. Definition lives in `supabase/migrations/0002_service_categories.sql` for fresh-environment safety.

**`profiles`**
- `SELECT`: `Users can view own profile` — `using (auth.uid() = id)`
- `INSERT`: `Profiles can be created on signup` — `with check (auth.uid() = id)`
- ❌ **No "admins can read all profiles" policy.** See RLS pattern #1 below — if you need one in the future, build it via a different `SECURITY DEFINER` helper (not an inline subquery on `profiles`).

**`services`**
- `SELECT`: `Services are viewable by everyone` — `using (is_active = true)` (public, anon)
- `SELECT`: `Admins can view all services` — `using (public.is_admin())` (admin override — required, see pattern #2)
- `INSERT`: `Admins can insert services` — `with check (public.is_admin())`
- `UPDATE`: `Admins can update services` — `using (public.is_admin()) with check (public.is_admin())`
- `DELETE`: `Admins can delete services` — `using (public.is_admin())`

**`service_categories`**
- `SELECT`: `Categories are viewable by everyone` — `using (is_active = true)`
- `SELECT`: `Admins can view all categories` — `using (public.is_admin())`
- `INSERT`: `Admins can insert categories` — `with check (public.is_admin())`
- `UPDATE`: `Admins can update categories` — `using (public.is_admin()) with check (public.is_admin())`
- `DELETE`: `Admins can delete categories` — `using (public.is_admin())`

**`bookings`** — not yet defined. Will be added at the booking-flow task. Customers will read their own; mechanics will read assigned ones; admins read all (use `public.is_admin()` per pattern #1).

## RLS patterns to follow

We've burned hours on two non-obvious Postgres-RLS traps. Both have canonical workarounds — use these templates verbatim when adding tables.

### Pattern #1 — Admin role check via `SECURITY DEFINER` function

**Don't** write `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')` inline inside an RLS policy. Two reasons:

1. **Infinite recursion** if the policy is *on* `profiles` itself: evaluating the subquery applies `profiles`' policies, which evaluate the subquery, which… → `42P17 infinite recursion detected in policy for relation "profiles"`.
2. **Performance:** the subquery re-evaluates per row.

**Do** use `public.is_admin()` — a `SECURITY DEFINER` function that bypasses RLS for the role lookup and can be marked `stable` so Postgres caches the result per query:

```sql
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;
```

Then in every admin policy: `using (public.is_admin())` (or `with check (public.is_admin())` for INSERT/UPDATE).

### Pattern #2 — Tables with "public sees active, admin manages all" need **two** SELECT policies

This is the trap that bit us on `services.is_active` toggling. Postgres has an implicit rule on `UPDATE`: **the new row state must remain visible via at least one applicable SELECT policy after the update**. If your only SELECT policy is `using (is_active = true)`, an admin toggling a service to `is_active = false` makes the new row invisible to that policy → Postgres throws `42501 new row violates row-level security policy`.

**Always pair a public-visibility policy with an admin-visibility policy on any soft-delete table.** Postgres ORs SELECT policies, so this just expands what admins can read — public users still only see active rows.

Template for any new table that follows the soft-delete pattern:

```sql
alter table my_table enable row level security;

-- Public can see active rows
create policy "My_table viewable by everyone" on my_table
  for select
  using (is_active = true);

-- Admins can see everything (active + inactive). REQUIRED for admin
-- UPDATEs that set is_active=false — without this, the update fails RLS.
create policy "Admins can view all my_table" on my_table
  for select
  using (public.is_admin());

-- Admin writes
create policy "Admins can insert my_table" on my_table
  for insert
  with check (public.is_admin());

create policy "Admins can update my_table" on my_table
  for update
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins can delete my_table" on my_table
  for delete
  using (public.is_admin());
```

If a table doesn't have `is_active` (e.g. `bookings` will gate by `customer_id = auth.uid()` etc.), this trap doesn't apply — but think through the "new row state must remain visible" rule when designing any policy.

## Conventions

**Money is stored as integer pence**, never `numeric(10,2)` or float. £45.99 = `4599`. Format for display in the UI layer with a helper like `formatPrice(4599) → "£45.99"`.

**Timestamps are `timestamptz`**, never `timestamp` or `date`. Always store in UTC. Format with `date-fns` in the UI.

**UUIDs everywhere for primary keys.** Generated by Postgres via `gen_random_uuid()` — don't generate them client-side unless you specifically need to (rare).

**Soft delete via `is_active`**, not actual `DELETE`. Audit trail matters; once a service has been used in bookings, hard-deleting it would orphan those records.

**Every table has `created_at` and `updated_at`.** No exceptions.

## How to evolve the schema

When a task needs new tables or columns:

1. Write the migration as a SQL file in `supabase/migrations/` (numbered sequentially, e.g. `0003_mechanics.sql`)
2. **For any new table:** start from the templates in "RLS patterns to follow" above. Don't hand-write policies from scratch.
3. Run the migration in the Supabase SQL editor against your project
4. Update this doc to reflect the new schema (both the table definition AND the RLS section)
5. Commit both the migration file and the doc update in the same commit

Never modify the schema only in the dashboard without committing the SQL — you'll lose change history and it won't reproduce in a fresh environment.
