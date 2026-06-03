# Task 05 — Mechanic dashboard (desktop web)

**Status:** ✅ Complete (2026-06-03). All six stages shipped — auth + light shell, jobs page (KPIs + live broadcast offers + dispatch), daily schedule timeline + free SVG service-area map, job-detail view (cancel + reschedule-propose; mechanic-side, with the customer accept/decline path + "replacement accepted" email stubbed for Task 09), earnings page (KPIs + recharts chart + seed payouts), and availability + profile settings (working hours, service-radius slider with live map, specialisms grid, profile edit + avatar upload to Supabase Storage). Cross-cutting deviation: every page lives under the `app/(mechanic)/mechanic/(shell)/` route group (URLs unchanged) so login stays outside the shell. ⚠️ Apply migrations `0007`–`0010` before testing.

> **Dispatch model correction (owner, 2026-06-01):** dispatch is **broadcast, first-to-accept** — the job is offered simultaneously to every eligible online mechanic whose service area covers the job address (matching specialism), and the first to Accept wins; the customer never picks a mechanic. There is **no** sequential "offer to closest, wait 60s, pass to next" and **no** auto-widening of radius. Offers stay open until accepted; the only escalation is to **notify the admin** if a booking is still unaccepted after a sensible threshold (minutes, not seconds — exact value TBD at Stage 2 build). The Stage 2 spec text below is superseded by this where they conflict.

Build the mechanic-facing desktop dashboard. By the end of this task, a mechanic can log in, see live job offers, accept or decline them, view their schedule and earnings, and update their availability.

## Why this task

Right now bookings get assigned to random fake mechanics with no way for those mechanics to actually receive, accept, or work the jobs. This task makes mechanics first-class users with their own surface.

The brief covers this in section 4. The desktop dashboard is the back-office tool; the mobile PWA (task 06) is for live field work.

## Goal

A mechanic can:
- Log in at `/mechanic/login`
- See `/mechanic/jobs` with KPIs, new job offers (with accept/decline + countdown), daily schedule, service-area map, weekly earnings chart
- Click into a job for full detail (notes, photos, parts, earnings breakdown)
- View earnings at `/mechanic/earnings`
- Set availability and service area at `/mechanic/availability`
- View their profile at `/mechanic/profile`

## Six sub-stages

---

### Stage 1 — Mechanic auth + shell

Mirror the admin auth pattern. Sidebar nav is lighter (not dark) for mechanic — bright workspace feel.

**Acceptance criteria:**

- [x] `/mechanic/login` — login form (re-uses the auth pattern from task 02, similar layout). `signInMechanic` action checks `role='mechanic'` and redirects to `/mechanic/jobs`.
- [x] `middleware.ts` updated: gate `/mechanic/*` to authenticated users with role='mechanic' (mirrors the admin gate; bounces signed-in mechanics off the login page to `/mechanic/jobs`)
- [x] Mechanic shell with light sidebar + top bar. **Deviation:** the shell lives at `app/(mechanic)/mechanic/(shell)/layout.tsx` (a route group), not `mechanic/layout.tsx`, so `/mechanic/login` stays outside the shell — same pattern as the admin `(shell)` group.
  - [x] Left sidebar (light theme, not dark): Jobs, Schedule, Earnings, Reviews, Availability, Profile, Documents
  - [x] Top bar: mechanic's name, online/offline toggle (updates `mechanics.status`), sign-out (sign-out is in the sidebar footer, mirroring admin)
- [x] Online/offline toggle is a real-time UI control — optimistic flip, `setOwnAvailability` server action writes `mechanics.status` + `online_at`/`last_seen_at` under the mechanic's own session (RLS "Mechanics can update own status"). `on_job` renders locked.
- [x] Placeholder pages for unbuilt nav items — all seven nav targets stubbed via `MechanicPlaceholderPage`; replaced stage-by-stage. `/mechanic` redirects to `/mechanic/jobs`.
- [x] Schema: `online_at` and `last_seen_at` timestamptz columns added to `mechanics` (`0007_mechanic_session_tracking.sql`). **⚠️ Apply 0007 before testing the toggle.**

