# Task 05 — Mechanic dashboard (desktop web)

**Status:** ⏳ Queued

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

- [ ] `/mechanic/login` — login form (re-uses the auth pattern from task 02, similar layout)
- [ ] `middleware.ts` updated: gate `/mechanic/*` to authenticated users with role='mechanic'
- [ ] `app/(mechanic)/mechanic/layout.tsx` — mechanic shell with:
  - Left sidebar (light theme, not dark): Jobs, Schedule, Earnings, Reviews, Availability, Profile, Documents
  - Top bar: mechanic's name + avatar, online/offline toggle (updates `mechanics.status`), sign-out
- [ ] Online/offline toggle is a real-time UI control — flipping it updates the mechanics table immediately
- [ ] Placeholder pages for unbuilt nav items (Reviews, Documents) — built in later tasks
- [ ] Schema: add `online_at` and `last_seen_at` timestamptz columns to `mechanics` for tracking session activity

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

**Acceptance criteria:**

- [ ] `app/(mechanic)/mechanic/jobs/page.tsx` — main jobs view
- [ ] Four KPI cards rendering real data
- [ ] Offers feed renders active offers, sorted by expiry (most urgent first)
- [ ] Realtime subscription: new offers appear automatically, expired/responded offers removed
- [ ] Accept action: updates the offer, assigns the mechanic to the booking, updates booking status to 'confirmed'
- [ ] Decline action: updates the offer, triggers the edge function to re-dispatch to next mechanic
- [ ] Edge function `dispatch-offer` deployed: finds next closest mechanic, creates offer with 60s expiry
- [ ] Expiry countdown ticks down in real time on the client

**Files touched:**
- `app/(mechanic)/mechanic/jobs/page.tsx`
- `app/(mechanic)/mechanic/jobs/_components/kpi-cards.tsx`
- `app/(mechanic)/mechanic/jobs/_components/offer-feed.tsx`
- `app/(mechanic)/mechanic/jobs/_components/offer-card.tsx`
- `app/(mechanic)/mechanic/jobs/_components/countdown.tsx` (client)
- `app/actions/job-offers.ts`
- `supabase/functions/dispatch-offer/index.ts`
- Schema migration

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

**Acceptance criteria:**

- [ ] Schedule timeline renders today's bookings, sorted by scheduled_at
- [ ] Status dots reflect actual booking status
- [ ] Map renders with Google Maps JS API, radius circle and pins shown
- [ ] `GOOGLE_MAPS_API_KEY` added to `.env.local` (mechanic must apply for one if not already)
- [ ] Postcode → lat/lng resolved via Google Geocoding (cache results — postcodes don't change)

**Files touched:**
- `app/(mechanic)/mechanic/jobs/_components/schedule.tsx`
- `app/(mechanic)/mechanic/jobs/_components/area-map.tsx` (client)
- `lib/maps/client.ts`, `lib/maps/geocode.ts`

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
