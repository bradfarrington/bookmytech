# Task 13 — Final integrations (Pro tier + SMS)

**Status:** 🟡 Stage B (SMS) complete (2026-06-06) — Stage A (Pro tier) still queued.

Stage B notes:
- Ported the sms-credits skill to BMT's stack: **Next.js route handlers + server
  actions, not Supabase edge functions** (project convention). SMS state lives in
  a dedicated `sms_settings` singleton (migration `0026_sms_credits.sql`), not a
  `business_profile` table — gives a typed integer balance decremented atomically
  via `reserve_sms_credit()` / `refund_sms_credit()` (reserve-before-Twilio,
  refund-on-failure) so concurrent senders never oversend or charge for a failure.
- `lib/sms/send-sms.ts` is now a real Twilio sender (signature unchanged). Admin
  panel at `/admin/sms` (balance, enable toggle, sender ID, low-credit alert
  email, 10p/credit packages, test send, purchase history). Buy-credits uses
  **GoCardless** Instant Bank Pay (the agency reselling credits to the BMT owner;
  Stripe is untouched). Webhook `app/api/webhooks/gocardless-sms` verifies the
  HMAC over the raw body, tops up idempotently, and raises a paid **Xero** invoice
  (env-gated `XERO_*`).
- Touchpoint decisions (#4–#8): wired **#4 mechanic on the way** and **#5 booking
  confirmed/complete/cancelled** (customer SMS). #6 (Pro gained/lost) belongs to
  Stage A. #7 (dispatch-stall) and #8 (referral credit) left **email-only**.
- **Gap flagged:** the booking funnel never collected a customer phone, so
  `bookings.customer_phone` was always null. Now backfilled from the signed-in
  customer's `profiles.phone` at creation. **Guest bookings still have no phone**
  → their lifecycle SMS stay dormant until the funnel collects one (follow-up).

The "wire it all up at the end" task. Two things were deliberately carried to the
final slot of the roadmap so they land once everything they touch already
exists:

1. **Mechanic Pro tier** — moved here from Task 11 Stage 2. It depends on
   mature ratings / disputes / documents data and on the dispatch layer, so it's
   cleaner to switch on last.
2. **SMS** — the Twilio pay-as-you-go sender + credit top-up infrastructure, and
   the wiring of every SMS touchpoint the rest of the app has stubbed along the
   way. Per the project's notifications decision (**email + SMS, push deferred to
   the native app**), a lot of code already *expects* an SMS sender to exist —
   it just no-ops today. This task makes it real.

> **Why a separate task?** The earlier stages were built to be SMS-ready without
> blocking on Twilio: `lib/sms/send-sms.ts` is a stub that logs and returns
> `false`, and call sites are best-effort (`.catch(() => {})`). That let the
> booking / messaging / reminder features ship and be tested over email while
> the billing-grade SMS plumbing (credits, top-ups, reconciliation) is built
> once, here.

---

## Stage A — Mechanic Pro tier

*(Moved verbatim from Task 11 Stage 2. Take-rate is already wired in the pricing
engine from Task 08 — this stage turns on eligibility + the benefits + the UI.)*

Loyalty programme for active, high-rated mechanics.

**Eligibility** (calculated nightly). A mechanic enters Pro tier when:

- ≥ 50 completed jobs all-time
- ≥ 4.8 average rating (last 30 jobs)
- ≥ 90% acceptance rate (last 30 days)
- 0 open disputes
- All documents current

If any criterion drops below threshold (with a grace period — 14 days at 4.7
rating before they drop), they exit Pro tier.

**Benefits:**

