# Data Model

Supabase Postgres schema for Book My Tech. Row Level Security (RLS) is enabled on every table — every query must respect the policies defined here.

> **READ THE RLS PATTERNS SECTION BEFORE YOU WRITE A POLICY.** We've hit two non-obvious Postgres-RLS traps already (infinite recursion via inline subqueries, and "new row violates RLS" on UPDATE when the new state hides the row from SELECT). Both are documented under "RLS patterns to follow" below with concrete templates. Copy from those.

## Current schema (as of Task 04 Stage 1)

Tables: `profiles`, `services`, `service_categories`, `bookings`, `mechanics`, `booking_events`. More will be added as later tasks need them (`payments`, `reviews`, `disputes`, `platform_settings`).

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

The core transaction record. The columns below the first divider were added in `0003_booking_flow.sql` (guest bookings + Stripe pre-auth); the columns below the second divider were added in `0004_mechanics_and_booking_lifecycle.sql` (lifecycle timestamps + derived area).

| Column                     | Type        | Notes                                                                 |
|----------------------------|-------------|-----------------------------------------------------------------------|
| id                         | uuid PK     | default gen_random_uuid()                                             |
| customer_id                | uuid FK     | → profiles(id), nullable for guest flows                              |
| mechanic_id                | uuid FK     | → profiles(id), nullable until assigned                               |
| service_id                 | uuid FK     | → services(id), required                                              |
| vehicle_reg                | text        | UK reg plate                                                          |
| vehicle_make               | text        | from DVLA lookup                                                      |
| vehicle_model              | text        | from DVLA + DVSA MOT enrichment                                       |
| postcode                   | text        | customer's postcode (uppercased on insert)                            |
| scheduled_at               | timestamptz | nullable until slot picked                                            |
| status                     | text        | CHECK-constrained — see "Status lifecycle" below                      |
| total_pence                | integer     | final price                                                           |
| created_at                 | timestamptz | default now()                                                         |
| updated_at                 | timestamptz | default now()                                                         |
| —                          |             | *added in 0003_booking_flow.sql*                                      |
| stripe_payment_intent_id   | text        | Stripe PaymentIntent id; pre-auth with `capture_method: 'manual'`     |
| customer_email             | text        | guest-booking lookup key (RLS matches `auth.email()` once signed up)  |
| customer_name              | text        | guest-booking name (no profile yet)                                   |
| address_line_1             | text        | street address                                                        |
| address_line_2             | text        | optional second line                                                  |
| parking_type               | text        | `'driveway' \| 'street' \| 'car_park' \| 'other'`                     |
| special_instructions       | text        | free-text from the customer                                           |
| —                          |             | *added in 0004_mechanics_and_booking_lifecycle.sql*                   |
| area                       | text        | postcode district (outward code), derived by trigger from `postcode`  |
| en_route_at                | timestamptz | when the mechanic started travelling                                  |
| started_at                 | timestamptz | when the mechanic arrived / began work                                |
| completed_at               | timestamptz | when the mechanic marked the job done                                 |

**Status lifecycle:** CHECK constraint pins `status` to one of:

| Value                | Meaning                                                                |
|----------------------|------------------------------------------------------------------------|
| `sourcing_mechanic`  | PI authorised, no mechanic assigned yet. **Default on insert.**        |
| `confirmed`          | Mechanic accepted the job                                              |
| `en_route`           | Mechanic on the way                                                    |
| `in_progress`        | Mechanic on site, working                                              |
| `completed`          | Mechanic marked complete, customer signed off                          |
| `cancelled`          | Cancelled (by customer, admin, or PI auto-released)                    |
| `disputed`           | Flagged by customer for admin review                                   |

Status transitions and the timestamps in the second block are written through `app/actions/bookings.ts` (admin) and `app/actions/mechanic-bookings.ts` (mechanic, Task 05). Every transition writes a `booking_events` row.

**Area derivation:** `area` is a trigger-managed column — never write it directly. `BEFORE INSERT OR UPDATE OF postcode` calls `public.derive_postcode_district()` which returns the outward code (`"SE15 5DT"` → `"SE15"`). This lets the admin demand chart group bookings by district without parsing postcodes at query time.

