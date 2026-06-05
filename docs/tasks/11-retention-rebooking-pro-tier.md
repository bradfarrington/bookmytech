# Task 11 — Retention: rebooking, reminders, loyalty

**Status:** ✅ Complete (2026-06-05) — Stage 1 (rebooking + reminders, `0023`) · Stage 3 (referrals + credits + Trusted Customer skip-pre-auth, `0024`). **Stage 2 (Mechanic Pro tier) was moved to [Task 13 — Final integrations](13-final-integrations.md)** (owner decision 2026-06-05): the Pro tier depends on the dispatch layer + mature ratings/disputes data and is cleaner to switch on last, alongside the SMS infrastructure. The stage headings below keep their original **Stage 1 / Stage 3** numbers so cross-references elsewhere still resolve; there is intentionally no Stage 2 here. ⚠️ Apply migrations `0023`–`0024`; the deferred/free Stripe paths weren't live-fired (see Stage 3 notes).

Brief phase 4. The features that drive customers back for repeat bookings and reward mechanics for sticking with the platform. Repeat-customer rate target is ≥ 42% within 90 days of launch.

## Why this task

A marketplace lives or dies on retention. The brief sets a clear repeat-booking target (42% within 90 days) — without active retention mechanics, that won't happen. Two independent features here (rebooking + reminders, and referrals + loyalty), both aimed at making the platform sticky. The third — the mechanic Pro tier — moved to Task 13.

## Sub-stages — independent

---

### Stage 1 — Customer rebooking + service reminders

Make repeat bookings frictionless. Proactively prompt customers when their car needs attention.

**One-tap rebook (from customer dashboard):**

Already lightly built in task 09. Extend with:

- "Same mechanic if available" toggle (default on)
- Prefill: same service, same address, same vehicle
- Show next available slot for that mechanic
- One-tap confirm

**Service reminder system:**

When a booking completes, look at the vehicle's data (from DVLA) to derive likely future needs:

- **MOT due** — DVLA gives MOT expiry. 30 days before, email + push: "Your MOT is due on <date> — book your pre-check now"
- **Service interval** — based on vehicle age and last service:
  - Cars driven 8,000-12,000 mi/year → full service every 12 months
  - More if business mileage
- **Seasonal** — winter battery check (October–November), summer air-con regas (May–June)
- **Post-job rebook** — for jobs likely to need follow-up (brake check 6 months on, etc.)

**Schema:**

```sql
create table reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id),
  vehicle_reg text not null,
  reminder_type text not null, -- 'mot_due' | 'annual_service' | 'winter_battery' | etc.
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  acted_on_at timestamptz, -- when customer clicked through
  service_suggestion uuid references services(id),
  created_at timestamptz not null default now()
);
```

**Customer preferences:**

In account settings, customer can opt out of reminders or pick channels (email / SMS / push).

**Acceptance criteria:**

- [x] Rebook flow with same-mechanic preference — one-tap `RebookControl` on past jobs deep-links to `/book/slot` (vehicle/service/postcode pre-filled, skipping reg lookup + service pick) with a "same mechanic if available" toggle that threads `?pref=<mechanicId>` → `bookings.preferred_mechanic_id`. `dispatchBooking` offers the job **exclusively** to that mechanic when they're online + eligible; otherwise it broadcasts normally. (No mechanic-specific availability calendar — uses the standard 7-day slot picker; "next available slot for that mechanic" simplified, broadcast model.)
- [x] Reminder scheduler: runs daily — `/api/cron/schedule-reminders` (`0 6 * * *`) back-fills future reminders from recently-completed bookings; reminders are also seeded inline at completion (`completeAndCharge`). **Deviation:** a Next API cron route, not a Supabase edge function (project convention — see HANDOFF).
- [x] Reminder sender: runs hourly — `/api/cron/send-reminders` (`0 * * * *`) sends due-and-unsent reminders on the customer's chosen channels, stamps `sent_at`. (Same edge-function → API-route deviation.)
- [x] Email templates per reminder type — one parameterised MJML template (`emails/reminder.ts`) driven by `REMINDER_META` (MOT / annual service / winter battery / summer air-con / brake follow-up). **Push deferred** to the native app per the notifications decision — email now, SMS channel wired but stubbed until Task 13.
- [x] Customer preferences UI — `/dashboard/settings/reminders` (master on/off + email + SMS channel toggles; `profiles.reminders_enabled/reminder_via_email/reminder_via_sms`), linked from the settings page.
- [x] Reminder click-through tracked — each row has a unique `token`; the CTA points at `/r/<token>`, which stamps `acted_on_at` and deep-links into a pre-filled rebook.

**Implementation notes / deviations:**
- "Edge function" in the spec → **Next.js API cron routes** + `vercel.json` (the whole app uses this pattern; there are no Supabase edge functions). Both crons honour `CRON_SECRET`.
- **Push channel dropped** (deferred to the native app, per project memory); reminders go email + SMS only, and the SMS sender is the Task 13 stub today.
- Pure `deriveReminders` is unit-tested (`lib/reminders/derive.test.ts`, 5 cases; `npm test` now 36). MOT expiry isn't persisted on bookings, so the scheduler does a best-effort DVLA/DVSA lookup per car.
- Migration `0023` adds `bookings.preferred_mechanic_id`, the `profiles` reminder-pref columns, and `reminder_schedules` (admin + own-customer SELECT RLS; privileged service-role writes). ⚠️ **Apply `0023`** before testing.

