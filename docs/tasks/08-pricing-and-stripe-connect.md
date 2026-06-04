# Task 08 — Pricing engine + Stripe Connect payouts

**Status:** ✅ Complete (2026-06-04) — all three stages shipped. Migrations `0016`–`0018`. Key deviations: (1) **commission is charged on the whole total** (base + parts), not labour-only — owner decision, supersedes the earlier `lib/earnings.ts` model; (2) `service_area_prices.commission_rate` is **nullable** (null = inherit) and a per-service `services.commission_rate` was added, so the engine resolves commission per-cell → per-service → platform default; (3) Stripe Connect accounts are created **lazily** on the mechanic's first "Connect bank account" click (via the `/mechanic/onboarding/stripe` page + "Get paid" nav item), not at approval time; (4) **Pro-tier** commission isn't applied at booking creation because no mechanic is assigned yet under broadcast dispatch — `take_rate_pro` is seeded/editable but wiring it onto bookings is deferred to Task 11.

Build the dynamic pricing layer (area multipliers, per-service commission, admin controls) and wire Stripe Connect for mechanic payouts. This is the commercial backbone of the platform — until this exists, mechanics aren't getting paid through the system and pricing is just whatever's in the services table.

**Surge pricing is not part of this platform.** Do not implement it, reference it, or leave hooks for it.

## Why this task

The brief (section 6 + phase 3) calls out the commercial model as a day-one priority for the data model, but explicitly defers the *engine* to phase 3. By now we've got bookings flowing through and mechanics doing work — they need to be paid, and the platform needs to start protecting margin via area multipliers.

## Three sub-stages

---

### Stage 1 — Pricing engine

Replace "starting_price_pence" as the booking total with a calculated total that accounts for area labour multiplier and per-service commission. Parts pricing uses dummy data keyed by area during development; a live parts API replaces it in production.

**Schema:**

```sql
create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- "London Z1-Z2", "Manchester central", etc.
  postcode_prefixes text[] not null, -- ['EC', 'WC', 'W1', 'SW1', ...]
  labour_multiplier numeric(4,3) not null default 1.000, -- 1.050 = +5% on labour portion
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table service_area_prices (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references services(id) on delete cascade,
  area_id uuid references areas(id) on delete cascade,
  override_price_pence integer, -- if set, overrides starting_price_pence * labour_multiplier
  parts_price_pence integer,    -- dummy parts cost for this service in this area (dev only)
  commission_rate numeric(5,4) not null default 0.1500, -- e.g. 0.1500 = 15%
  is_active boolean not null default true,
  unique (service_id, area_id)
);

alter table bookings add column area_id uuid references areas(id);
alter table bookings add column base_price_pence integer;
alter table bookings add column labour_multiplier numeric(4,3) default 1.000;
alter table bookings add column commission_rate numeric(5,4);
alter table bookings add column platform_fee_pence integer;
alter table bookings add column mechanic_payout_pence integer;
```

**Pricing function** (`lib/pricing/calculate.ts`):

```ts
function calculatePrice(serviceId, postcode): {
  basePence: number
  labourMultiplier: number
  partsPence: number
  totalPence: number
  commissionRate: number
  platformFeePence: number
  mechanicPayoutPence: number
}
```

Steps:

1. Look up service `starting_price_pence`
2. Resolve postcode → area (match postcode prefix against `areas.postcode_prefixes`)
3. Look up `service_area_prices` for (service, area). If a row exists and `override_price_pence` is set, use it as base; otherwise base = `starting_price_pence * area.labour_multiplier`
4. Add `parts_price_pence` from `service_area_prices` (dummy data; zero if not set)
5. Resolve commission rate: use `service_area_prices.commission_rate` if set, else fall back to `platform_settings.take_rate_base`. Pro-tier mechanics use `platform_settings.take_rate_pro`.
6. `platform_fee = round(total * commissionRate)`
7. `mechanic_payout = total - platform_fee`
8. Return all parts

**Acceptance criteria:**

- [x] Schema migration with areas, service_area_prices, booking pricing columns (`0016`)
- [x] Pricing engine function implemented and unit tested (`lib/pricing/calculate.ts`, 16 Vitest cases; pure `computePrice`/`resolveArea` + async `calculatePrice`)
- [x] Booking flow (`/book/match`) updated to call the pricing engine instead of using starting_price_pence directly (also `/book/slot`)
- [x] Booking row populated with base, multiplier, commission rate, fees, payout breakdown — recomputed server-side at PI creation **and** insert so a client can't tamper with the price
- [x] Mechanic earnings breakdown in task 05 updated to read from booking pricing columns (`mechanic_payout_pence`)
- [x] Seed 4–5 areas: "London Z1-Z2" (×1.15), "London Z3-Z6" (×1.05), "Manchester" (×1.00), "Rural" (×1.10), "Default" (catch-all, ×1.00)
- [x] Seed dummy parts prices for each service/area combination

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
- **Per-service commission** — each service has its own commission rate (shown as a percentage, stored as a decimal). Editable inline. Falls back to the platform default if not set.
- **Area labour multipliers** — table of areas with editable labour multiplier, add/edit/delete areas. No surge toggle.
- **Service/area price overrides and dummy parts costs** — per-service per-area overrides. Add by selecting a service + area + override price + parts cost (dummy for dev).
- **Cancellation fee tiers** — three configurable thresholds: cancellation more than 24 h before appointment (default £0), within 24 h (default £30), mechanic already on the way (default £50).
- **Default commission rates** — fallback take-rate base and Pro tier rate, used when no per-service rate is set.

