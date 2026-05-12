# Task 08 — Pricing engine + Stripe Connect payouts

**Status:** ⏳ Queued

Build the dynamic pricing layer (area multipliers, surge, admin controls) and wire Stripe Connect for mechanic payouts. This is the commercial backbone of the platform — until this exists, mechanics aren't getting paid through the system and pricing is just whatever's in the services table.

## Why this task

The brief (section 6 + phase 3) calls out the commercial model as a day-one priority for the data model, but explicitly defers the *engine* to phase 3. By now we've got bookings flowing through and mechanics doing work — they need to be paid, and the platform needs to start protecting margin via area multipliers and surge.

## Four sub-stages

---

### Stage 1 — Pricing engine

Replace "starting_price_pence" as the booking total with a calculated total that accounts for area multiplier, surge multiplier, and (later) parts margin.

**Schema:**

```sql
create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- "London Z1-Z2", "Manchester central", etc.
  postcode_prefixes text[] not null, -- ['EC', 'WC', 'W1', 'SW1', ...]
  base_multiplier numeric(4,3) not null default 1.000, -- 1.050 = +5%
  surge_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table service_overrides (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references services(id) on delete cascade,
  area_id uuid references areas(id) on delete cascade,
  override_price_pence integer, -- if set, overrides starting_price_pence * multiplier
  is_active boolean not null default true,
  primary key (service_id, area_id) -- one override per service-area pair
);

alter table bookings add column area_id uuid references areas(id);
alter table bookings add column base_price_pence integer;
alter table bookings add column area_multiplier numeric(4,3) default 1.000;
alter table bookings add column surge_multiplier numeric(4,3) default 1.000;
alter table bookings add column platform_fee_pence integer;
alter table bookings add column mechanic_payout_pence integer;
```

**Pricing function** (`lib/pricing/calculate.ts`):

```ts
function calculatePrice(serviceId, postcode): {
  basePence: number
  areaMultiplier: number
  surgeMultiplier: number
  totalPence: number
  platformFeePence: number  // 15% of (total - parts)
  mechanicPayoutPence: number
}
```

Steps:

1. Look up service starting_price_pence
2. Resolve postcode → area (match postcode prefix against areas.postcode_prefixes)
3. Check for service_override on (service, area); if present, use override_price_pence as base; else, base = starting_price * area.base_multiplier
4. If area.surge_enabled and current demand/supply ratio > 3:1, apply 1.15 surge multiplier
5. Calculate platform_fee = 15% of total (or 12% if mechanic.is_pro)
6. mechanic_payout = total - platform_fee
7. Return all parts

**Acceptance criteria:**

- [ ] Schema migration with areas, service_overrides, booking pricing columns
- [ ] Pricing engine function implemented and unit tested
- [ ] Booking flow (`/book/match`) updated to call the pricing engine instead of using starting_price_pence directly
- [ ] Booking row populated with base, multipliers, fees, payout breakdown
- [ ] Mechanic earnings breakdown in task 05 updated to read from booking pricing columns
- [ ] Seed 4–5 areas: "London Z1-Z2" (×1.15), "London Z3-Z6" (×1.05), "Manchester" (×1.00), "Rural" (×1.10), "Default" (catch-all, ×1.00)

**Files touched:**
- `lib/pricing/calculate.ts`
- `lib/pricing/calculate.test.ts`
- `app/(customer)/book/match/page.tsx` (uses pricing engine)
- `app/actions/create-booking.ts` (saves pricing breakdown)
- Schema migration

---

### Stage 2 — Admin pricing controls

`/admin/pricing` page from section 5 of the brief.

**Layout:**

- **Base service prices** — table of all services with editable starting prices. Inline edit, save on blur. Mirrors the services CRUD but focused on pricing.
- **Area multipliers** — table of areas with editable multiplier, surge toggle, add/edit/delete areas
- **Service overrides** — rare per-area-per-service price overrides. Add by selecting a service + area + override price.
- **Surge pricing settings** — global toggle, demand:supply ratio threshold (default 3:1), surge multiplier (default 1.15)
- **Take-rate** — base (15%) and Pro tier (12%) — editable

**Schema:**

```sql
create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

-- Seeded keys: take_rate_base (0.15), take_rate_pro (0.12), surge_threshold (3.0), surge_multiplier (1.15)
```

**Acceptance criteria:**

- [ ] `/admin/pricing` page with all four sections
- [ ] Each section has inline editing with optimistic UI and server actions
- [ ] Changes audited — `pricing_audit_log` table records who changed what and when
- [ ] Take-rate changes apply to *new* bookings only, not retroactively (enforce this in the pricing engine — use the rate from booking creation time)