**Guest-booking confirmation read:** `/book/confirmed/[id]` uses the service-role client (`lib/supabase/admin.ts`) — guests have no auth session, so the customer-scoped SELECT policy below would block the read. Lookup is by full UUID and surfaces only what the confirmation email already contains.

### `mechanics`

Extends `profiles` (1:1 by `id`) with marketplace-specific fields. A row exists for every user with `role = 'mechanic'`. Created in `0004_mechanics_and_booking_lifecycle.sql`.

| Column                | Type           | Notes                                                                |
|-----------------------|----------------|----------------------------------------------------------------------|
| id                    | uuid PK / FK   | → profiles(id), cascades on delete                                   |
| status                | text           | CHECK in `('offline', 'online', 'on_job')`, default `'offline'`      |
| service_radius_miles  | integer        | CHECK between 1 and 100, default 10                                  |
| base_postcode         | text           | mechanic's home base — drives dispatch matching (Task 05)            |
| bio                   | text           | nullable, shown to customers post-assignment                         |
| specialisms           | text[]         | array of service slugs the mechanic is qualified for                 |
| rating                | numeric(3,2)   | CHECK 0–5, derived from completed-job reviews (Task 11 wires this)   |
| job_count             | integer        | cumulative completed-job count, incremented on completion            |
| is_pro                | boolean        | Pro-tier flag (Task 11) — defaults false, ignored elsewhere          |
| approved_at           | timestamptz    | nullable until admin (or onboarding flow) approves the mechanic      |
| created_at            | timestamptz    | default now()                                                        |
| updated_at            | timestamptz    | maintained by `public.touch_updated_at` trigger                      |

**Status meaning:** `'offline'` = not taking jobs; `'online'` = available for dispatch; `'on_job'` = currently assigned to an in-progress booking. The mechanic toggles this from their dashboard (Task 05); admin can override.

### `booking_events`

Append-only audit log for every meaningful change on a booking. Powers the admin booking-detail timeline and gives us a real audit trail for the eventual disputes flow (Task 12). Created in `0005_booking_events.sql`.

| Column        | Type         | Notes                                                                       |
|---------------|--------------|-----------------------------------------------------------------------------|
| id            | uuid PK      | default gen_random_uuid()                                                   |
| booking_id    | uuid FK      | → bookings(id), cascades on delete                                          |
| event_type    | text         | CHECK in the enum below                                                     |
| actor_id      | uuid FK      | → profiles(id), nullable (system-generated events have no actor)            |
| actor_role    | text         | CHECK in `('customer', 'mechanic', 'admin', 'system')` or null              |
| reason        | text         | free-text reason for cancellations, disputes, reassignments                 |
| payload       | jsonb        | structured extras (`{ from: 'confirmed', to: 'en_route' }` etc.)            |
| created_at    | timestamptz  | default now()                                                               |

**Event types:** `'created' | 'status_changed' | 'mechanic_assigned' | 'mechanic_reassigned' | 'cancelled' | 'disputed' | 'payment_authorised' | 'payment_captured' | 'note'`.

**Append-only.** Never UPDATE or DELETE rows here — if a fact about an event was wrong, write a corrective event (typically `'note'`). The composite index on `(booking_id, created_at desc)` supports the timeline render.

### `mechanic_applications`

Backs the public `/mechanics/apply` wizard and the `/admin/approvals` queue. Created in `0013_mechanic_applications.sql` (Task 07 Stage 1). The row is inserted only on final submit; documents are uploaded to the **private** `mechanic-docs` storage bucket before submit (under a client-generated draft UUID) and their object keys land in the `doc_*` columns. Bank details are **AES-256-GCM encrypted** at the application level (`lib/crypto/encrypt.ts`, key in `APP_ENCRYPTION_KEY`) — never plain text.

