# Data Model

Supabase Postgres schema for Book My Tech. Row Level Security (RLS) is enabled on every table — every query must respect the policies defined here.

> **READ THE RLS PATTERNS SECTION BEFORE YOU WRITE A POLICY.** We've hit two non-obvious Postgres-RLS traps already (infinite recursion via inline subqueries, and "new row violates RLS" on UPDATE when the new state hides the row from SELECT). Both are documented under "RLS patterns to follow" below with concrete templates. Copy from those.

## Current schema (as of Task 04 Stage 1)

Tables: `profiles`, `bookings`, `mechanics`, `booking_events`. More were added as later tasks needed them (`platform_settings`, `reviews`, `disputes`, `parts`, `areas`, HaynesPro caches, …) — see the migrations. **The services catalogue is gone** (Task 17, migration `0040`): `services`, `service_categories`, `service_area_prices`, `service_parts`, `service_time_mappings` and `service_vehicle_exclusions` were all dropped. Every booking is a HaynesPro repair identified by `bookings.repair_node_id` + `repair_description`.

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

### `services` / `service_categories` — REMOVED (Task 17)

Dropped by migration `0040_remove_services.sql` along with every service-keyed
table (`service_area_prices`, `service_parts`, `service_time_mappings`,
`service_vehicle_exclusions`). Bookings carry their own display name in
`repair_description` (backfilled from the old service names), so nothing joins
`services` any more. NB `public.is_admin()` was defined in
`0002_service_categories.sql` and survives the table drop — fresh environments
still run 0002 for it.

### `bookings`

The core transaction record. The columns below the first divider were added in `0003_booking_flow.sql` (guest bookings + Stripe pre-auth); the columns below the second divider were added in `0004_mechanics_and_booking_lifecycle.sql` (lifecycle timestamps + derived area).

| Column                     | Type        | Notes                                                                 |
|----------------------------|-------------|-----------------------------------------------------------------------|
| id                         | uuid PK     | default gen_random_uuid()                                             |
| customer_id                | uuid FK     | → profiles(id), nullable for guest flows                              |
| mechanic_id                | uuid FK     | → profiles(id), nullable until assigned                               |
| repair_node_id             | text        | HaynesPro repair-tree node id (0038); the booking's identity          |
| repair_description         | text        | display name, e.g. "Renew the front brake pads" (0038; 0040 backfilled legacy rows). On a multi-job booking (Task 24) a summary: "Renew the alternator + 2 more jobs"; `repair_node_id` is then the first job and the lines live in `booking_repairs` |
| combine_source             | text        | 0055 — how a multi-job booking's time was derived: `sum` (each job's book time added — the default, `platform_settings.repair_combine_mode`) / `haynespro` (basket calculation removed the overlap; admin opt-in) / null (one job / pre-Task-24) |
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
| specialisms           | text[]         | informational specialism slugs (static list in `lib/specialisms.ts`); dispatch does NOT filter on them |
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

**Event types** (CHECK last widened in `0052`): `'created' | 'status_changed' | 'mechanic_assigned' | 'mechanic_reassigned' | 'reschedule_proposed' | 'reschedule_accepted' | 'reschedule_declined' | 'arrival_window_set' | 'cancelled' | 'disputed' | 'dispute_opened' | 'dispute_responded' | 'dispute_escalated' | 'dispute_resolved' | 'resolution_opened' | 'resolution_redistributed' | 'payment_authorised' | 'payment_captured' | 'payment_refunded' | 'payout_transferred' | 'payout_reversed' | 'message_sent' | 'note'`. `arrival_window_set` (Task 21) records a mechanic narrowing an all-day booking — payload `{ from_window, to_window, from, to, day }`; the booking's own `slot_window`/`scheduled_at` are updated in place.

**Append-only.** Never UPDATE or DELETE rows here — if a fact about an event was wrong, write a corrective event (typically `'note'`). The composite index on `(booking_id, created_at desc)` supports the timeline render.