**Files touched:**
- `app/(admin)/admin/pricing/page.tsx`
- `app/(admin)/admin/pricing/_components/` (one per section)
- `app/actions/pricing.ts`
- Schema migration (platform_settings, pricing_audit_log)

---

### Stage 3 — Surge engine

A background job that monitors demand/supply per area and toggles surge on/off automatically.

**How it works:**

- A scheduled Supabase Edge Function runs every 5 minutes
- For each active area, count:
  - Demand: pending + recent bookings (last 30 min) in the area
  - Supply: online mechanics in the area with matching specialisms
- If demand:supply > threshold (configurable, default 3:1), set `area.surge_enabled = true`
- If it drops below 2:1 (hysteresis to prevent flapping), set surge back off
- Log surge state changes for analytics

**Customer-facing surge UX:**

- When surge is active in the customer's area, the booking flow shows a subtle note: "Higher demand in your area — small surcharge applied." No multiplier shown explicitly.
- This is one of the open questions in section 11 of the brief — we're picking the "don't show multiplier explicitly" option. Easy to flip later.

**Acceptance criteria:**

- [ ] Edge function `surge-monitor` deployed with 5-minute cron schedule
- [ ] Surge state changes logged in `surge_log` table
- [ ] Booking flow shows the subtle surge note when active
- [ ] Admin pricing page shows current surge state per area

**Files touched:**
- `supabase/functions/surge-monitor/index.ts`
- `app/(customer)/book/match/_components/surge-note.tsx`
- Schema migration (surge_log table)

---

### Stage 4 — Stripe Connect for mechanic payouts

The mechanic-side payment rails. Mechanics onboard with Stripe Connect Express; the platform takes the fee and pays mechanics out.

**Onboarding flow:**

- New entry in mechanic onboarding (or as part of approval): mechanic clicks "Connect bank account"
- Redirects to Stripe Connect Express onboarding (Stripe-hosted)
- Stripe collects KYC info, bank details, identity verification
- Returns to BMT with a connected_account_id stored on the mechanic
- Mechanic can't accept jobs until Stripe onboarding complete

**Schema:**

```sql
alter table mechanics add column stripe_account_id text;
alter table mechanics add column stripe_onboarding_complete boolean not null default false;
alter table mechanics add column stripe_charges_enabled boolean not null default false;
alter table mechanics add column stripe_payouts_enabled boolean not null default false;
```

**Capture flow (updates from task 06):**

When the mechanic completes a job:
1. Capture the PaymentIntent (already done in task 06)
2. Create a transfer from the platform account to the mechanic's connected account for the mechanic_payout_pence amount
3. Stripe handles the actual payout to the mechanic's bank on its standard schedule (or set instant payouts for Pro tier mechanics later)

**Earnings page updates:**

- Real payout data from Stripe (replace the seed data from task 05)
- Use Stripe's `/transfers` API to fetch the mechanic's transfer history
- Pending vs paid status reflects Stripe state

**Acceptance criteria:**

- [ ] Stripe Connect set up (test mode), Express onboarding URL generation working
- [ ] Mechanic onboarding step added: "Connect bank account" → redirects to Stripe → returns to BMT
- [ ] Webhook handler at `/api/webhooks/stripe` handles `account.updated` to keep `stripe_*` columns in sync
- [ ] Mechanic without Stripe completed cannot toggle online (UI disables it with explanation)
- [ ] Capture flow updated to create transfers
- [ ] Earnings page reads real Stripe transfer data
- [ ] Test the flow end-to-end with Stripe test bank accounts

**Files touched:**
- `app/(mechanic)/mechanic/onboarding/stripe/page.tsx`
- `app/api/webhooks/stripe/route.ts`
- `app/actions/stripe-connect.ts`
- `app/actions/capture-payment.ts` (updated to also transfer)
- `lib/stripe/connect.ts`
- Schema migration

## What NOT to do in this task

- Don't build parts margin layer — task 10
- Don't build Pro tier mechanic benefits — task 11
- Don't build refund / dispute flow — task 12
- Don't build instant payouts — standard Stripe schedule is fine
- Don't try to be smart about surge — simple ratio-based with hysteresis is sufficient

## When complete

- Update `docs/HANDOFF.md`
- Commit and push

The platform is now commercially live — bookings priced by area, mechanics paid via Stripe, surge active when demand spikes.
