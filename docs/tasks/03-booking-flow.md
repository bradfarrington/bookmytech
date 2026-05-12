# Task 03 — Customer booking flow

**Status:** ⏳ Queued

Build the four-step mobile-first booking flow at `/book`. By the end of this task, a customer can land on the homepage, enter their reg, walk through service / mechanic / time slot selection, pre-authorise via Stripe, and land on a confirmation screen.

## Why this task

This is the core revenue path. Until this exists, the platform doesn't have a single bookable transaction. Everything else (mechanic dashboard, live monitor, analytics) is downstream of bookings existing.

The brief is very specific about this flow (section 3 of the working brief) — read it carefully before starting.

## Goal

Customer can complete a booking end-to-end:

1. Lands on `/book?reg=LB21XYZ` from the homepage hero (or types reg if entering directly)
2. Step 1: confirms vehicle (DVLA-fetched)
3. Step 2: picks a service from the catalogue
4. Step 3: sees the price + matched mechanic
5. Step 4: picks a time slot, sees address + parking, confirms
6. Stripe pre-authorisation runs
7. Lands on confirmation screen with booking ID

A row appears in the `bookings` table.

## Five sub-stages

---

### Stage 1 — Booking flow shell and progress stepper

The structural scaffolding for the four-step flow. URL-driven step state — each step is its own route.

**Acceptance criteria:**

- [ ] `app/(customer)/book/layout.tsx` — wraps all booking steps with the progress stepper, max-width container, mobile-first padding
- [ ] `components/customer/progress-stepper.tsx` — four-step horizontal stepper at the top of each booking screen. Current step highlighted in brand blue, completed steps with check icons, future steps muted.
- [ ] Routes:
  - `/book` — redirects to `/book/vehicle?reg=...` if a reg query param is present, else to a "enter your reg" entry screen
  - `/book/vehicle` — step 1
  - `/book/service` — step 2
  - `/book/match` — step 3 (price + matched mechanic)
  - `/book/slot` — step 4 (time slot + confirm)
  - `/book/confirmed/[id]` — confirmation screen (after successful pre-auth)
- [ ] Booking state passed between steps via URL params (reg, service slug, mechanic id, slot timestamp) — no client-side global state library
- [ ] Each step has a sticky back button (top left) and a sticky primary CTA (bottom on mobile, inline on desktop) — single decision per screen, per the brief

**Why URL-driven state:** lets users bookmark / refresh / share their progress, and avoids needing any global state library. Server components can read the URL params and load whatever data the step needs.

**Files touched:**
- `app/(customer)/book/layout.tsx`
- `app/(customer)/book/page.tsx`
- `app/(customer)/book/[step]/page.tsx` for each step
- `components/customer/progress-stepper.tsx`

---

### Stage 2 — Step 1: Vehicle confirmation

The DVLA-fetched vehicle, displayed in a confirmation card.

**Acceptance criteria:**

- [ ] Server component reads `reg` from search params, calls the DVLA client (built in task 01), renders the result
- [ ] If DVLA lookup fails or reg is invalid, show an error state with retry / re-enter input
- [ ] On success, render a card showing: vehicle make, model, colour, year, fuel type, engine capacity. Green check icon. "Yes, this is my car" primary CTA. "Edit manually" link for fallback.
- [ ] "Edit manually" opens a small form for make / model / year — used when DVLA can't find the vehicle or the data is wrong
- [ ] CTA submits via server action and navigates to `/book/service?reg=...` (passing the reg through)
- [ ] Vehicle details cached in a short-lived server-side cache (5 minutes) keyed by reg, so we're not hitting DVLA on every step refresh

**Files touched:**
- `app/(customer)/book/vehicle/page.tsx`
- `app/(customer)/book/vehicle/_components/vehicle-confirm-card.tsx`
- `app/(customer)/book/vehicle/_components/manual-vehicle-form.tsx`

---

### Stage 3 — Step 2: Service selection

The service catalogue, presented as a category grid.

**Acceptance criteria:**

- [ ] Server component fetches all active services from the DB
- [ ] Search bar at the top, filters the grid client-side as the user types
- [ ] Six-category grid showing primary services (Full Service, Diagnostic, Brakes & Tyres, Battery, Clutch & Gears, MOT Pre-check) with starting prices and an icon per category
- [ ] "Diagnostic" highlighted as the most-picked (subtle "Most popular" badge)
- [ ] "Not sure what's wrong?" card sits below the grid, links to a diagnostic flow (for now, just selects the Diagnostic service)
- [ ] Tapping a service card navigates to `/book/match?reg=...&service=<slug>`
- [ ] Below-the-fold: an expandable section showing all other services (not just the six main categories)

**Files touched:**
- `app/(customer)/book/service/page.tsx`
- `app/(customer)/book/service/_components/service-grid.tsx`
- `app/(customer)/book/service/_components/service-search.tsx`

---

### Stage 4 — Step 3: Price and matched mechanic

The big "here's your price" moment. Gradient blue hero card. Matched mechanic below.

**Note on mechanic matching:** the dispatch/matching logic from the brief (section 11, open item) isn't fully scoped. For this task, do the simplest possible thing: pick a random "online" mechanic from the `profiles` table with role='mechanic'. We don't yet have mechanics in the system, so seed 5–10 fake mechanic profiles via SQL. Smart dispatch logic is a later task.

**Acceptance criteria:**

