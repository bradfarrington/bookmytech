# Task 11 — Retention: rebooking, reminders, Pro tier

**Status:** ⏳ Queued

Brief phase 4. The features that drive customers back for repeat bookings and reward mechanics for sticking with the platform. Repeat-customer rate target is ≥ 42% within 90 days of launch.

## Why this task

A marketplace lives or dies on retention. The brief sets a clear repeat-booking target (42% within 90 days) — without active retention mechanics, that won't happen. Three independent features here, all aimed at making the platform sticky.

## Three sub-stages — independent

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

- [ ] Rebook flow with same-mechanic preference
- [ ] Reminder scheduler: edge function runs daily, queues reminders due in next 24h
- [ ] Reminder sender: edge function runs hourly, sends queued reminders
- [ ] Email + push notification templates per reminder type
- [ ] Customer preferences UI
- [ ] Reminder click-through tracked (links contain unique tokens that mark `acted_on_at`)

**Files touched:**
- `app/(customer)/dashboard/_components/past-jobs.tsx` (rebook updates)
- `app/(customer)/dashboard/settings/reminders/page.tsx`
- `supabase/functions/schedule-reminders/index.ts`
- `supabase/functions/send-reminders/index.ts`
- `emails/reminder-mot.tsx`, `emails/reminder-service.tsx`, etc.
- Schema migration

---

### Stage 2 — Mechanic Pro tier

Loyalty programme for active, high-rated mechanics.

**Eligibility:**

Calculated nightly. A mechanic enters Pro tier when:

- ≥ 50 completed jobs all-time
- ≥ 4.8 average rating (last 30 jobs)
- ≥ 90% acceptance rate (last 30 days)
- 0 open disputes
- All documents current

If any criterion drops below threshold (with a grace period — 14 days at 4.7 rating before they drop), they exit Pro tier.

**Benefits:**

- **Lower take-rate** — 12% vs 15% (already in pricing engine from task 08)
- **Priority job access** — Pro mechanics see new offers 5 seconds before non-Pro mechanics for the same job (gives them first refusal)
- **Pro badge** — shown in customer-facing mechanic cards, signals quality
- **Instant payouts** — Stripe instant payouts enabled (1% Stripe fee, BMT absorbs)
- **Featured listing** — Pro mechanics promoted in customer area searches
- **Direct support** — separate support channel, faster response

**UI surfaces:**

- `/mechanic/pro` — landing page explaining Pro tier, the mechanic's current progress towards it, what they'd unlock
- Pro badge in the mechanic header (top bar) once active
- Pro tier progress card on the dashboard ("You're 3 jobs from Pro tier" / "Your rating needs to be 4.8 to maintain Pro — currently 4.79")
- Customer-facing: Pro mechanics show a verified Pro badge on their card

**Schema:**

```sql
alter table mechanics add column pro_since timestamptz;
alter table mechanics add column pro_lost_at timestamptz;

create table pro_tier_history (
  id uuid primary key default gen_random_uuid(),
  mechanic_id uuid not null references mechanics(id) on delete cascade,
  event_type text not null, -- 'gained' | 'lost' | 'maintained_check'
  metrics jsonb, -- snapshot of the criteria values at check time
  occurred_at timestamptz not null default now()
);
```

**Acceptance criteria:**

- [ ] Pro tier eligibility check edge function (runs nightly)
- [ ] Take-rate already wired (from task 08) — verify it's 12% for Pro mechanics
- [ ] Priority job offer logic in dispatch (Pro mechanics get 5s head start)
- [ ] Stripe instant payouts enabled for Pro accounts
- [ ] `/mechanic/pro` info page
- [ ] Pro badge in customer-facing UI
- [ ] Pro tier progress card on mechanic dashboard
- [ ] Email when gaining / losing Pro tier

**Files touched:**
- `supabase/functions/pro-tier-check/index.ts`
- `app/(mechanic)/mechanic/pro/page.tsx`
- `app/(mechanic)/mechanic/_components/pro-progress-card.tsx`
- `supabase/functions/dispatch-offer/index.ts` (Pro priority logic)
- `lib/stripe/instant-payouts.ts`
- `emails/pro-tier-gained.tsx`, `emails/pro-tier-lost.tsx`
- Schema migration

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

- [ ] Referral code generated for each customer on signup (existing customers get codes via a one-off migration)
- [ ] Referral share UI on customer dashboard
- [ ] Referee gets credit applied on signup with referral code
- [ ] Referrer credit issued on first completed booking by referee
- [ ] Credits applied automatically at booking checkout
- [ ] Trusted Customer status logic
- [ ] Skip pre-auth flow for trusted customers (capture only on completion)

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