**Schema:**

```sql
create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

-- Seeded keys:
--   take_rate_base (0.15)      — fallback commission rate
--   take_rate_pro (0.12)       — Pro tier commission rate
--   cancel_fee_before_24h (0)  — pence charged when cancelled >24h before slot
--   cancel_fee_within_24h (3000) — pence charged when cancelled within 24h
--   cancel_fee_mechanic_en_route (5000) — pence charged when mechanic is on the way
```

**Acceptance criteria:**

- [x] `/admin/pricing` page with all six sections above
- [x] Each section has inline editing with optimistic UI and server actions (reusable `InlineNumber`/`InlineText` cells)
- [x] Changes audited — `pricing_audit_log` table records who changed what and when (`0017`)
- [x] Commission and fee changes apply to *new* bookings only, not retroactively (engine snapshots the rate onto the booking row at creation time)

**Files touched:**
- `app/(admin)/admin/pricing/page.tsx`
- `app/(admin)/admin/pricing/_components/` (one per section)
- `app/actions/pricing.ts`
- Schema migration (platform_settings, pricing_audit_log)

---

### Stage 3 — Stripe Connect for mechanic payouts

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

When the mechanic marks a job complete:
1. Capture the PaymentIntent — the pre-authorised deposit is now charged (already done in task 06)
2. Create a transfer from the platform account to the mechanic's connected account for `mechanic_payout_pence`
3. The platform retains `platform_fee_pence` as commission
4. Stripe handles the actual payout to the mechanic's bank on its standard schedule

**Mechanic cancellation — payment hold behaviour:**
If the originally assigned mechanic cancels, do NOT cancel the PaymentIntent. Keep it on hold. When a replacement mechanic accepts and completes the job, capture as normal but transfer to the replacement mechanic's `stripe_account_id`. This avoids charging the customer twice.

**Earnings page updates:**

- Real payout data from Stripe (replace the seed data from task 05)
- Use Stripe's `/transfers` API to fetch the mechanic's transfer history
- Pending vs paid status reflects Stripe state

**Acceptance criteria:**

- [x] Stripe Connect set up (test mode), Express onboarding URL generation working (`lib/stripe/connect.ts`)
- [x] Mechanic onboarding step added: "Connect bank account" → redirects to Stripe → returns to BMT (`/mechanic/onboarding/stripe` + "Get paid" nav item)
- [x] Webhook handler at `/api/webhooks/stripe` handles `account.updated` to keep `stripe_*` columns in sync (signature-verified via `STRIPE_WEBHOOK_SECRET`)
- [x] Mechanic without Stripe completed cannot toggle online (server gate in `mechanic-status.ts` + UI routes to onboarding with explanation)
- [x] Capture flow updated to create transfers (`completeAndCharge` transfers `mechanic_payout_pence` to the current/replacement mechanic's account; failure is non-fatal + logged)
- [x] Earnings page reads real Stripe transfer data (falls back to the weekly preview when not yet connected)
- [ ] Test the flow end-to-end with Stripe test bank accounts — **deferred to manual verification** (needs a running app + `STRIPE_WEBHOOK_SECRET` from `stripe listen`; build + typecheck pass, no live test-mode run done in this session)

**Files touched:**
- `app/(mechanic)/mechanic/onboarding/stripe/page.tsx`
- `app/api/webhooks/stripe/route.ts`
- `app/actions/stripe-connect.ts`
- `app/actions/capture-payment.ts` (updated to also transfer)
- `lib/stripe/connect.ts`
- Schema migration

## What NOT to do in this task

- Don't build surge pricing — it has been removed from the platform entirely
- Don't build parts margin layer — task 10
- Don't build Pro tier mechanic benefits — task 11
- Don't build refund / dispute flow — task 12
- Don't build instant payouts — standard Stripe schedule is fine

## When complete

- Update `docs/HANDOFF.md`
- Commit and push

The platform is now commercially live — bookings priced by area and per-service commission, mechanics paid via Stripe, customer deposits held and released on job completion.