- [ ] Server component fetches the service by slug, picks a mechanic, and renders the screen
- [ ] Large gradient blue hero card displaying:
  - Service name
  - Fixed price (the service's starting_price_pence for now — area multipliers come later)
  - What's included: parts and labour, no call-out fee, 12-month guarantee
  - Transparency note: "You won't be charged until the job is complete and you've signed off"
- [ ] Mechanic card below with: avatar, name, verified badge, star rating (use seed values), job count, specialism (text), distance ("2.3 miles away" — fake for now)
- [ ] "Change mechanic" link → opens a modal/sheet with 3–4 other available mechanics, customer can pick
- [ ] Primary CTA "Pick a time" → navigates to `/book/slot?reg=...&service=...&mechanic=<id>`
- [ ] Seed 8–10 fake mechanics via SQL (with names, avatars, ratings, job counts) so the screen has real data

**Files touched:**
- `app/(customer)/book/match/page.tsx`
- `app/(customer)/book/match/_components/price-hero.tsx`
- `app/(customer)/book/match/_components/mechanic-card.tsx`
- `app/(customer)/book/match/_components/change-mechanic-sheet.tsx`
- Seed SQL for fake mechanics

---

### Stage 5 — Step 4: Time slot + confirm + Stripe pre-auth

The final step. Pick a slot, see total, confirm.

**Acceptance criteria:**

- [ ] Horizontal date strip showing the next 5 days, each with an available-slot count (use fake availability for now — every day has 5–8 slots; real availability comes when mechanics have set their hours)
- [ ] Three-column time grid below the selected date, showing morning / afternoon / evening slots. Each slot is a tappable button. "Popular" badge on the middle slot, "Last" badge on the final slot of the day.
- [ ] Selected slot highlighted in brand blue
- [ ] Address card pre-filled (for guest-bookings, use the postcode from earlier — full address entry is a free-text form here; geocoding comes in a later task)
- [ ] Parking type select (driveway / street / car park / other)
- [ ] Special instructions textarea
- [ ] Sticky bottom CTA bar showing: total price, "Confirm booking" button
- [ ] On confirm:
  1. Insert booking row in DB with status='pending'
  2. Call Stripe Connect to create a PaymentIntent with `capture_method: 'manual'` (pre-auth, no capture yet)
  3. Pass the client_secret to Stripe Elements for card entry — show a Stripe-hosted card form in a modal
  4. On successful pre-auth, update booking row with stripe_payment_intent_id and status='confirmed'
  5. Send confirmation email via Resend
  6. Redirect to `/book/confirmed/[booking-id]`
- [ ] If Stripe pre-auth fails, surface the error and let the customer retry

**Stripe setup (needed for this stage):**

- [ ] Create a Stripe account if one doesn't exist (test mode is fine for development)
- [ ] Install `stripe` and `@stripe/stripe-js` and `@stripe/react-stripe-js`
- [ ] Add `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to `.env.local`
- [ ] Wrapper at `lib/stripe/server.ts` (server-side Stripe instance)
- [ ] Stripe Connect setup is for mechanic payouts later — for this task, just plain Stripe Payments with manual capture

**Schema changes — booking row needs:**

```sql
alter table bookings add column stripe_payment_intent_id text;
alter table bookings add column customer_email text;
alter table bookings add column customer_name text;
alter table bookings add column address_line_1 text;
alter table bookings add column address_line_2 text;
alter table bookings add column parking_type text;
alter table bookings add column special_instructions text;
```

Also relax the customer_id constraint (it's already nullable) — guest bookings won't have a customer profile until they sign up.

**Confirmation screen:**

- [ ] `/book/confirmed/[id]` — renders the booking ID, mechanic contact card (name, phone — fake for now), full booking summary (vehicle, service, mechanic, slot, total), and a "live tracking notice" placeholder ("Live tracking will activate 1 hour before your slot")
- [ ] "Create an account to track your booking" CTA at the bottom — links to signup (signup screen doesn't exist yet, placeholder href is fine)

**Files touched:**
- `app/(customer)/book/slot/page.tsx`
- `app/(customer)/book/slot/_components/date-strip.tsx`
- `app/(customer)/book/slot/_components/time-grid.tsx`
- `app/(customer)/book/slot/_components/address-card.tsx`
- `app/(customer)/book/slot/_components/confirm-bar.tsx`
- `app/(customer)/book/confirmed/[id]/page.tsx`
- `app/actions/create-booking.ts`
- `lib/stripe/server.ts`, `lib/stripe/client.ts`
- `emails/booking-confirmed.tsx` (Resend React Email template)
- `lib/email/send.ts` (Resend wrapper)
- Schema migration

## What NOT to do in this task

- Don't build smart dispatch logic — random mechanic selection is fine
- Don't build real-time availability from mechanic working hours — fake availability is fine
- Don't build customer signup at the end of booking — that's a later task (guest bookings only for now)
- Don't build the customer dashboard / live tracking — placeholder text on confirmation screen is enough
- Don't capture the Stripe payment — only pre-authorise. Capture happens when the mechanic marks the job complete (later task)
- Don't build SMS notifications — email only for this task

## When complete

A customer can complete a booking from homepage to confirmation in under 5 minutes (under 60 seconds once the flow is polished). A row exists in `bookings` with `status='confirmed'` and a `stripe_payment_intent_id`. The customer received a confirmation email.

- Update `docs/HANDOFF.md`:
  - Mark task 03 ✅ Complete
  - Set current task to `04-admin-live-monitor.md`
- Commit and push