**Files touched:**
- `app/(customer)/dashboard/_components/past-jobs.tsx` (rebook updates)
- `app/(customer)/dashboard/settings/reminders/page.tsx`
- `supabase/functions/schedule-reminders/index.ts`
- `supabase/functions/send-reminders/index.ts`
- `emails/reminder-mot.tsx`, `emails/reminder-service.tsx`, etc.
- Schema migration

---

### Stage 2 — Mechanic Pro tier → MOVED to Task 13

The mechanic Pro tier (loyalty programme, 12% take-rate, 5s dispatch priority,
instant payouts, Pro badges, nightly eligibility check) has been **moved to
[Task 13 — Final integrations, Stage A](13-final-integrations.md#stage-a--mechanic-pro-tier)**.
The full spec lives there. Nothing Pro-related is built in Task 11.

---

### Stage 3 — Referral programme + customer loyalty

Drive growth through existing customers.

**Customer referrals:**

- Each customer gets a unique referral code
- Share via email, SMS, or copy link
- Referee gets £10 off their first booking
- Referrer gets £10 credit after referee's first completed booking
- Credits stored in `customer_credits` table, applied automatically at checkout

**Customer loyalty:**

- After 3 completed bookings, customer enters "Trusted Customer" status
- Benefits: skip booking pre-auth (pay after job), early access to new features
- Visual indicator in their dashboard

**Schema:**

```sql
alter table profiles add column referral_code text unique;
alter table profiles add column referred_by uuid references profiles(id);

create table customer_credits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade,
  amount_pence integer not null,
  source text not null, -- 'referral_bonus' | 'compensation' | 'promo' | etc.
  description text,
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_booking_id uuid references bookings(id),
  created_at timestamptz not null default now()
);
```

**Acceptance criteria:**

- [x] Referral code generated for each customer on signup — `signUp` mints a unique `BMT######` code (`lib/credits/referral-code.ts`, retry-on-collision); existing customers back-filled in migration `0024`.
- [x] Referral share UI on customer dashboard — `ReferralCard` (give-£10-get-£10, copy link + Web Share, shows current credit balance).
- [x] Referee gets credit applied on signup with referral code — `?ref=<code>` flows through the signup page → form hidden field → `signUp`, which sets `referred_by` and grants the referee a £10 `referral_welcome` credit (self-referral / bad code no-op).
- [x] Referrer credit issued on first completed booking by referee — `completeAndCharge` grants the referrer £10 `referral_bonus` when the referee hits their **first** completed booking (gated on first-completion so it fires once per referee).
- [x] Credits applied automatically at booking checkout — `prepareCheckout` computes `applied = min(balance, total)` server-side; the charge/PI is reduced by it; `createBookingAction` redeems it via a ledger row and snapshots `credit_applied_pence`. Mechanic payout + platform fee stay computed on the full total (credit is platform-funded).
- [x] Trusted Customer status logic — `isTrusted` = 3+ completed bookings; surfaced as a dashboard badge.
- [x] Skip pre-auth flow for trusted customers (capture only on completion) — Trusted Customers get the **`deferred`** payment mode: no hold is placed; the card is saved via a Stripe **SetupIntent** at booking and charged off-session in `completeAndCharge`. (A third `free` mode handles credit covering the whole total — no card taken.)

**Implementation notes / deviations:**
- **Three payment modes** on `bookings.payment_mode`: `preauth` (default — guests + non-trusted, manual-capture hold; unchanged path), `deferred` (Trusted Customer — saved card, charge on completion), `free` (account credit ≥ total — no card). Credit reduces the **charge**, never the mechanic payout/platform fee.
- **Credits are a ledger** (`customer_credits`): positive grants, negative redemptions; balance = sum of unexpired rows. Grants expire after 365 days; redemptions don't.
- Pure `referralCodeFromBytes` / `normaliseReferralCode` unit-tested (`lib/credits/referral-code.test.ts`, 3 cases; `npm test` now 39).
- ⚠️ Migration `0024` adds `profiles.referral_code/referred_by` (+ backfill), `customer_credits`, and the `bookings` credit/deferred columns. **Apply `0024`.** ⚠️ The **deferred (SetupIntent off-session) + free flows were not live-fired against Stripe** this session (no running app/keys) — build + 39 unit tests pass; the guest pre-auth path is byte-for-byte unchanged. Exercise a trusted-customer booking + a credited booking before relying on them.
- **Partial-deposit interaction:** the Trusted skip-pre-auth means some bookings now take **no hold** at booking, only charge on completion — the first place the app departs from "full price pre-authorised". Booking copy was kept truthful per-mode (see [booking-pre-auth-not-deposit](../../memory)).

**Files touched:**
- `app/(customer)/dashboard/refer/page.tsx`
- `app/signup/page.tsx` (handle ?ref= query param)
- `app/(customer)/book/slot/_components/confirm-bar.tsx` (apply credits)
- `lib/credits/apply.ts`
- `supabase/functions/issue-referral-credit/index.ts` (triggered on booking completion)
- Schema migration

## What NOT to do in this task

- Don't build a full marketing automation system — these are simple email/push triggers
- Don't build complex tier systems (silver/gold/platinum customers) — Trusted Customer is enough
- Don't build a redeemable points system — money credits are simpler and clearer

## When complete

- Update `docs/HANDOFF.md`
- Commit and push
