# Task 09 — Customer dashboard + live tracking + smart dispatch

**Status:** ⏳ Queued

Build the customer-side post-booking experience (dashboard, live tracking, in-app messaging, review prompt) and upgrade dispatch from "closest mechanic" to multi-factor smart matching.

## Why this task

Right now after a customer books, they get a confirmation screen and an email. That's it. The brief (section 3, second half) describes a real customer dashboard with live job tracking, upcoming bookings, past jobs, and one-tap rebooking. Without it, customer retention drops — they have no reason to come back to the platform.

Dispatch also needs upgrading. The brief mentions matching by proximity, specialism, availability AND rating (section 11 lists this as an open item to settle). Up to now we've only done proximity + specialism.

## Three sub-stages

---

### Stage 1 — Customer accounts + dashboard

Currently bookings are guest-only. Add proper customer signup + login + dashboard.

**Customer signup:**

- Offered on the confirmation screen after a booking ("Create an account to track your booking")
- Email + password (or magic link)
- Pre-fills name, email from the booking
- Links the guest booking to the new account automatically (by email match)

**Customer login:**

- `/login` (customer-facing, not `/customer/login` — it's the public auth)
- Same auth pattern as admin/mechanic, with role check

**Customer dashboard at `/dashboard`:**

- **Active booking card** (top, prominent) — only shows if there's a current/upcoming booking
  - Mechanic name + photo + rating
  - Status pill (Confirmed / En route / In progress / Complete)
  - Mechanic ETA (live, updates from mechanic's GPS once en_route)
  - Map preview showing mechanic location and customer address
  - Call mechanic / Message mechanic buttons (call only enabled when en_route or in_progress)
- **Upcoming bookings** — list of scheduled jobs with time, service, mechanic
  - Each has a **Cancel** and **Reschedule** button
  - Cancel: customer is asked for a reason before confirming. Cancellation fee is calculated and displayed based on the timing rules (>24 h: £0, within 24 h: £30, mechanic en route: £50 — sourced from `platform_settings`). Customer confirms, booking is cancelled, fee (if any) is charged from the pre-authorised deposit, remainder is released.
  - Reschedule: customer picks a new time slot. The same assigned mechanic is kept. A reason is requested. Customer is shown a new confirmation.
- **Past jobs** — chronological list of completed jobs
  - Each has: service, mechanic, date, total paid, rating given
  - "Book again" button → one-tap rebook with the same service + mechanic preference
  - "Raise dispute" button — visible for 48 hours after completion (links to dispute flow — built in task 12)
- **Your vehicles** — saved vehicles from past bookings (auto-saved on first booking, editable)
- **Profile menu** — account settings, payment methods, addresses, notification preferences, sign out

**Acceptance criteria:**

- [ ] `/signup` and `/login` pages
- [ ] Guest-to-account linking on signup
- [ ] `/dashboard` with all sections above
- [ ] Active booking card uses Supabase Realtime to update status live
- [ ] Cancel booking flow: reason prompt → fee preview → confirm → cancellation fee charged (if applicable), deposit remainder released
- [ ] Reschedule booking flow: reason prompt → new time slot picker (same mechanic) → new confirmation email sent
- [ ] Past jobs list with rebook functionality and 48-h dispute button
- [ ] Saved vehicles (new table or stored as a JSON column on profiles)
- [ ] Account settings page

**Files touched:**
- `app/signup/page.tsx`, `app/login/page.tsx`
- `app/(customer)/dashboard/page.tsx`
- `app/(customer)/dashboard/_components/active-booking-card.tsx`, etc.
- `app/(customer)/dashboard/settings/page.tsx`
- `app/actions/signup.ts`, `app/actions/link-guest-bookings.ts`
- `middleware.ts` updates (customer routes don't need gating, but `/dashboard` does)

---

### Stage 2 — Live tracking + in-app messaging

The real-time experience when the mechanic is en route.

**Mechanic-side:**

- When the mechanic taps "Start journey" (in the five-step checklist from task 06), the mobile app starts sending location updates every 30 seconds
- Uses `navigator.geolocation.watchPosition` with battery-conscious settings
- Updates stored in a `mechanic_locations` table (or as a column on bookings, refreshed on each update)

**Customer-side:**

- Active booking card on `/dashboard` shows live ETA, calculated from current mechanic position to customer address (Google Distance Matrix API)
- Map preview embedded — mechanic pin moves as updates come in
- "Mechanic is 8 minutes away" updates every 30 seconds

**In-app messaging:**

- Simple thread per booking
- `messages` table: id, booking_id, sender_id, body, created_at
- UI on both sides — mechanic at `/mechanic/jobs/[id]/messages`, customer in active booking card
- Realtime via Supabase Realtime
- Twilio SMS fallback: if a message is sent and the recipient hasn't opened the app in 5 minutes, send the message body via SMS

**Schema:**

```sql
create table mechanic_locations (
  mechanic_id uuid primary key references mechanics(id) on delete cascade,
  latitude numeric(10,7),
  longitude numeric(10,7),
  heading integer, -- 0-360
  speed_kmh numeric(5,2),
  updated_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
```

**Acceptance criteria:**

- [ ] Mechanic location updates start when status='en_route', stop when 'in_progress' or beyond
- [ ] Customer dashboard shows live mechanic pin on map
- [ ] ETA calculated via Google Distance Matrix, refreshed every minute
- [ ] In-app messaging works both directions with Realtime
- [ ] SMS fallback for unread messages > 5 min
- [ ] Twilio account set up, `TWILIO_*` env vars added

**Files touched:**
- `app/(mechanic)/mechanic/jobs/[id]/in-progress/_components/step-1-on-the-way.tsx` (updated to start tracking)
- `lib/geolocation/track.ts`
- `app/actions/update-location.ts`
- `components/customer/live-mechanic-map.tsx`
- `app/(customer)/dashboard/_components/messages-thread.tsx`
- `app/(mechanic)/mechanic/jobs/[id]/messages/page.tsx`
- `lib/twilio/send-sms.ts`
- `supabase/functions/sms-fallback/index.ts`

---

### Stage 3 — Smart dispatch

Upgrade dispatch from "closest mechanic" to a scoring-based match.

**Scoring algorithm:**

When a booking is created, score every online + available mechanic in a 15-mile radius:

- **Proximity** (40%): inverse distance, normalised to 0–1
- **Specialism match** (25%): 1 if the service category matches a mechanic specialism, else 0.3
- **Rating** (20%): rating / 5
- **Acceptance rate** (10%): accepted offers / total offers, last 30 days
- **Recency** (5%): bonus for mechanics with no recent jobs (rotation fairness)

Composite score = weighted sum. Offer goes to highest-scored mechanic.

**Fallback queue:**

- If the first mechanic declines or expires, offer to the next highest-scored
- Track all offers in `job_offers` so admin can see the chain
- After 5 declines / 10 minutes total, escalate to admin via "needs attention" panel

**Pro tier priority:**

- Pro tier mechanics get a +0.05 score bonus
- Combined with their lower take rate, this is a real loyalty incentive

**Open question from the brief — what does the customer see during sourcing?**

For this task, picking the "show a soft sourcing state" option:

- Customer sees a "Finding your mechanic… (~15 seconds)" screen during dispatch
- If sourcing takes > 60 seconds, show "We're looking — should only be a moment longer"
- If sourcing exceeds 5 minutes, fall through to admin manual assignment with a customer email apology + £5 credit

**Acceptance criteria:**

- [ ] Dispatch edge function (from task 05) rewritten with scoring algorithm
- [ ] Configurable weights stored in `platform_settings` (so they can be tuned without redeploying)
- [ ] Fallback queue handling
- [ ] Admin "needs attention" panel surfaces stalled dispatches
- [ ] Customer sourcing screen + escalation flow
- [ ] Unit tests for the scoring function

**Files touched:**
- `supabase/functions/dispatch-offer/index.ts` (rewritten)
- `lib/dispatch/score.ts`
- `lib/dispatch/score.test.ts`
- `app/(customer)/book/sourcing/page.tsx` (sourcing screen)
- `app/(admin)/admin/page.tsx` (needs-attention updates)
- Schema: add dispatch_weights JSON to platform_settings seed

## What NOT to do in this task

- Don't build dispute resolution UI — task 12
- Don't build Pro tier benefits beyond the dispatch bonus — task 11 covers the full Pro tier
- Don't build native maps — Google Maps embed is sufficient
- Don't build voice / video calls — text chat only

## When complete

- Update `docs/HANDOFF.md`
- Commit and push
