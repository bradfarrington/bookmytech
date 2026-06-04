# Task 06 — Mechanic mobile PWA

**Status:** ⏳ Queued (partially delivered early — see "Interim delivery" below)

Build the phone-optimised mobile experience the mechanic uses in the field. Brief covers this in section 4 (second half). Delivered as a Progressive Web App — installable to home screen, push notifications, offline-capable for the in-progress checklist.

## Interim delivery (2026-06-03) — live lifecycle on desktop

Ahead of the full PWA, the **job status lifecycle** (Stage 4's status transitions) was shipped on the existing **desktop** mechanic dashboard, because the booking status enum and lifecycle timestamps (`en_route_at` / `started_at` / `completed_at`) already existed from migration 0004 — no mobile app was needed to write them. This lets a mechanic drive a job forward today and lets the customer watch it happen, without waiting for the PWA.

What landed:
- `app/actions/job-progress.ts` — `startJourney` (confirmed → en_route), `beginWork` (en_route → in_progress), `completeAndCharge` (in_progress → completed). The last **captures the Stripe pre-authorisation** (manual capture) and emails the customer a receipt. Capture failure is fatal — the job stays open and retryable; if Stripe isn't configured (dev) it completes without capturing.
- The desktop job-detail view's old "handled in the mobile app" placeholder (`jobs/[id]/_components/job-actions.tsx`) is replaced with real **Start journey / Begin work / Complete & charge** buttons, gated by current status.
- The customer's `book/confirmed/[id]` page is now a **live status tracker** (`_components/booking-tracker.tsx`): a step rail that progresses Booked → Mechanic confirmed (reveals mechanic name/avatar/rating) → On the way → Work in progress → Complete, with status-aware copy and a completed-state receipt note. Refresh-based (no Realtime yet).
- **Job photos + sign-off signature on the web view** (`0011_job_media.sql`, `app/actions/job-media.ts`, `_components/photo-uploader.tsx`, `_components/signature-pad.tsx`): the mechanic uploads job photos (camera-capable file input) during an active job, and completion is gated on an on-screen customer **signature** — a dependency-free `<canvas>` pad whose PNG is saved to a public `job-media` bucket. `completeAndCharge` refuses to complete until a signature row exists. Photos + signature are shown back in the job-detail view.

**Still deferred to the real mobile build:** GPS live-location tracking, offline (IndexedDB) sync, push notifications, and the whole PWA shell. The desktop UI is responsive (the job-detail page already stacks to one column below `lg`) but not the bespoke 375px-first PWA layout.

## Why this task

Desktop is for the back-office work (earnings, schedule, profile). When the mechanic is actually working — driving to a job, in someone's driveway with tools out — they need a phone interface designed for one-handed use, with clear urgency cues for new offers and a guided checklist for the work itself.

## Goal

A mechanic can install the PWA to their phone, receive push notifications for new offers, accept jobs from the lock screen experience, navigate a five-step in-progress checklist, get the customer to sign off in-app, and trigger payment capture.

## Five sub-stages

---

### Stage 1 — PWA setup

Make the existing Next.js app installable as a PWA. The desktop and mobile routes coexist in the same app — the mobile experience is just a different responsive view of the same `/mechanic/*` routes, optimised heavily for narrow viewports, with PWA features layered on.

**Acceptance criteria:**

- [x] ~~`public/manifest.json`~~ — manifest via Next 16's built-in `app/manifest.ts` metadata route (served at `/manifest.webmanifest`, auto-linked). name, short_name, icons (192, 512, maskable), theme_color (#2563EB), background_color, display: 'standalone', start_url: '/mechanic'
- [x] Icons generated at multiple sizes — `public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png`, hand-cranked from `logo.png` with `sips`
- [x] ~~Service worker via `next-pwa`/`@serwist/next`~~ — **deviation: hand-rolled `public/sw.js`**. The Next PWA guide warns Serwist "currently requires webpack configuration" and this app builds with **Turbopack**, so a plugin SW would fight the build. Registered via `components/pwa/service-worker-register.tsx` (production-only).
- [x] Service worker caches static assets and gives the app an offline fallback page (`public/offline.html`; network-first navigation → offline fallback, cache-first static assets, cross-origin/API left untouched)
- [x] iOS install meta tags in `app/layout.tsx` (Apple touch icon, `appleWebApp` status-bar style; theme-color via `viewport` export)
- [x] Install prompt logic — custom banner (`components/pwa/install-prompt.tsx`) mounted in the mechanic shell, using `beforeinstallprompt` on Android/Chromium + manual "Add to Home Screen" instructions on iOS; dismissable; hidden when already standalone
- [ ] Verify install works on iOS Safari (Add to Home Screen) and Android Chrome (install prompt) *(needs a real device + HTTPS — not verifiable in this environment; production build passes and `/manifest.webmanifest` generates)*

**Files touched (actual):**
- `app/manifest.ts` (not `public/manifest.json`)
- `public/icons/*`, `public/sw.js`, `public/offline.html`
- `next.config.ts` (sw.js + security headers)
- `app/layout.tsx` (meta tags, theme-color, SW registration)
- `components/pwa/install-prompt.tsx`, `components/pwa/service-worker-register.tsx`
- `app/(mechanic)/mechanic/(shell)/layout.tsx` (mounts the install prompt)

---

### Stage 2 — Mobile-optimised navigation + day view

Bottom-tab navigation. Single-handed reach. Designed for 375px width primarily.

> ⚠️ **Scope decision (2026-06-04):** until the native iOS/Android apps are built, the mobile experience is a **responsive website on a phone, not an app-style shell**. So **do NOT build the bottom-tab drawer below** — instead make the existing sidebar/top-bar nav reflow responsively for narrow viewports. The day view, earnings ring, and responsive layout are still in scope. The bottom-tab spec is kept here as the design for when the real app is built.

**Bottom tabs (per brief — DEFERRED to the real app build):** Jobs · Schedule · Earnings · Reviews · Me

**Day view (default tab):**

- Top: greeting + daily summary ("Morning, James. 3 jobs lined up · £284 booked")
- Circular earnings goal ring — progress against today's target (target editable in profile)
- "Up next" card — the next scheduled job with time, customer name, service, address
- Subsequent jobs listed below in compact rows

**Acceptance criteria:**

- [x] Single-layout-with-responsive (preferred option): the desktop sidebar is `hidden md:flex`; below `md` a **hamburger + slide-in drawer** (`components/mechanic/mobile-nav.tsx`) carries the same nav. Shared nav source: `components/mechanic/nav-items.ts`.
- [ ] ~~Bottom tab bar component~~ — **DEFERRED to the real app build** per the mobile-nav scope decision (responsive web, not an app shell). The drawer replaces it for now.
- [x] Day view built at the mobile breakpoint — `jobs/_components/day-view-header.tsx`: greeting + daily summary ("N jobs lined up · £X booked") + circular earnings-goal ring (`components/mechanic/earnings-ring.tsx`). "Up next" + subsequent job rows are the existing `Schedule` component (next item already highlighted). *Earnings target is a fixed default (`DAILY_TARGET_PENCE`); making it editable in the profile is a small follow-up (needs a column).*
- [x] Tap targets minimum 44px — drawer trigger/links and buttons are `size-11` / `min-h-11` (44px).
- [x] Safe area insets respected — `env(safe-area-inset-*)` on the top bar, main scroll area, and drawer; `viewportFit: "cover"` added to the root `viewport` export.

**Files touched (actual):**
- `components/mechanic/nav-items.ts` (shared), `components/mechanic/mobile-nav.tsx` (drawer, replaces the planned bottom-tabs), `components/mechanic/earnings-ring.tsx`
- `components/mechanic/sidebar.tsx` (desktop-only), `components/mechanic/top-bar.tsx` (hamburger + responsive)
- `app/(mechanic)/mechanic/(shell)/layout.tsx` (responsive padding + safe area), `app/layout.tsx` (viewportFit)
- `app/(mechanic)/mechanic/(shell)/jobs/page.tsx` + `jobs/_components/day-view-header.tsx`

---

### Stage 3 — Incoming offer screen + push notifications

The urgent moment. A new job offer comes in — the mechanic needs to see it instantly and decide in 60 seconds.

**UI:**

- Full-screen takeover when an offer arrives (if the app is open)
- Bright urgency bar with expiry countdown
- Earnings highlight card — large gradient blue, payout amount in big numbers
- Four info tiles: when, where (distance), service, vehicle
- Customer notes preview (truncated)
- Accept and Decline buttons (large, thumb-reachable)
- Swipe-to-decline gesture as alternative

**Push notifications:**

- Firebase Cloud Messaging via Expo (per brief stack)
- Web Push API used directly — Expo isn't strictly needed for web PWA; FCM works via `firebase` JS SDK
- Mechanic grants notification permission on first open
- When an offer is created (via the dispatch edge function from task 05), trigger an FCM message to the targeted mechanic
- Notification body: "New job: £89 · 3.2 mi · Diagnostic"
- Tapping the notification opens the app to the offer screen

**Acceptance criteria:**

- [ ] Firebase project created, FCM enabled
- [ ] Service worker registered for receiving push messages
- [ ] Mechanic device token stored in `mechanics.fcm_token` (column added)
- [ ] Dispatch edge function from task 05 updated to also send FCM push when an offer is created
- [ ] Offer screen built with the urgent UI
- [ ] Countdown ticks down in real time, auto-declines at 0
- [ ] Accept → assigns the booking and transitions to job-in-progress view
- [ ] Decline → triggers re-dispatch to next mechanic
- [ ] Verify push notifications work on installed PWA (iOS 16.4+ supports web push; Android Chrome supports it natively)

**Files touched:**
- `app/(mechanic)/mechanic/offer/[id]/page.tsx`
- `app/(mechanic)/mechanic/offer/[id]/_components/urgent-bar.tsx`
- `app/(mechanic)/mechanic/offer/[id]/_components/earnings-highlight.tsx`
- `lib/push/firebase.ts`
- `lib/push/register-device.ts`
- `supabase/functions/dispatch-offer/index.ts` (updated to send FCM)
- Schema migration (fcm_token column)

---

### Stage 4 — Five-step in-progress checklist

Once a job is accepted and the mechanic is heading to it, the screen guides them through the work.

**Five steps (per brief):**

1. **On the way** — Start when leaving. "Start journey" button → status='en_route', notifies customer
2. **Inspection** — Arrived, looking at the car. "Begin inspection" button. Optional photo upload of vehicle condition.
3. **Work in progress** — Doing the job. Timer running. Notes field for the mechanic.
4. **Quality check + cleanup** — Test the fix. Tidy up.
5. **Complete + charge** — Customer signs off in-app (signature pad), Stripe capture triggers, status='completed'

**Acceptance criteria:**

- [ ] `app/(mechanic)/mechanic/jobs/[id]/in-progress/page.tsx` — step-by-step flow *(deferred — interim delivery puts the transitions on the desktop job-detail view via `job-actions.tsx`, not a dedicated mobile checklist screen)*
- [ ] Each step is a screen with: title, instructions, photos field (where relevant), CTA to advance to next step *(deferred to mobile build)*
- [x] Status updates in `bookings` table at each transition *(via `app/actions/job-progress.ts`)*
- [x] Photos uploaded to Supabase Storage, linked to booking *(via `job-media` bucket + `booking_media` table, `uploadJobPhoto`; shown in job-detail)*
- [x] Signature pad at step 5 — ~~use `signature_pad` library~~, save as PNG to Supabase Storage *(hand-rolled dependency-free `<canvas>` pad instead of the library; PNG → `job-media` bucket; gates completion)*
- [x] On "Complete + charge":
  1. [x] Capture the Stripe PaymentIntent (manual capture from task 03 pre-auth)
  2. [x] Set booking status='completed', completed_at=now()
  3. [x] Show payout timing: "Paid 24h after sign-off" *(shown in the desktop complete button's helper text)*
  4. [x] Trigger receipt email to customer
- [ ] Offline support — if the mechanic loses signal mid-job, the checklist state persists locally and syncs when reconnected (use IndexedDB via `idb` library, with a sync server action that runs when online) *(deferred to mobile build)*

**Files touched:**
- `app/(mechanic)/mechanic/jobs/[id]/in-progress/page.tsx`
- `app/(mechanic)/mechanic/jobs/[id]/in-progress/_components/step-*.tsx` (one per step)
- `app/(mechanic)/mechanic/jobs/[id]/in-progress/_components/signature-pad.tsx`
- `app/actions/job-progress.ts` (status transition actions)
- `app/actions/capture-payment.ts`
- `lib/offline/sync.ts`
- `emails/booking-complete.tsx`

---

### Stage 5 — Reviews and Me tabs

The remaining bottom-tab destinations.

**Reviews tab (`/mechanic/reviews`):**

- Average rating + total reviews at the top
- List of recent reviews — customer first name, rating, quick-tag chips, review text, date
- Filter by rating
- "Respond" option (mechanic can leave a single reply per review)

**Schema:**

```sql
create table reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  customer_id uuid references profiles(id),
  mechanic_id uuid not null references mechanics(id),
  rating integer not null check (rating between 1 and 5),
  tags text[] default '{}',
  comment text,
  mechanic_response text,
  created_at timestamptz not null default now()
);
```

**Me tab (`/mechanic/me`):**

- Quick-access menu: Profile, Availability, Documents, Earnings, Payouts, Help, Sign out
- Current online/offline status with toggle
- Pro tier progress card ("3 more jobs to Pro tier")

**Acceptance criteria:**

- [x] Reviews tab fully built *(`/mechanic/reviews` — average + count + responded KPIs, rating filter chips, per-review respond/edit reply; `0012_reviews.sql` + `app/actions/reviews.ts`)*
- [x] Customer review prompt added to the booking flow's confirmation screen and via email after completion (one-tap rating + optional tags + comment) *(form at `/review/[bookingId]`; CTA on the confirmed-page tracker once completed; receipt email has one-tap star deep-links `?rating=N`)*
- [ ] Me tab quick-access menu *(deferred — the Me tab is a mobile bottom-tab destination; lands with the PWA shell. Profile/Availability/Earnings/Documents already exist as their own desktop nav items.)*
- [ ] Pro tier logic (placeholder for now — Pro tier launches in retention task 11) *(deferred to Task 11)*

**Note:** the customer's `mechanics.rating` is recomputed (avg of all their reviews) by `submitReview`. Reviews are append-only via service-role; one review per booking (unique constraint + action guard); the mechanic's single reply goes through `respondToReview`.

**Files touched:**
- `app/(mechanic)/mechanic/reviews/page.tsx`
- `app/(mechanic)/mechanic/me/page.tsx`
- `app/(customer)/review/[booking-id]/page.tsx` (customer review form)
- `app/actions/reviews.ts`
- Schema migration

## What NOT to do in this task

- Don't build native iOS / Android apps — PWA is sufficient per brief
- Don't build live customer tracking — separate task (07 or 08)
- Don't build the full mechanic onboarding / approvals flow — task 07
- Don't implement actual Pro tier benefits — task 11 (Retention)
- Don't build dispute resolution — task 12

## When complete

A mechanic can do their entire job day from a phone — receive offers, accept, drive to the customer, work through the checklist, take payment, get reviewed.

- Update `docs/HANDOFF.md`:
  - Mark task 06 ✅ Complete
  - Set current task to `07-mechanic-onboarding.md`
- Commit and push