Key columns: contact (`email` UNIQUE, `full_name`, `phone`, `postcode`, `years_experience`); business (`business_type` ∈ `sole_trader`/`limited_company`, `business_name`, `business_number`, `vat_registered`); `specialisms text[]`, `service_radius_miles`; document keys (`doc_photo_id`, `doc_public_liability_insurance`, `doc_trade_insurance`, `doc_qualification`, `doc_vat`); `bank_sort_code_encrypted`, `bank_account_number_encrypted`; two references (`reference_1_*`, `reference_2_*`); workflow (`status`, `grace_period_ends_at`, `rejection_reason`, `needs_info_note`, `resubmit_token`, `submitted_at`, `reviewed_at`, `reviewed_by`).

**Status:** `'submitted' | 'under_review' | 'approved' | 'approved_with_grace' | 'rejected' | 'needs_info'`. `approved_with_grace` = admin override: mechanic goes live immediately but `grace_period_ends_at = now() + 28 days`; if unresolved by then they're auto-suspended from dispatch.

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

**`bookings`** — defined in `0003_booking_flow.sql`.
- `INSERT`: `Anyone can create a booking` — `with check (true)` (guest + signed-in flows; anti-spam will move to a separate gate later)
- `SELECT`: `Customers can view own bookings` — `using (auth.uid() = customer_id or (customer_id is null and auth.email() = customer_email))` (guest bookings flip to email-match once the customer signs up under the same address)
- `UPDATE`: `Customers can update own bookings` — same `using`/`with check` as the SELECT (intended for cancel/reschedule status updates)
- `SELECT`: `Admins can view all bookings` — `using (public.is_admin())`
- `UPDATE`: `Admins can update all bookings` — `using (public.is_admin()) with check (public.is_admin())`
- ❌ **No mechanic-side policies yet.** Added when the mechanic dashboard lands (task 05).
- The confirmation page uses the service-role client (see `lib/supabase/admin.ts`) to bypass these for the post-booking redirect read.

**`mechanics`** — defined in `0004_mechanics_and_booking_lifecycle.sql`.
- `SELECT`: `Mechanics can view own record` — `using (auth.uid() = id)`
- `SELECT`: `Admins can view all mechanics` — `using (public.is_admin())`
- `INSERT`: `Admins can insert mechanics` — `with check (public.is_admin())` (manual creation only until proper onboarding lands in task 07)
- `UPDATE`: `Admins can update mechanics` — `using (public.is_admin()) with check (public.is_admin())`
- `UPDATE`: `Mechanics can update own status` — `using (auth.uid() = id) with check (auth.uid() = id)` (lets the mechanic toggle online/offline/on_job from their dashboard without admin involvement)
- `DELETE`: `Admins can delete mechanics` — `using (public.is_admin())`

**`booking_events`** — defined in `0005_booking_events.sql`. Append-only — there's no UPDATE or DELETE policy.
- `SELECT`: `Admins can view all booking events` — `using (public.is_admin())`
- `INSERT`: `Admins can insert booking events` — `with check (public.is_admin())` (server actions run under the admin's session; system-generated events are written via the service-role client)
- `SELECT`: `Customers can view events on own bookings` — `using (exists (select 1 from bookings b where b.id = booking_events.booking_id and (b.customer_id = auth.uid() or (b.customer_id is null and b.customer_email = auth.email()))))` (cross-table EXISTS is safe — `booking_events` ≠ `bookings`, so no recursion. Composite index on `(booking_id, created_at desc)` supports the lookup.)
- ❌ **No mechanic-side policy yet.** Added in Task 05 when the assigned-mechanic relationship is wired through.

**`mechanic_applications`** — defined in `0013_mechanic_applications.sql`. Admin-only table; applicant-facing reads/writes go through the **service-role client** in server actions (applicants are guests with no session), so only admin policies exist. There is intentionally **no public SELECT or INSERT** — the rows hold PII.
- `SELECT`: `Admins can view all applications` — `using (public.is_admin())`
- `UPDATE`: `Admins can update applications` — `using (public.is_admin()) with check (public.is_admin())`
- Documents live in the **private** `mechanic-docs` bucket (`public = false`). No per-object storage policies: uploads are service-role (in `submit-application.ts`); admins read via 1-hour signed URLs minted in `approvals.ts`.

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