- **Lower take-rate** — 12% vs 15% (already in pricing engine from Task 08; the
  `take_rate_pro` platform setting is seeded/editable but **not yet applied to
  bookings** because no mechanic is assigned at creation under broadcast
  dispatch — see the Task 08 closeout note. This stage decides where the Pro
  rate gets snapshotted: most likely at **offer-accept** time, re-pricing the
  booking's commission/payout when a Pro mechanic wins it).
- **Priority job access** — Pro mechanics see new offers 5 seconds before
  non-Pro mechanics for the same job (first refusal). This is the deferred
  "Pro-tier dispatch priority" from Tasks 08/09. Implement in `dispatchBooking`
  (a Pro-only offer wave, then a broadcast wave ~5s later) and/or in the offer
  feed's visibility gate.
- **Pro badge** — shown in customer-facing mechanic cards.
- **Instant payouts** — Stripe instant payouts enabled (1% Stripe fee, BMT absorbs).
- **Featured listing** — Pro mechanics promoted in customer area searches.
- **Direct support** — separate support channel, faster response.

**UI surfaces:** `/mechanic/pro` (landing + progress), Pro badge in the mechanic
top bar, a Pro-progress card on the dashboard ("You're 3 jobs from Pro tier"),
and a customer-facing verified-Pro badge on mechanic cards.

**Schema:**

```sql
alter table mechanics add column pro_since timestamptz;
alter table mechanics add column pro_lost_at timestamptz;

create table pro_tier_history (
  id uuid primary key default gen_random_uuid(),
  mechanic_id uuid not null references mechanics(id) on delete cascade,
  event_type text not null, -- 'gained' | 'lost' | 'maintained_check'
  metrics jsonb,            -- snapshot of the criteria values at check time
  occurred_at timestamptz not null default now()
);
```

**Acceptance criteria:**

- [ ] Pro tier eligibility check (nightly cron route — follow the existing
      `/api/cron/*` + `vercel.json` pattern, **not** a Supabase edge function)
- [ ] Take-rate verified at 12% for Pro mechanics (decide + implement the
      snapshot point — see the take-rate note above)
- [ ] Priority job offer logic in dispatch (Pro mechanics get a 5s head start)
- [ ] Stripe instant payouts enabled for Pro accounts
- [ ] `/mechanic/pro` info page
- [ ] Pro badge in customer-facing UI
- [ ] Pro tier progress card on mechanic dashboard
- [ ] Email (and SMS, once Stage B lands) when gaining / losing Pro tier

**Files (indicative):**
- `app/api/cron/pro-tier-check/route.ts`
- `app/(mechanic)/mechanic/pro/page.tsx`
- `app/(mechanic)/mechanic/_components/pro-progress-card.tsx`
- `lib/dispatch/dispatch.ts` (Pro-priority wave)
- `lib/stripe/instant-payouts.ts`
- `emails/pro-tier-gained.ts`, `emails/pro-tier-lost.ts`
- Schema migration

---

## Stage B — SMS infrastructure + wire every touchpoint

The app already routes notifications through email + SMS by design, but the SMS
half is a stub. This stage installs billing-grade SMS and connects it.

**Install:** use the **`sms-credits` skill** — it drops in a Twilio send endpoint
that deducts credits, a GoCardless Instant Bank Pay top-up flow, webhook
reconciliation, optional Xero invoicing, and a settings panel for monitoring
balance / buying credits / viewing history. **Note (from the skill):** it does
*not* ship a per-app SMS composer — each app builds its own send-call UI. Book My
Tech doesn't need a composer; it needs the transactional `sendSms()` to become
real and bill against credits.

**Make the sender real:** replace the body of [`lib/sms/send-sms.ts`](../../lib/sms/send-sms.ts)
so it calls the credit-deducting Twilio endpoint instead of logging. Keep the
signature (`sendSms({ to, body }) → Promise<boolean>`) so no call site changes.
Env: `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` (+ whatever the
sms-credits skill needs for top-ups).

### SMS touchpoint catalogue (everything to wire)

Audit done 2026-06-05. These are the places that already call `sendSms` or that
should gain an SMS once the sender is real. Email is built and working at all of
them today; SMS is the gap.

**Already calling `sendSms()` (will start actually sending once real):**

1. **In-app message fallback** — [`app/actions/messages.ts`](../../app/actions/messages.ts).
   When a **mechanic** messages a **customer** who has a phone on the booking,
   it fires an SMS nudge. Best-effort (`.catch(() => {})`).

**Stubbed / planned, not yet wired:**

2. **Unread-message sweep** — the documented-but-unbuilt 5-minute cron over
   `messages` where `read_at is null and created_at < now() - interval '5
   minutes'`, to SMS the recipient about an unseen message (see the comment in
   `lib/sms/send-sms.ts`). Build as `/api/cron/message-sms-sweep` + add to
   `vercel.json`.

3. **Service reminders (Task 11 Stage 1)** — the reminder **sender**
   ([`app/api/cron/send-reminders/route.ts`](../../app/api/cron/send-reminders/route.ts))
   already branches on the customer's `reminder_via_sms` preference and calls
   `sendSms()` for the SMS channel. It no-ops today; it'll send once the sender
   is real. The reminder **preferences UI**
   (`/dashboard/settings/reminders`) already exposes the SMS channel toggle.

**Email-only today — candidates for an added SMS once billing exists** (decide
per-event in this task; not all need SMS):

4. **Booking lifecycle → customer** — booking received, *mechanic on the way*
   (`startJourney` in [`app/actions/job-progress.ts`](../../app/actions/job-progress.ts)),
   job complete / receipt, cancellation, reschedule confirmations
   ([`app/actions/customer-bookings.ts`](../../app/actions/customer-bookings.ts)).
   "On the way" is the highest-value SMS candidate.
5. **Customer settings copy** — [`settings-form.tsx`](../../app/(customer)/dashboard/settings/_components/settings-form.tsx)
   already tells customers their mobile is "used for booking updates and SMS
   notifications", and the reminders prefs page exposes an SMS toggle — so the
   promise is in the UI ahead of the sender. Closing this stage makes that true.
6. **Mechanic Pro tier (Stage A)** — gained/lost notifications.
7. **Admin dispatch-stall alert** — [`dispatch-sweep`](../../app/api/cron/dispatch-sweep/route.ts)
   currently emails the admin; an SMS escalation could be added.
8. **Referral / credit events (Task 11 Stage 3)** — "you earned £10" could SMS.

**Acceptance criteria:**

- [x] `sms-credits` infra installed (Twilio send-with-credit-deduction endpoint,
      GoCardless top-up, webhook reconciliation, settings panel)
- [x] `lib/sms/send-sms.ts` sends for real and deducts a credit (signature unchanged)
- [ ] Touchpoints #1–#3 above verified end-to-end on a real number — **wiring
      complete; live verification pending the user supplying Twilio + GoCardless
      credentials** (see env list below). Code paths exercised; no live creds in dev.
- [x] Decide + wire which of #4–#8 get an SMS (#4 + #5 wired; #7/#8 email-only — see Status note)
- [x] Unread-message sweep cron built + scheduled (`/api/cron/message-sms-sweep`, `*/5`)
- [x] Low-credit-balance alerting (so transactional SMS never silently fails)

**Env to set (`.env.local` + Vercel) before live verification:**
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`; `GOCARDLESS_ACCESS_TOKEN`,
`GOCARDLESS_ENVIRONMENT`, `GOCARDLESS_WEBHOOK_SECRET` (+ optional
`GOCARDLESS_API_VERSION`); `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`,
`XERO_CONTACT_NAME`, `XERO_CONTACT_EMAIL`, `XERO_SALES_ACCOUNT_CODE`. Register the
GoCardless webhook endpoint at `/api/webhooks/gocardless-sms`.

**Files (indicative):**
- `lib/sms/send-sms.ts` (real implementation)
- whatever the `sms-credits` skill installs (endpoint, top-up flow, settings panel, migration)
- `app/api/cron/message-sms-sweep/route.ts`
- `vercel.json` (new cron entry)

---

## What NOT to do in this task

- Don't build an SMS marketing/campaign tool — this is transactional SMS only.
- Don't build a per-app SMS composer (the `sms-credits` skill intentionally omits
  one; BMT doesn't need it).
- For the Pro tier, don't build tier sub-levels — single Pro tier is enough.

## When complete

- Update `docs/HANDOFF.md`
- Commit and push