### `notification_toggles`

Admin on/off switches for each SMS and email template (Task 22, `0053_notification_toggles.sql`). Primary key `(channel, key)`, `channel` ∈ `'sms' | 'email'`, `enabled boolean default true`, `updated_at`, `updated_by`. **A key with no row is ON.** Service-role only (RLS enabled, no policies). Read through `lib/notifications/toggles.ts` (60 s per-instance cache, fails open) by `renderTemplateEmail` and `getSmsTemplateBody`; written by `setSmsTemplateEnabled` / `setEmailTemplateEnabled`. Kept separate from `sms_templates` / `email_templates` because those hold overrides only and "reset" deletes the row.

### `repair_vehicle_exclusions`

Which HaynesPro repairs customers can book (Task 16 Stage G, `0039`; global scope + overrides in Task 23, `0054`). **No row = bookable.** Columns: `make_name`, `model_name` (HaynesPro names, stable across their quarterly updates — the numeric ids are not), `node_id` (repair-tree node, group or timed leaf; the same id is the same job on every make, verified live 2026-09-04), `description` (label snapshot for admin display), `mode` ∈ `'hide' | 'show'` (default `'hide'`), `created_at`. Unique on `(make_name, model_name, node_id)`.

Three kinds of row: `('*', '*', node, 'hide')` hides the node for **every vehicle**; `(make, model, node, 'hide')` hides it for that model; `(make, model, node, 'show')` is a per-model **override** that re-enables a node hidden for all vehicles. Effective hidden set = (global hides − the model's `show` rows) ∪ the model's `hide` rows — `lib/haynespro/exclusions.ts` is the single matcher for the customer browser, the search walker and `quoteRepair`. Partial wildcards match nothing and the action refuses to write them; a `show` row without a global hide behind it does nothing and is deleted when the global hide is lifted. Fails open: an unresolvable vehicle still gets the global hides; an unreadable table hides nothing. RLS: admin SELECT; writes via the service-role client from `app/actions/vehicle-exclusions.ts`.

### `booking_repairs` — `0055`

The job lines of a booking with several HaynesPro repairs (Task 24). Columns: `booking_id` (→ `bookings`, cascade), `position`, `node_id`, `description` (snapshot of the HaynesPro name at booking time, like `booking_parts.part_name`), `raw_hours` (the job's own book time), `charged_hours` (what it was charged at — equal to `raw_hours` in the default "add each job" mode; after overlap removal, 0 = covered by another job, in the HaynesPro mode), `line_pence` (`charged_hours × rate`, informational: lines need not sum to `total_pence` because the 1-hour minimum applies once to the visit), `created_at`; from `0056`, `item_id` / `item_label` — the combined repair (Task 26) a job came from, null for a job booked on its own. Unique on `(booking_id, node_id)`; index on `(booking_id, position)`.

**No rows = a single-job booking** (every booking before this task, and every one-job booking after it): its job is on the `bookings` row as before. Readers go through `lib/bookings/repair-lines.ts` `repairLinesFor()`, which returns the rows or one synthetic line. `bookings.service_duration_hours` holds the billed hours for the **whole visit** (arrival-window clash detection reads it). RLS: SELECT only — the booking's customer (id or guest email), the assigned mechanic, a mechanic holding a live `job_offers` row (the offer screen lists the jobs before acceptance), admins; written only by the service-role client in `lib/bookings/create-booking.ts`.

### The repair catalogue overlay — `0056` (Task 26)

Our layer over HaynesPro's repair tree; HaynesPro stays the source of every job and time. Keyed on HaynesPro node ids, which mean the same job on every make, so one overlay applies to every vehicle. `parent_id` values are `'root'`, a HaynesPro group id, or `g:<uuid>` (one of our categories).

- **`repair_catalogue_groups`** — a category we created: `name`, `parent_id`, `display_order`. Customers see it as a group with id `g:<uuid>`.
- **`repair_catalogue_overrides`** — per HaynesPro node (`node_id` PK, `kind` group/repair, `description` snapshot): `custom_name` (our name) and/or `parent_id` (where it now lives; null = where HaynesPro lists it). A row with neither is deleted.
- **`repair_bundles`** — a combined repair: `name`, `parent_id`, `is_active`, and `node_ids text[]` — the pool of HaynesPro jobs the admin added once. Listed like a category's child.
- **`repair_bundle_options`** — its bookable options (`label`, `node_ids text[]` — a subset of the bundle's pool, `position`; cascade on the bundle). Customers see id `b:<uuid>`; the quote expands it to its jobs and keeps the option on each `booking_repairs` line as `item_id` / `item_label`. Removing a job from the pool removes it from every option.

Read server-side by `lib/catalogue/load-overlay.ts` (empty on any error, so the catalogue is HaynesPro's until the migration exists); composed by `lib/catalogue/overlay.ts`. Written only by `app/actions/repair-catalogue.ts`. RLS: admin SELECT on all four (parity with `repair_vehicle_exclusions`); no other policies.

### `mechanic_applications`

Backs the public `/mechanics/apply` wizard and the `/admin/approvals` queue. Created in `0013_mechanic_applications.sql` (Task 07 Stage 1). The row is inserted only on final submit; documents are uploaded to the **private** `mechanic-docs` storage bucket before submit (under a client-generated draft UUID) and their object keys land in the `doc_*` columns. Bank details are **AES-256-GCM encrypted** at the application level (`lib/crypto/encrypt.ts`, key in `APP_ENCRYPTION_KEY`) — never plain text.

Key columns: contact (`email` UNIQUE, `full_name`, `phone`, `postcode`, `years_experience`); business (`business_type` ∈ `sole_trader`/`limited_company`, `business_name`, `business_number`, `vat_registered`); `specialisms text[]`, `service_radius_miles`; document keys (`doc_photo_id`, `doc_public_liability_insurance`, `doc_trade_insurance`, `doc_qualification`, `doc_vat`); `bank_sort_code_encrypted`, `bank_account_number_encrypted`; two references (`reference_1_*`, `reference_2_*`); workflow (`status`, `grace_period_ends_at`, `rejection_reason`, `needs_info_note`, `resubmit_token`, `submitted_at`, `reviewed_at`, `reviewed_by`).

**Status:** `'submitted' | 'under_review' | 'approved' | 'approved_with_grace' | 'rejected' | 'needs_info'`. `approved_with_grace` = admin override: mechanic goes live immediately but `grace_period_ends_at = now() + 28 days`; if unresolved by then they're auto-suspended from dispatch.

`0014_application_verification.sql` adds a `verification jsonb` map (e.g. `{ "doc_photo_id": true }`) recording the admin's manual per-item "verified" toggles, which override the auto-screen verdict in the approvals checklist.

### `mechanic_documents`

Active-mechanic document store for renewals (Task 07 Stage 3, `0015_mechanic_documents.sql`). One row per uploaded artifact: `mechanic_id` FK (→ `mechanics`, cascade), `doc_type` (`public_liability_insurance` | `trade_insurance` | `qualification` | `id` | `vat`), `file_url` (object key in the private `mechanic-docs` bucket, under `documents/{mechanic_id}/`), `expires_at date`, `status` (`pending_review` | `verified` | `rejected` | `expired`), `uploaded_at`, `reviewed_at`, `reviewed_by`, `created_at`, `updated_at`. On approval, the mechanic's application docs are seeded here as `verified`. Mechanic replacement uploads enter `pending_review`; admin approves/rejects. The daily `/api/cron/document-expiry` sweep emails the mechanic at 30/7/0 days, marks expired docs `expired`, and sets the mechanic **offline** when a dispatch-gating doc (insurance) expires.

### `mechanic_locations` — recorded in `0048` (live since 2026-07-30, migration written 2026-08-26)

One row per mechanic holding the **latest** fix, not a trail. Written by the mechanic's own app (separate repo); read by the customer app's map card over Realtime (`0049`).

| column | type | notes |
|---|---|---|
| `mechanic_id` | uuid PK → `mechanics.id` | |
| `lat`, `lng` | double precision, not null | |
| `accuracy_m`, `heading_deg`, `speed_mps` | real | nullable |
| `sharing_enabled` | boolean, default true | mechanic's switch |
| `updated_at` | timestamptz | **trigger-stamped on every write** — the five-minute read window is measured from it, so a client must not be able to set it |
| `created_at` | timestamptz | |

Purged after six hours by `purge_stale_mechanic_locations()` (pg_cron, hourly).

### `mechanic_cards` (view) — recorded in `0048`

What a customer may know about a mechanic: `id · full_name · avatar_url · rating · job_count · is_pro · bio · phone`. Filtered to mechanics on the caller's own bookings; `phone` is non-null only while that booking is `en_route`/`in_progress`. See RLS pattern #3.

### `dvla_vehicle_cache` — recorded in `0048`

Shared cache in front of DVLA VES + DVSA MOT, keyed on the normalised `reg` (`ves_details` jsonb, `ves_fetched_at`, `mot_model`, `mot_fetched_at`, timestamps). Service-role only. **Live and unused** as of 2026-08-26 — see Task 18 follow-ups.

### `customer_push_tokens` — `0050`

Expo push tokens for the customer app. `token` text PK, `customer_id` → `profiles`, `platform` (`ios`|`android`), `created_at`, `last_seen_at`. Keyed on the token so a phone that changes hands moves to its new owner on re-registration. Service-role only: written by `POST /api/mobile/v1/devices`, read by `lib/push/send.ts`.

### `push_receipts` — `0050`

Expo ticket ids awaiting a delivery receipt (`ticket_id` PK, `token`, `created_at`). `/api/cron/push-receipts` collects them and deletes tokens Expo reports as `DeviceNotRegistered`. Service-role only.

`profiles` also gained `reminder_via_push boolean not null default true` (`0050`), alongside the email/SMS flags from `0023`.

## RLS policies in effect

A `public.is_admin()` `SECURITY DEFINER` function is the single source of truth for "is the current user an admin?" used by every admin policy. Definition lives in `supabase/migrations/0002_service_categories.sql` for fresh-environment safety.

**`profiles`**
- `SELECT`: `Users can view own profile` — `using (auth.uid() = id)`
- `INSERT`: `Profiles can be created on signup` — `with check (auth.uid() = id)`
- ❌ **No "admins can read all profiles" policy.** See RLS pattern #1 below — if you need one in the future, build it via a different `SECURITY DEFINER` helper (not an inline subquery on `profiles`).

**`bookings`** — defined in `0003_booking_flow.sql`.
- `INSERT`: `Anyone can create a booking` — `with check (true)` (guest + signed-in flows; anti-spam will move to a separate gate later)
- `SELECT`: `Customers can view own bookings` — `using (auth.uid() = customer_id or (customer_id is null and auth.email() = customer_email))` (guest bookings flip to email-match once the customer signs up under the same address)
- `UPDATE`: `Customers can update own bookings` — same `using`/`with check` as the SELECT (intended for cancel/reschedule status updates)
- `SELECT`: `Admins can view all bookings` — `using (public.is_admin())`
- `UPDATE`: `Admins can update all bookings` — `using (public.is_admin()) with check (public.is_admin())`
- ❌ **No mechanic-side policies yet.** Added when the mechanic dashboard lands (task 05).

**`booking_repairs`** — defined in `0055_booking_repairs.sql` (Task 24). SELECT only:
- `Customers read own booking repairs` — the booking's `customer_id = auth.uid()`, or a guest booking on `auth.email()`
- `Mechanics read assigned booking repairs` — the booking's `mechanic_id = auth.uid()`
- `Mechanics read offered booking repairs` — a `job_offers` row for the booking with `mechanic_id = auth.uid()` (the offer screen, before acceptance)
- `Admins read all booking repairs` — `using (public.is_admin())`
- No INSERT/UPDATE/DELETE: rows are written by the service-role client alongside the booking.

**`repair_catalogue_groups`, `repair_catalogue_overrides`, `repair_bundles`, `repair_bundle_options`** — defined in `0056_repair_catalogue.sql` (Task 26). One SELECT policy each, `using (public.is_admin())`; read server-side through the service-role client, written only by admin actions.
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

**`mechanic_documents`** — defined in `0015_mechanic_documents.sql`. Mechanic reads/inserts own; admin reads/manages all (pattern #1 for the admin check; mechanic predicate is self-scoped).
- `SELECT`: `Mechanics view own documents` — `using (auth.uid() = mechanic_id)`
- `INSERT`: `Mechanics insert own documents` — `with check (auth.uid() = mechanic_id)` (storage write itself is service-role)
- `SELECT`: `Admins view all documents` — `using (public.is_admin())`
- `UPDATE`: `Admins update documents` — `using (public.is_admin()) with check (public.is_admin())` (approve/reject + expiry sweep)
- `DELETE`: `Admins delete documents` — `using (public.is_admin())`

**`mechanic_locations`** — defined in `0048_record_live_drift.sql`.
- `SELECT`: `Customers track their en-route mechanic` — `using (sharing_enabled and updated_at > now() - interval '5 minutes' and public.can_track_mechanic(mechanic_id))` — all three, always. `can_track_mechanic` is `SECURITY DEFINER` and true only for a booking of the caller's with this mechanic in status `en_route` (not `in_progress` — purpose limitation: once the mechanic is on site the position is no longer the customer's business). ⚠️ An UPDATE that takes the row *out* of this policy (sharing off, status moved on) emits **no** Realtime event; the app hides the marker after 60 s of silence for that reason.
- `SELECT`/`INSERT`/`UPDATE`/`DELETE`: `Mechanics … own location` — `auth.uid() = mechanic_id`
- `SELECT`: `Admins read all locations` — `using (public.is_admin())`
- Proved live by `scripts/verify-mechanic-visibility.mjs` — run it after touching any of this.

**`customer_push_tokens`, `push_receipts`, `dvla_vehicle_cache`** — RLS enabled, **no policies**. Service-role only by design; a push token is an address that must not be readable by anyone but us.

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

### Pattern #3 — A column allow-list via a view, when a policy would leak the row

RLS is **row-level**: a SELECT policy on `profiles` or `mechanics` that lets a customer see "their" mechanic grants every column on that row — `referral_code` (sign up against it and mint credit), `base_postcode`, `is_suspended`, the four `stripe_*` columns. Column-level RLS doesn't exist, and column `GRANT`s are per-role not per-row, so revoking `phone` from `authenticated` would stop every user reading their own number.

The answer is a **view** with an explicit column list, filtered by a `SECURITY DEFINER` predicate about the *caller*, running with its owner's privileges (the default — deliberately **not** `security_invoker`) so it can read the underlying tables past their policies:

```sql
create or replace view public.mechanic_cards as
select m.id, p.full_name, p.avatar_url, m.rating, m.job_count, m.is_pro, m.bio,
       case when public.has_live_booking_with_mechanic(m.id) then p.phone end as phone
from public.mechanics m
join public.profiles p on p.id = m.id
where public.has_booking_with_mechanic(m.id);
```

The underlying tables keep their self/admin-only policies. Add columns to the view only when a customer genuinely needs them — everything on it is readable by anyone who has ever booked that mechanic.

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
