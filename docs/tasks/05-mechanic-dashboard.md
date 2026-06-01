# Task 05 — Mechanic dashboard (desktop web)

**Status:** 🚧 In progress — Stages 1–3 ✅ (2026-06-01). Auth + shell, jobs page (KPIs + live broadcast offers + dispatch), daily schedule timeline + free SVG service-area map shipped.

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

**Acceptance criteria:**

- [ ] `app/(mechanic)/mechanic/jobs/[id]/page.tsx`
- [ ] Renders all sections above
- [ ] Earnings breakdown reads commission rate from booking record (not hardcoded 15%)
- [ ] Action buttons depending on status: Start journey (en_route → in_progress is on mobile only)
- [ ] Customer phone number revealed only when status is 'en_route' or 'in_progress' (privacy)
- [ ] Cancel job flow: reason prompt → cancellation saved to job record → redistribution triggered → customer email sent
- [ ] Reschedule flow: propose new time → customer notified → accept/decline/counter path

**Files touched:**
- `app/(mechanic)/mechanic/jobs/[id]/page.tsx`
- `app/(mechanic)/mechanic/jobs/[id]/_components/job-detail.tsx`
- `app/(mechanic)/mechanic/jobs/[id]/_components/earnings-breakdown.tsx`
- `lib/utils/earnings.ts` (calculation helper)

---

### Stage 5 — Earnings page

`/mechanic/earnings`.

**Layout:**

- Monthly KPI cards: this month's earnings, jobs completed, average per job, projected end-of-month
- 30-day earnings chart (line) with period selector (7d / 30d / 90d)
- Recent payouts table: payout date, amount, status (paid / pending), period covered, masked bank account ("•••• 4242")

**Note:** Payouts are part of Stripe Connect — full implementation is task 08 (when we wire mechanic-side Stripe). For now, fake the payouts table with seed data.

**Acceptance criteria:**

- [ ] `app/(mechanic)/mechanic/earnings/page.tsx`
- [ ] KPI cards calculated from `bookings` where status='completed' and mechanic_id matches
- [ ] Chart uses `recharts`
- [ ] Period selector switches the chart data
- [ ] Payouts table renders seed data with masked bank details

**Files touched:**
- `app/(mechanic)/mechanic/earnings/page.tsx`
- `app/(mechanic)/mechanic/earnings/_components/earnings-chart.tsx`
- `app/(mechanic)/mechanic/earnings/_components/payouts-table.tsx`

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

**Acceptance criteria:**

- [ ] `app/(mechanic)/mechanic/availability/page.tsx`
- [ ] `app/(mechanic)/mechanic/profile/page.tsx`
- [ ] Server actions for updating availability, profile, photo upload
- [ ] Specialism toggle updates `mechanics.specialisms` array
- [ ] Photo upload writes to Supabase Storage, URL saved to `profiles.avatar_url`

**Files touched:**
- `app/(mechanic)/mechanic/availability/page.tsx`
- `app/(mechanic)/mechanic/profile/page.tsx`
- `app/actions/mechanic-profile.ts`
- Schema migration

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