**Files touched:**
- `app/(mechanic)/mechanic/login/page.tsx`
- `app/(mechanic)/mechanic/layout.tsx`
- `components/mechanic/sidebar.tsx`
- `components/mechanic/top-bar.tsx`
- `components/mechanic/online-toggle.tsx`
- `middleware.ts` (updated)
- `app/actions/mechanic-status.ts`

---

### Stage 2 — Jobs page: KPIs + new offers feed

The mechanic's home screen. Per the brief, four KPI cards across the top, then a live offers feed.

**KPI cards:**
1. **Today's earnings** — sum of completed jobs today (mechanic's share, after platform fee)
2. **Jobs this week** — completed count this week
3. **Acceptance rate** — accepted / (accepted + declined) over last 30 days
4. **Customer rating** — average rating from completed jobs

**New offers feed:**

- Live job offers within the mechanic's service radius that aren't yet assigned
- Each offer card shows: service name, vehicle reg + make/model, area (postcode district), distance ("3.2 mi"), scheduled time, mechanic earnings amount, expiry countdown (e.g. "expires in 47s")
- Accept and Decline buttons per offer
- New offers stream in via Supabase Realtime — auto-add to the top of the list as they appear

**Schema additions:**

```sql
create table job_offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  mechanic_id uuid not null references mechanics(id) on delete cascade,
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  response text, -- 'accepted' | 'declined' | 'expired'
  created_at timestamptz not null default now()
);

create index on job_offers (mechanic_id, expires_at) where response is null;
```

**Dispatch logic for this task:**

For now, keep it simple. When a booking is created, an offer is sent to the *closest online mechanic with the matching specialism*. If they decline or 60s passes without response, the offer expires and goes to the next closest. Implement this in a Supabase Edge Function triggered by booking insert.

This is a "v1 dispatch" — smart dispatch (multi-factor scoring, fallback queues) is task 09.

**Status: ✅ Stage 2 complete (2026-06-01).** Built to the **broadcast / first-to-accept** model (see the correction note at the top of this file), which supersedes the spec's sequential-dispatch wording below.

**Acceptance criteria:**

- [x] `app/(mechanic)/mechanic/(shell)/jobs/page.tsx` — main jobs view (server component; KPIs + offers feed)
- [x] Four KPI cards rendering real data — today's earnings (mechanic share via `lib/earnings.ts`), jobs this week (completed since Monday), 30-day acceptance rate (accepted/(accepted+declined)), customer rating (`mechanics.rating`, "—" until Task 11)
- [x] Offers feed renders live offers (those with `response is null`), newest first. **Deviation:** not "sorted by expiry" — there is no expiry in the broadcast model.
- [x] Realtime subscription: `subscribeToMyOffers` (filtered to the mechanic) refreshes the feed; new offers appear, and accepted/declined/superseded offers drop off. Needs replication on `job_offers` — migration 0008 adds it to the `supabase_realtime` publication.
- [x] Accept action (`acceptOffer`): atomic first-to-accept (guarded UPDATE on the still-`sourcing`/unassigned booking), assigns the mechanic, sets status `confirmed`, supersedes sibling offers, writes a `mechanic_assigned` event. Race-loser gets a friendly "another mechanic just accepted" + their offer is superseded.
- [x] Decline action (`declineOffer`): marks only that mechanic's offer `declined`. **Deviation (owner):** does NOT re-dispatch — every other eligible mechanic still holds their live offer (broadcast model).
- [x] ~~Edge function `dispatch-offer`~~ → **superseded.** Dispatch is a **server-side module** (`lib/dispatch/dispatch.ts`) called from `createBookingAction`, so it ships with the app on Vercel (no separate Deno/Supabase deploy). It broadcasts an offer to every eligible online mechanic: specialism match + job postcode inside `service_radius_miles` (geocoded via free **postcodes.io**, `lib/geo/postcodes.ts`, with same-district fallback when geocoding is unavailable).
- [x] ~~Expiry countdown~~ → **superseded** by an "offered Xm ago" label (`offer-card.tsx`, ticks every 30s). Offers stay live until accepted/cancelled.
- [x] **Admin escalation (owner model):** `/api/cron/dispatch-sweep` flags any booking still unaccepted after **5 minutes** (idempotent `dispatch_stalled` note event) and emails the admin a summary. Cron wired in `vercel.json` (`*/5 * * * *`). **⚠️ Vercel Hobby only runs crons daily — on Hobby, trigger via Supabase pg_cron / external scheduler hitting the route; protect with `CRON_SECRET`.**

