# Task 03 — Customer booking flow

**Status:** ✅ Complete (2026-05-26). Guest customer can complete a booking end-to-end (reg → vehicle → service → price → slot → Stripe pre-auth → confirmation). Verified manually with the Stripe test card. Booking rows insert with `status = 'sourcing_mechanic'` (pre-auth held, no mechanic assigned yet) — Task 04 extends the status enum from this baseline. See `docs/HANDOFF.md` → Task 03.

> **Amended 2026-08-05 — Stripe `return_url` and the redirect return path.** The
> Stage 4 pre-auth confirm was calling `stripe.confirmPayment` with **no
> `return_url`**. `redirect: "if_required"` does not make it optional — it means
> "don't redirect unless you have to", and when Stripe decided it had to (a 3-D
> Secure challenge the issuer wouldn't run in an iframe) it rejected the
> confirmation outright. No hold, no booking, "Payment failed. Please try again."
> on every retry with that card. Intermittent, which is why it survived testing:
> only cards that escalate to a challenge hit it. Reported by Stripe's monitoring.
>
> Three changes, in [slot-picker.tsx](../../app/(customer)/book/slot/_components/slot-picker.tsx)
> and [lib/bookings/create-booking.ts](../../lib/bookings/create-booking.ts):
>
> 1. `prepareCheckoutFor` pins the intent to `payment_method_types: ["card"]` —
>    it previously offered whatever the dashboard had enabled, including
>    redirect-only methods that don't belong on a manual-capture hold. **Shared
>    with the mobile app's PaymentSheet.**
> 2. `confirmParams.return_url` points at `/book/slot` carrying `reg` and
>    `repair`, because that page redirects to `/book` without them.
> 3. **The return path** — the actual work. A redirect remounts `SlotPicker` with
>    every answer gone and the hold live, so the draft is parked in
>    `sessionStorage` keyed by PaymentIntent id before confirming and replayed on
>    return. A confirmed manual-capture hold is **`requires_capture`**, never
>    `succeeded`; on that status the booking is written and the customer goes to
>    `/book/confirmed/[id]` as normal. Statuses holding nothing restore the form
>    and show the error. A hold with no draft (or a failed write) is surfaced to
>    the customer honestly and reported to ops by
>    [app/actions/orphaned-hold.ts](../../app/actions/orphaned-hold.ts).
>
> Ordering is unchanged — hold first, then the row — so Stage 4's "payment
> failure leaves no orphaned booking row" invariant is intact. Coverage:
> `tests/e2e/stripe-redirect-return.spec.ts` (needs `E2E_REG`; the in-browser
> challenge itself can't be automated — hCaptcha — so one manual pass with
> `4000 0027 6000 3184` is still owed).

> **Superseded 2026-07-29 — guest checkout is gone.** Every booking now creates (or signs into) a customer account **before** the pre-authorisation is taken, so the customer always lands on a dashboard that owns their job. The name/email/phone block moved from the payment step up to the slot screen and gained a password field; it is not a separate step. Details in `docs/HANDOFF.md` → "Current task". The `customer_id`-nullable path and `linkGuestBookings` remain only for historic guest rows.

Build the four-step mobile-first booking flow at `/book`. By the end of this task, a customer can land on the homepage, enter their reg, walk through service / mechanic / time slot selection, pre-authorise via Stripe, and land on a confirmation screen.

## Why this task

This is the core revenue path. Until this exists, the platform doesn't have a single bookable transaction. Everything else (mechanic dashboard, live monitor, analytics) is downstream of bookings existing.

The brief is very specific about this flow (section 3 of the working brief) — read it carefully before starting.

## Goal

Customer can complete a booking end-to-end:

1. Lands on `/book?reg=LB21XYZ` from the homepage hero (or types reg if entering directly)
2. Step 1: confirms vehicle (DVLA-fetched)
3. Step 2: picks a service from the catalogue
4. Step 3: sees the price and what's included (no mechanic — they are assigned after booking via backend dispatch)
5. Step 4: picks a time slot, sees address + parking, confirms
6. Stripe pre-authorisation runs
7. Lands on confirmation screen: booking reference + "finding your mechanic" status

A row appears in the `bookings` table.

## Five sub-stages

---

### Stage 1 — Booking flow shell and progress stepper

The structural scaffolding for the four-step flow. URL-driven step state — each step is its own route.

**Acceptance criteria:**

- [x] `app/(customer)/book/layout.tsx` — wraps all booking steps with the progress stepper, max-width container, mobile-first padding
- [x] `components/customer/progress-stepper.tsx` — four-step horizontal stepper at the top of each booking screen. Current step highlighted in brand blue, completed steps with check icons, future steps muted.
- [x] Routes:
  - `/book` — redirects to `/book/vehicle?reg=...` if a reg query param is present, else to a "enter your reg" entry screen
  - `/book/vehicle` — step 1
  - `/book/service` — step 2
  - `/book/match` — step 3 (price + matched mechanic)
  - `/book/slot` — step 4 (time slot + confirm) — no mechanic param needed
  - `/book/confirmed/[id]` — confirmation screen (after successful pre-auth)
- [x] Booking state passed between steps via URL params (reg, service slug, mechanic id, slot timestamp) — no client-side global state library
- [x] Each step has a sticky back button (top left) and a sticky primary CTA (bottom on mobile, inline on desktop) — single decision per screen, per the brief

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

- [x] Server component reads `reg` from search params, calls the DVLA client (built in task 01), renders the result
- [x] If DVLA lookup fails or reg is invalid, show an error state with retry / re-enter input
- [x] On success, render a card showing: vehicle make, model, colour, year, fuel type, engine capacity. Green check icon. "Yes, this is my car" primary CTA. "Edit manually" link for fallback.
- [x] "Edit manually" opens a small form for make / model / year — used when DVLA can't find the vehicle or the data is wrong
- [x] CTA submits via server action and navigates to `/book/service?reg=...` (passing the reg through)
- [x] Vehicle details cached in a short-lived server-side cache (5 minutes) keyed by reg, so we're not hitting DVLA on every step refresh

**Files touched:**
- `app/(customer)/book/vehicle/page.tsx`
- `app/(customer)/book/vehicle/_components/vehicle-confirm-card.tsx`
- `app/(customer)/book/vehicle/_components/manual-vehicle-form.tsx`

---

### Stage 3 — Step 2: Service selection

The service catalogue, presented as a category grid.

**Acceptance criteria:**

- [x] Server component fetches all active services from the DB
- [x] Search bar at the top, filters the grid client-side as the user types
- [x] Six-category grid showing primary services (Full Service, Diagnostic, Brakes & Tyres, Battery, Clutch & Gears, MOT Pre-check) with starting prices and an icon per category
- [x] "Diagnostic" highlighted as the most-picked (subtle "Most popular" badge)
- [x] "Not sure what's wrong?" card sits below the grid, links to a diagnostic flow (for now, just selects the Diagnostic service)
- [x] Tapping a service card navigates to `/book/match?reg=...&service=<slug>`
- [x] Below-the-fold: an expandable section showing all other services (not just the six main categories)

**Files touched:**
- `app/(customer)/book/service/page.tsx`
- `app/(customer)/book/service/_components/service-grid.tsx`
- `app/(customer)/book/service/_components/service-search.tsx`

---

### Stage 4 — Step 3: Price confirmation

The big "here's your price" moment. Gradient blue hero card only — **no mechanic is shown or selected here**. The customer never picks a mechanic. Once the booking is confirmed, the job is distributed on the backend to available mechanics; the first one to accept is assigned, and the customer is notified by email. The mechanic is revealed on the customer dashboard once accepted.

**Acceptance criteria:**

- [x] Server component fetches the service by slug and renders the screen
- [x] Large gradient blue hero card displaying:
  - Service name
  - Fixed price (the service's `starting_price_pence` for now — area multipliers come in task 08)
  - What's included: parts and labour, no call-out fee, 12-month guarantee
  - Transparency note: "Your card is pre-authorised now. No money leaves your account until the job is complete and you've signed off." (The brief describes a long-term partial-deposit model; the implementation pre-authorises the full service price for now and the copy avoids the word "deposit" until that lands.)
- [x] A trust row beneath the hero: three icon+text items — "Vetted professional", "12-month guarantee", "No fix, no fee"
- [x] A short "How it works after you book" note — e.g. "Once confirmed, we'll match you with the best available mechanic in your area. You'll receive a confirmation email as soon as one accepts — usually within minutes."
- [x] Primary CTA "Pick a time" → navigates to `/book/slot?reg=...&service=<slug>`
- [x] No mechanic card, no "change mechanic" option, no mechanic seed data needed for this step

**Files touched:**
- `app/(customer)/book/match/page.tsx`
- `app/(customer)/book/match/_components/price-hero.tsx`

---

### Stage 5 — Step 4: Time slot + confirm + Stripe pre-auth

The final step. Pick a slot, see total, confirm.

**Acceptance criteria:**

- [x] Horizontal date strip showing the next 5 days, each with an available-slot count (use fake availability for now — every day has 5–8 slots; real availability comes when mechanics have set their hours)
- [x] Three-column time grid below the selected date, showing morning / afternoon / evening slots. Each slot is a tappable button. "Popular" badge on the middle slot, "Last" badge on the final slot of the day.
- [x] Selected slot highlighted in brand blue
- [x] Address card pre-filled (for guest-bookings, use the postcode from earlier — full address entry is a free-text form here; geocoding comes in a later task)
- [x] Parking type select (driveway / street / car park / other)
- [x] Special instructions textarea
- [x] Sticky bottom CTA bar showing: total price, "Confirm booking" button
- [x] On confirm:
  1. Insert booking row in DB with status='pending_mechanic' (awaiting mechanic acceptance — no mechanic_id yet)
  2. Call Stripe to create a PaymentIntent with `capture_method: 'manual'` (pre-auth, no capture yet)
  3. Pass the client_secret to Stripe Elements for card entry — show a Stripe-hosted card form in a modal
  4. On successful pre-auth, update booking row with stripe_payment_intent_id and status='sourcing_mechanic'
  5. Send confirmation email via Resend — subject: "Booking received — we're finding your mechanic"
  6. Redirect to `/book/confirmed/[booking-id]`
- [x] If Stripe pre-auth fails, surface the error and let the customer retry

**Stripe setup (needed for this stage):**

- [x] Create a Stripe account if one doesn't exist (test mode is fine for development)
- [x] Install `stripe` and `@stripe/stripe-js` and `@stripe/react-stripe-js`
- [x] Add `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to `.env.local`
- [x] Wrapper at `lib/stripe/server.ts` (server-side Stripe instance)
- [x] Stripe Connect setup is for mechanic payouts later — for this task, just plain Stripe Payments with manual capture

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

- [x] `/book/confirmed/[id]` — renders:
  - Booking reference number
  - Full booking summary: vehicle, service, time slot, address, total pre-authorised
  - A "finding your mechanic" status card — animated/pulsing, e.g. "We're matching you with the best available mechanic in your area. You'll get an email confirmation as soon as they accept — usually within minutes."
  - No mechanic card — the mechanic is unknown at this point
- [x] "Create an account to track your booking" CTA at the bottom — links to signup (signup screen doesn't exist yet, placeholder href is fine)

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

- Don't show or assign a mechanic during the booking flow — dispatch happens on the backend after booking is placed (task 05/09)
- Don't seed fake mechanics for the booking flow — no mechanic data is needed until the mechanic dashboard tasks
- Don't build real-time availability from mechanic working hours — fake availability is fine
- Don't build customer signup at the end of booking — that's a later task (guest bookings only for now)
- Don't build the customer dashboard / live tracking — the confirmation screen "finding your mechanic" state is the extent of it for now
- Don't capture the Stripe payment — only pre-authorise. Capture happens when the mechanic marks the job complete (later task)
- Don't build SMS notifications — email only for this task

## When complete

A customer can complete a booking from homepage to confirmation in under 5 minutes (under 60 seconds once the flow is polished). A row exists in `bookings` with `status='confirmed'` and a `stripe_payment_intent_id`. The customer received a confirmation email.

- Update `docs/HANDOFF.md`:
  - Mark task 03 ✅ Complete
  - Set current task to `04-admin-live-monitor.md`
- Commit and push
