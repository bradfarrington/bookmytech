# Task 06 — Mechanic mobile PWA

**Status:** ⏳ Queued

Build the phone-optimised mobile experience the mechanic uses in the field. Brief covers this in section 4 (second half). Delivered as a Progressive Web App — installable to home screen, push notifications, offline-capable for the in-progress checklist.

## Why this task

Desktop is for the back-office work (earnings, schedule, profile). When the mechanic is actually working — driving to a job, in someone's driveway with tools out — they need a phone interface designed for one-handed use, with clear urgency cues for new offers and a guided checklist for the work itself.

## Goal

A mechanic can install the PWA to their phone, receive push notifications for new offers, accept jobs from the lock screen experience, navigate a five-step in-progress checklist, get the customer to sign off in-app, and trigger payment capture.

## Five sub-stages

---

### Stage 1 — PWA setup

Make the existing Next.js app installable as a PWA. The desktop and mobile routes coexist in the same app — the mobile experience is just a different responsive view of the same `/mechanic/*` routes, optimised heavily for narrow viewports, with PWA features layered on.

**Acceptance criteria:**

- [ ] `public/manifest.json` — name, short_name, icons (192, 512), theme_color (#2563EB), background_color, display: 'standalone', start_url: '/mechanic'
- [ ] Icons generated at multiple sizes (use a tool like RealFaviconGenerator or just hand-crank a couple of sizes)
- [ ] Service worker registered via `next-pwa` or `@serwist/next` (pick one — `@serwist/next` is the more modern choice)
- [ ] Service worker caches static assets and gives the app an offline fallback page
- [ ] iOS install meta tags in `app/layout.tsx` (Apple touch icon, status bar style, "Add to Home Screen" support)
- [ ] Install prompt logic — show a custom install banner on the mechanic dashboard if the user hasn't installed yet (using `beforeinstallprompt` event)
- [ ] Verify install works on iOS Safari (Add to Home Screen) and Android Chrome (install prompt)

**Files touched:**
- `public/manifest.json`
- `public/icons/*`
- `next.config.js` (PWA config)
- `app/layout.tsx` (meta tags)
- `components/mechanic/install-prompt.tsx`

---

### Stage 2 — Mobile-optimised navigation + day view

Bottom-tab navigation. Single-handed reach. Designed for 375px width primarily.

**Bottom tabs (per brief):** Jobs · Schedule · Earnings · Reviews · Me

**Day view (default tab):**

- Top: greeting + daily summary ("Morning, James. 3 jobs lined up · £284 booked")
- Circular earnings goal ring — progress against today's target (target editable in profile)
- "Up next" card — the next scheduled job with time, customer name, service, address
- Subsequent jobs listed below in compact rows

**Acceptance criteria:**

- [ ] Mobile-only layout at `app/(mechanic)/mechanic/layout.tsx` — sidebar hidden, bottom tabs shown when viewport < 768px
- [ ] Or alternative: separate `app/(mechanic)/mobile/*` route group that mirrors but reshapes — your call, but single-layout-with-responsive is preferred for simplicity
- [ ] Bottom tab bar component (client, persists across navigation)
- [ ] Day view fully built at the mobile breakpoint
- [ ] Tap targets minimum 44px (iOS guideline)
- [ ] Safe area insets respected (notch / home indicator) using `env(safe-area-inset-*)` CSS vars

**Files touched:**
- `components/mechanic/bottom-tabs.tsx`
- `app/(mechanic)/mechanic/page.tsx` updates for mobile
- `app/(mechanic)/mechanic/_components/day-view.tsx`
- `app/(mechanic)/mechanic/_components/earnings-ring.tsx`

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

- [ ] `app/(mechanic)/mechanic/jobs/[id]/in-progress/page.tsx` — step-by-step flow
- [ ] Each step is a screen with: title, instructions, photos field (where relevant), CTA to advance to next step
- [ ] Status updates in `bookings` table at each transition
- [ ] Photos uploaded to Supabase Storage, linked to booking
- [ ] Signature pad at step 5 — use `signature_pad` library, save as PNG to Supabase Storage
- [ ] On "Complete + charge":
  1. Capture the Stripe PaymentIntent (manual capture from task 03 pre-auth)
  2. Set booking status='completed', completed_at=now()
  3. Show payout timing: "Paid 24h after sign-off"
  4. Trigger receipt email to customer
- [ ] Offline support — if the mechanic loses signal mid-job, the checklist state persists locally and syncs when reconnected (use IndexedDB via `idb` library, with a sync server action that runs when online)

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

- [ ] Reviews tab fully built
- [ ] Customer review prompt added to the booking flow's confirmation screen and via email after completion (one-tap rating + optional tags + comment)
- [ ] Me tab quick-access menu
- [ ] Pro tier logic (placeholder for now — Pro tier launches in retention task 11)

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