**Schema:** `0008_job_offers.sql` — `job_offers` table + RLS (mechanic reads own, admin reads all; writes are service-role only), `bookings.commission_rate` (default 0.150, earnings read from here), mechanic-side SELECT policies on `bookings` (assigned + offered) and `booking_events` (assigned), `job_offers` added to the realtime publication. **⚠️ Apply 0008 before testing.**

**Files touched (actual):**
- `app/(mechanic)/mechanic/(shell)/jobs/page.tsx` + `_components/{kpi-cards,offer-feed,offer-card}.tsx`
- `app/actions/job-offers.ts`, `app/actions/create-booking.ts` (dispatch hook)
- `lib/dispatch/dispatch.ts`, `lib/geo/postcodes.ts`, `lib/earnings.ts`, `lib/supabase/realtime.ts` (added `subscribeToMyOffers`)
- `app/api/cron/dispatch-sweep/route.ts`, `vercel.json`
- `supabase/migrations/0008_job_offers.sql`

---

### Stage 3 — Daily schedule + service-area map

Runs alongside the offers feed on the jobs page.

**Daily schedule:**

- Vertical timeline showing today's confirmed jobs
- Each entry: time slot, service, customer, postcode, earnings
- Status dot per entry: done (green), next (blue, animated), future (grey), buffer (light)
- Click an entry → opens the job detail (built in stage 4)

**Service-area map:**

- Google Maps embed centred on the mechanic's base postcode
- Radius circle drawn at their `service_radius_miles`
- Customer pins for active bookings in the area
- "X mechanics active in this area" counter

**Status: ✅ Stage 3 complete (2026-06-01).**

**Acceptance criteria:**

- [x] Schedule timeline renders today's confirmed jobs, sorted by `scheduled_at`; each row links to the job detail (`/mechanic/jobs/[id]`, built in Stage 4). Earnings shown as the mechanic's share.
- [x] Status dots reflect actual booking status (completed = green, in_progress = pulsing blue, en_route = blue, confirmed = grey); the earliest upcoming job is flagged "Next up".
- [x] Map renders with radius circle + job pins. **Deviation (cost):** uses a free inline **SVG** map (no Google billing, no API key) instead of the Google Maps JS API — pins are projected from real lat/lng offsets (`lib/maps/project.ts`). Structured so a live Google/Leaflet layer can drop in later without touching dispatch or geocoding. Pins are the mechanic's own upcoming jobs (RLS-safe); the "X mechanics active" counter is replaced with "N upcoming jobs in your radius" since a mechanic can't see other mechanics under RLS.
- [x] ~~`GOOGLE_MAPS_API_KEY`~~ — **not needed** (no Google dependency). Can be added later if a live map is wanted.
- [x] Postcode → lat/lng resolved + cached — via free **postcodes.io** (`lib/geo/postcodes.ts`), in-process cache (built in Stage 2, reused here).

**Files touched (actual):**
- `app/(mechanic)/mechanic/(shell)/jobs/_components/schedule.tsx`
- `app/(mechanic)/mechanic/(shell)/jobs/_components/area-map.tsx` (client)
- `lib/maps/project.ts` (lat/lng→miles projection). Geocoding consolidated in `lib/geo/postcodes.ts` rather than a separate `lib/maps/geocode.ts`.
- `app/(mechanic)/mechanic/(shell)/jobs/page.tsx` (two-column layout + schedule/pin queries)

---

### Stage 4 — Job detail view

When a mechanic clicks into an offer or scheduled job.

**Layout (per brief section 4):**

- Status pill at the top (Confirmed / En route / In progress / Complete)
- Service headline: service name + vehicle + mileage (mileage estimated from DVLA data)
- Four info tiles: When, Distance, Estimated time (45–90 min by service), Mechanic earnings
- Customer notes (verbatim from special_instructions)
- Customer-uploaded photos (none yet — placeholder grid, real photo upload comes later)
- Parts allocated: name, supplier, cost (placeholder — parts system is task 10)
- Earnings breakdown: customer pays £X → parts cost £Y → platform fee £Z (commission rate) → mechanic receives £W
- "Why you're a great match" reasons card: postcode proximity, specialism match, rating (text-based for now)
- **Cancel job** and **Reschedule job** actions for confirmed jobs not yet in progress

**Cancel job flow (mechanic-initiated):**
1. Mechanic selects a reason (required)
2. Cancellation reason is saved against the job record and is visible in the mechanic's job history in both the admin console and the mechanic's own dashboard
3. Booking is re-dispatched to other mechanics via the standard offer process
4. The original Stripe PaymentIntent is held (NOT cancelled) — it will be transferred to the replacement mechanic once they complete the job
5. An automated email is sent to the customer: "Your original mechanic has had to cancel. We're finding you a suitable replacement and will confirm once accepted."
6. A second email is sent to the customer once a replacement mechanic has accepted

**Reschedule job flow (mechanic-initiated):**
1. Mechanic proposes a new time slot with an optional note
2. A notification is sent to the customer with the new proposed slot
3. Customer can accept, decline, or propose another time
4. If customer declines, the job is offered to other mechanics for redistribution (customer's choice)
5. A new booking confirmation email is sent once a new time is agreed

**Status: ✅ Stage 4 complete (2026-06-03).** Built to the **mechanic-side + stubs** scope (owner, 2026-06-03): the full mechanic detail view, cancel, and reschedule-propose all ship; the *customer's* accept/decline/counter response to a reschedule, and the second "replacement accepted" email, are stubbed with TODOs pointing at Task 09 (customer dashboard).

**Acceptance criteria:**

- [x] `app/(mechanic)/mechanic/jobs/[id]/page.tsx` — **Deviation (path):** lives under the `(shell)` route group at `app/(mechanic)/mechanic/(shell)/jobs/[id]/page.tsx` so the mechanic shell (sidebar + top bar) wraps it — same group deviation already used in Stage 1. URL is unchanged (`/mechanic/jobs/[id]`). RLS-scoped: only renders bookings the mechanic is assigned to OR holds a live offer for (0008 policies); anything else → `notFound()`.
- [x] Renders all sections above — status pill, service headline, four info tiles, customer notes, photo placeholder grid, parts placeholder, earnings breakdown, "why you're a great match", timeline, actions.
- [x] Earnings breakdown reads commission rate from booking record (not hardcoded 15%) — via `lib/earnings.ts` `calcEarnings`, rate from `bookings.commission_rate`. **Deviation (file):** the calc helper is the existing `lib/earnings.ts` (built Stage 2), not a new `lib/utils/earnings.ts` — reused rather than duplicated. Presentational card is `_components/earnings-breakdown.tsx`.
- [x] Action buttons depending on status — `confirmed` shows Cancel + Reschedule; `en_route`/`in_progress` show a "manage from the mobile app" note (Start journey is Task 06, mobile-only); `completed`/`cancelled`/`disputed` show a closed-state note.
- [x] Customer phone number revealed only when status is `en_route` or `in_progress` (privacy) — gated in the page; otherwise a locked "revealed once you're en route" message. **Note:** a `customer_phone` column was added (0009) but the Task 03 checkout doesn't collect it yet, so it shows "Not provided" until that lands — TODO in the migration.
- [x] Cancel job flow: reason prompt → cancellation saved to job record → redistribution triggered → customer email sent — `cancelOwnJob` (`app/actions/mechanic-jobs.ts`): saves `cancellation_reason` + a `cancelled` event, clears `mechanic_id`, resets to `sourcing_mechanic`, re-broadcasts via `dispatchBooking`, leaves the Stripe PI **held** (not cancelled), and emails the customer (email 1 of 2). **Stub:** email 2 ("a replacement has accepted") is a TODO in `cancelOwnJob` for Task 09 / `acceptOffer`.
- [x] Reschedule flow: propose new time → customer notified → accept/decline/counter path — `proposeReschedule` saves `reschedule_proposed_at`/`reschedule_note`/`reschedule_status='proposed'` + a `reschedule_proposed` event and emails the customer the new slot. **Stub:** the customer's accept/decline/counter UI is Task 09 — the proposal sits in `reschedule_status='proposed'` until then; the detail page surfaces a "proposed — awaiting customer" banner.

**Files touched:**
- `app/(mechanic)/mechanic/(shell)/jobs/[id]/page.tsx` (data loader, RLS-scoped)
- `app/(mechanic)/mechanic/(shell)/jobs/[id]/_components/job-detail.tsx` (presentational; reuses the admin `Timeline`)
- `app/(mechanic)/mechanic/(shell)/jobs/[id]/_components/earnings-breakdown.tsx`
- `app/(mechanic)/mechanic/(shell)/jobs/[id]/_components/job-actions.tsx` (client — cancel + reschedule)
- `app/actions/mechanic-jobs.ts` (`cancelOwnJob`, `proposeReschedule` — service-role writes after ownership check)
- `lib/jobs/estimates.ts` (per-service duration estimate for the "Estimated time" tile)
- `lib/earnings.ts` (reused, not the spec's `lib/utils/earnings.ts`)
- `supabase/migrations/0009_mechanic_job_actions.sql` — adds `customer_phone`, `cancellation_reason`, `reschedule_proposed_at`, `reschedule_note`, `reschedule_status` to `bookings`; extends the `booking_events` type enum with `reschedule_proposed`. **⚠️ Apply 0009 before testing Stage 4.**

> **Mileage deviation:** the brief's "service name + vehicle + mileage (mileage estimated from DVLA data)" headline omits mileage — no mileage is captured at booking and the DVLA lookup (Task 01) doesn't return it. Headline shows service + vehicle + reg; revisit if a mileage estimate source is added.

---

### Stage 5 — Earnings page

`/mechanic/earnings`.

**Layout:**

- Monthly KPI cards: this month's earnings, jobs completed, average per job, projected end-of-month
- 30-day earnings chart (line) with period selector (7d / 30d / 90d)
- Recent payouts table: payout date, amount, status (paid / pending), period covered, masked bank account ("•••• 4242")

**Note:** Payouts are part of Stripe Connect — full implementation is task 08 (when we wire mechanic-side Stripe). For now, fake the payouts table with seed data.

**Status: ✅ Stage 5 complete (2026-06-03).** Pages live under the `(shell)` route group (same deviation as Stages 1–4); URLs unchanged.

**Acceptance criteria:**

- [x] `app/(mechanic)/mechanic/earnings/page.tsx` — **Deviation (path):** `app/(mechanic)/mechanic/(shell)/earnings/page.tsx` (shell group). Replaces the Stage 1 placeholder.
- [x] KPI cards calculated from `bookings` where status='completed' and mechanic_id matches — four cards: this-month earnings (mechanic share via `lib/earnings.ts`), jobs completed this month, average per job, projected end-of-month (linear run-rate from month-to-date). All zero-state aware ("—" when no completed jobs).
- [x] Chart uses `recharts` — `_components/earnings-chart.tsx` (client), an `AreaChart` of the daily mechanic-share series with brand-blue gradient fill, matching the admin `demand-chart.tsx` conventions.
- [x] Period selector switches the chart data — 7d / 30d / 90d segmented control. The page builds the full 90-day zero-filled daily series once; the selector slices the tail client-side (no refetch).
- [x] Payouts table renders seed data with masked bank details — `_components/payouts-table.tsx`. Rows are derived from **real** weekly mechanic-share sums (current week → Pending, settled weeks → Paid, account `•••• 4242`); falls back to clearly-labelled seed rows when the mechanic has no completed jobs yet. Header flags it as a preview — live payouts arrive with Stripe Connect (Task 08).

**Files touched:**
- `app/(mechanic)/mechanic/(shell)/earnings/page.tsx`
- `app/(mechanic)/mechanic/(shell)/earnings/_components/earnings-chart.tsx`
- `app/(mechanic)/mechanic/(shell)/earnings/_components/payouts-table.tsx`

---

### Stage 6 — Availability + profile pages

The two settings pages.

**`/mechanic/availability`:**

- Working hours table — day-by-day, with on/off toggle and time range per day
- Service radius slider — 2 to 20 miles, live map preview updates as you drag
- Specialisms grid — toggle on/off (brakes, suspension, diagnostics, battery, service & MOT prep, clutch, cambelt, air-con regas). Each tile shows a job count badge ("12 jobs this week in your area")

**`/mechanic/profile`:**

- Edit name, phone, bio
- Profile photo upload (Supabase Storage)
- Base postcode (admin-locked — can request change but can't self-change)
- Read-only: status, rating, total jobs, member since, Pro tier status

**Schema additions:**

```sql
create table mechanic_availability (
  mechanic_id uuid references mechanics(id) on delete cascade,
  day_of_week integer not null, -- 0 = Sunday, 6 = Saturday
  start_time time,
  end_time time,
  is_active boolean not null default true,
  primary key (mechanic_id, day_of_week)
);
```

**Status: ✅ Stage 6 complete (2026-06-03).** Both settings pages live under the `(shell)` route group (URLs unchanged).

**Acceptance criteria:**

- [x] `app/(mechanic)/mechanic/availability/page.tsx` — **Deviation (path):** under `(shell)`. Working-hours table (day-by-day on/off toggle + time range), service-radius slider (2–20 mi) with a **live SVG map preview** (reuses the Stage 3 `AreaMap`, no Google billing), and a specialisms grid. Each specialism tile badges the mechanic's **own** offers for that service in the last 7 days — **deviation (RLS):** a true area-wide "12 jobs this week" count isn't visible to a mechanic (same limit as Stage 3's map), so it shows own-offer demand instead.
- [x] `app/(mechanic)/mechanic/profile/page.tsx` — **Deviation (path):** under `(shell)`. Edit name / phone / bio, profile-photo upload, base postcode shown **read-only / admin-locked** ("contact support to change"), and a read-only stats strip: status, rating, total jobs, member since, Pro tier.
- [x] Server actions for updating availability, profile, photo upload — `app/actions/mechanic-profile.ts`: `updateProfile`, `updateAvailability` (upserts `mechanic_availability`), `updateServiceRadius`, `updateSpecialisms`, `uploadAvatar`. Profile/availability/radius/specialisms run under the mechanic's session (existing own-row `mechanics` UPDATE + new `profiles` self-update + own-row `mechanic_availability` policies); avatar upload uses the service-role client for the Storage write.
- [x] Specialism toggle updates `mechanics.specialisms` array — specialisms are service slugs (consistent with dispatch eligibility + the admin mechanic form).
- [x] Photo upload writes to Supabase Storage, URL saved to `profiles.avatar_url` — uploads to the public `avatars` bucket at `{mechanicId}/avatar.{ext}` (upsert), cache-busted public URL saved to `profiles.avatar_url`. Validates type (JPG/PNG/WebP) + 5 MB cap.

**Files touched:**
- `app/(mechanic)/mechanic/(shell)/availability/page.tsx` + `_components/availability-editor.tsx`
- `app/(mechanic)/mechanic/(shell)/profile/page.tsx` + `_components/profile-form.tsx`
- `app/actions/mechanic-profile.ts`
- `supabase/migrations/0010_mechanic_availability_and_avatars.sql` — `mechanic_availability` table + RLS, `profiles.avatar_url` + a `profiles` self-update policy, public `avatars` storage bucket. **⚠️ Apply 0010 before testing Stage 6.**

## What NOT to do in this task

- Don't build mechanic onboarding / signup flow — admins create mechanics manually until task 07
- Don't build the mobile PWA — that's task 06
- Don't build the parts catalogue — task 10
- Don't wire real Stripe payouts — task 08 covers Stripe Connect
- Don't build smart multi-factor dispatch — v1 dispatch (closest match, 60s expiry) is enough

## When complete

- Update `docs/HANDOFF.md`:
  - Mark task 05 ✅ Complete
  - Set current task to `06-mechanic-mobile-pwa.md`
- Commit and push
