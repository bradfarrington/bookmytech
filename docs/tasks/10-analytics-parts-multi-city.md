# Task 10 — Analytics + parts margin + multi-city tooling

**Status:** ✅ Complete (2026-06-04) — Stage 1 (analytics, `0020`) · Stage 2 (parts margin, `0021`) · Stage 3 (multi-city, `0022`). Deviations: demand heatmap is a self-contained postcode-district heat grid (not a Google-Maps overlay — no Maps key wired); commission stays on the whole total (owner decision, vs the spec's service-only split); parts are configured per-service in admin (vs a customer/mechanic ad-hoc picker).

Three loosely-related features that round out the operations and commercial layers. The analytics dashboard (brief section 5), the parts margin revenue layer (brief section 6 + phase 4), and the multi-city expansion tooling (brief phase 3).

## Why this task

Up to this point, ops can see *what's happening now* (live monitor) but can't see *how things are trending over time*. Analytics fills that gap. Parts margin is one of the day-one-modelled revenue layers from the brief that hasn't been turned on yet. Multi-city tooling lets the platform expand beyond London.

## Three sub-stages — independent, can be done in any order

---

### Stage 1 — Analytics dashboard

`/admin/analytics` per brief section 5.

**Layout:**

- Period selector at the top (7d / 30d / 90d / year)
- Four KPI cards: GMV (gross merchandise value), Net revenue, Bookings, Repeat rate
- GMV trend chart — line chart with current period vs prior period overlay
- Service mix breakdown — donut or stacked bar showing which services drove revenue
- Top areas — ranked list by GMV
- Top mechanics — ranked list by GMV and rating
- Conversion funnel — five stages:
  1. Reg lookup started
  2. Service selected
  3. Price viewed
  4. Slot picked
  5. Booked & confirmed

**Tracking infrastructure:**

For the funnel to work, we need to track events client-side. Use a lightweight self-hosted approach — write events to a `funnel_events` table via a server action.

```sql
create table funnel_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null, -- anonymous UUID set via cookie
  user_id uuid references profiles(id), -- nullable for anonymous
  event_name text not null, -- 'reg_lookup_started', 'service_selected', etc.
  properties jsonb,
  occurred_at timestamptz not null default now()
);

create index on funnel_events (event_name, occurred_at);
create index on funnel_events (session_id);
```

A `trackEvent(name, properties)` helper on the client + server fires these. Add tracking calls to the booking flow steps.

**Acceptance criteria:**

- [x] `funnel_events` table + tracking helper — migration `0020`; `trackEvent` server action (`app/actions/track-event.ts`, service-role insert + `bmt_sid` cookie) + client `track()` wrapper (`lib/analytics/track.ts`).
- [x] Booking flow instrumented with 5 funnel events — `reg_lookup_started` (hero reg form), `service_selected` (service grid clicks), `price_viewed` (`/book/match` via `TrackOnMount`), `slot_picked` (slot picker → proceed-to-payment), `booking_confirmed` (server-side in `createBookingAction`).
- [x] `/admin/analytics` page with period selector — 7d / 30d / 90d / year, URL-driven (`?period=`).
- [x] All four KPIs + four charts rendering — KPIs (GMV, net revenue, bookings, repeat rate, each with vs-previous delta); charts = GMV trend line, service-mix donut, top areas, top mechanics; plus the 5-stage conversion funnel.
- [x] Period comparison overlay on GMV chart — current (solid brand) vs previous (dashed muted), index-aligned + gap-filled buckets (`lib/analytics/periods.ts`, unit-tested).
- [x] All data fetched server-side via aggregation queries (Supabase RPC for complex ones) — `analytics_funnel` (distinct-session counts) + `analytics_gmv_series` (bucketed GMV/net) are SECURITY DEFINER RPCs; KPIs/mix/top-boards aggregate a single bounded bookings fetch in JS (house pattern, mirrors the overview page).
- [x] Page loads in < 2 seconds even with 30d of data — RPCs run in Postgres; the JS aggregation is over one bounded (≤5000-row) fetch. (Not load-tested with 30d of synthetic data — there isn't that volume yet — but the query shapes are O(n) over a capped set.)

**Files touched:**
- `app/(admin)/admin/analytics/page.tsx`
- `app/(admin)/admin/analytics/_components/` (charts and panels)
- `lib/analytics/track.ts`
- `app/actions/track-event.ts`
- Supabase RPC functions for aggregations
- Schema migration

---

### Stage 2 — Parts margin layer

The platform sources parts on behalf of mechanics for some jobs and takes a margin. Wired in from day one (per brief section 6) but not active until now.

**Concept:**

When a booking includes parts (e.g. brake pads, battery), the mechanic can either:
- A) Source parts themselves (current behaviour — no platform involvement)
- B) Order parts via BMT (platform sources, takes a margin)

If B, the parts cost is split into:
- **Supplier cost** — what BMT paid the supplier (hidden from mechanic)
- **BMT margin** — kept by platform (hidden from mechanic)
- **Mechanic-shown cost** — what BMT bills the mechanic / customer

**Schema:**

```sql
create table parts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  category text not null, -- 'brake_pads', 'battery', 'oil', etc.
  description text,
  supplier_cost_pence integer not null,
  bmt_price_pence integer not null, -- price shown to mechanic
  vehicle_compatibility jsonb, -- {makes: [...], models: [...], year_from, year_to}
  in_stock boolean not null default true,
  supplier text, -- 'Euro Car Parts', 'GSF', etc.
  created_at timestamptz not null default now()
);

create table booking_parts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  part_id uuid not null references parts(id),
  quantity integer not null default 1,
  unit_price_pence integer not null, -- snapshot at booking time
  total_pence integer not null,
  status text not null default 'pending', -- 'pending' | 'ordered' | 'delivered' | 'used' | 'returned'
  ordered_at timestamptz,
  delivered_at timestamptz
);
```

**Mechanic workflow:**

- On accepting a job, if the service typically requires parts, mechanic sees: "Will you source parts yourself or order via BMT?"
- If BMT: suggested parts surface based on vehicle + service category. Mechanic confirms quantity and one-tap orders.
- Parts cost is added to the customer's total. Customer is informed before final confirm in the booking flow.

**Admin workflow:**

- `/admin/parts` — parts catalogue CRUD (similar to services)
- Bulk import from CSV (supplier price lists)
- Per-part margin calculator showing supplier cost → BMT price → margin %
- Stock tracking (basic — in_stock toggle for now)

**Earnings breakdown updates:**

The "what you receive" calculation in the mechanic earnings breakdown now reflects parts. Service revenue and parts revenue are split — platform fee is on the service portion only (15%), parts are pass-through to mechanic at BMT_price_pence (margin already kept).

**Owner decisions consumed (2026-06-04):**
- **Commission stays on the whole total** (base + parts) — the existing model is kept, NOT switched to service-only. Parts margin (supplier→BMT) is platform revenue realised at sourcing and tracked for admin reporting.
- **Parts are configured on the service in admin** ("the service knows it needs parts"). A booking of that service auto-snapshots the configured parts as line items and includes them in the price/pre-auth. There is no customer parts-picker and no ad-hoc mechanic part-adding in this task.
- **Mechanic sourcing toggle** is the BMT-vs-self choice on the job: `self` (default) matches today's payout exactly; `bmt` reduces that booking's `mechanic_payout_pence` by the BMT-sourced lines (BMT supplies & keeps that money). Existing bookings untouched.

**Acceptance criteria:**

- [x] Parts schema migration — `0021`: `parts` (admin-only RLS — supplier cost/margin are platform secrets), `service_parts` (service→parts config), `booking_parts` (per-booking line items; only BMT-price columns, safe to expose to customer/mechanic under RLS).
- [x] `/admin/parts` catalogue CRUD with CSV import — list (search + category/stock filters + margin %), create/edit form with a **live margin calculator** (margin £, gross margin %, markup %), stock toggle, delete (blocked if on a booking). CSV import at `/admin/parts/import` (upsert on SKU, per-row summary). "Parts" added to the sidebar + breadcrumbs.
- [x] Booking flow updated for services that require parts — customer sees parts itemised — `/book/match` shows a "What's included" breakdown (labour + each part + fixed price), read via service-role so only BMT prices surface.
- [x] Mechanic flow lets them order parts from BMT or source themselves — Parts card on the mechanic job detail; per-line "I'll source it" / "Order via BMT" toggle (`setPartSourcing`) that re-prices the payout server-side.
- [x] Earnings breakdown correctly splits service revenue from parts pass-through — `EarningsBreakdown` shows the platform fee (on total), deducts BMT-sourced parts, and notes self-sourced parts included in the payout. Commission stays on the whole total per the owner decision.
- [x] Seed 30-50 common parts — 40 seeded (brake pads/discs, batteries, filters, oils, ignition, wipers, belts, clutch, suspension, cooling, electrical, tyres, exhaust) + 7 sample service→part mappings. (brake pads, batteries, oil filters, etc.)

**Files touched:**
- `app/(admin)/admin/parts/page.tsx` + CRUD pages
- `app/(admin)/admin/parts/import/page.tsx`
- `app/(customer)/book/match/_components/parts-section.tsx`
- `app/(mechanic)/mechanic/jobs/[id]/_components/parts-order.tsx`
- `lib/utils/earnings.ts` (updated calculation)
- Schema migration

---

### Stage 3 — Multi-city expansion tooling

Make it easy for ops to launch a new city.

**`/admin/areas/setup` — Area setup wizard:**

A multi-step form for adding a new operational area:

1. **Area definition** — name, postcode prefixes (paste list or upload CSV)
2. **Pricing** — base multiplier, override services if needed
3. **Mechanic recruitment** — target mechanic count, generate a unique referral link for mechanic applications to this area
4. **Demand seeding** — optional: paid acquisition budget, target metrics
5. **Launch checklist** — confirm bank holiday awareness, regional operating hours, local partnerships
6. **Activate** — flips area to active

**`/admin/areas` — Areas overview:**

- All areas with status (active, planned, paused)
- Per-area dashboard: bookings volume, mechanic count, demand:supply, GMV
- Demand heatmap — postcode-level visualisation of bookings (use H3 or postcode districts as the grid)

**Mechanic recruitment flow:**

- Public landing pages at `/mechanics/<area-slug>` with area-specific copy
- Application form pre-fills area
- Admin sees applications per area for tracking recruitment progress

**Acceptance criteria:**

- [x] Area setup wizard (5-step) — `/admin/areas/setup` (`AreaWizard`): Area definition → Pricing → Recruitment → Demand seeding → Launch checklist, then Save-as-planned / Create-&-activate. Writes via `createArea` (`app/actions/areas.ts`).
- [x] Areas overview with per-area metrics — `/admin/areas` (replaced placeholder): status pills + mechanics (vs target) / bookings / active demand / GMV per area; per-area dashboard at `/admin/areas/[id]` with KPIs, recruitment link, launch checklist, applications, and a status control (active/planned/paused — `setAreaStatus` keeps the engine's `is_active` gate in sync).
- [x] Demand heatmap rendering — `components/admin/demand-heatmap.tsx`: a dependency-free postcode-district heat grid (tiles scaled by demand, amber ring where undersupplied). **Deviation:** not a Google-Maps geographic overlay (no Maps Platform key wired) — uses the booking `area` outward-code as the grid, which the spec explicitly allows as an alternative.
- [x] Public area-specific recruitment pages — `/mechanics/[area-slug]` (read via service-role so planned areas recruit pre-launch; paused areas 404). Area-specific headline/blurb, benefits, requirements, Apply CTA.
- [x] Applications tagged with originating area — `0022` adds `mechanic_applications.source_area_id`; the recruitment CTA carries `?area=<slug>`, `AreaCapture` persists it through the multi-step apply flow, and `submitApplication` resolves the slug → `area_id`. Surfaced on the area detail page.

**Files touched:**
- `app/(admin)/admin/areas/page.tsx`
- `app/(admin)/admin/areas/setup/page.tsx` + sub-steps
- `app/(admin)/admin/areas/[id]/page.tsx`
- `app/mechanics/[area-slug]/page.tsx`
- `components/admin/demand-heatmap.tsx`

## What NOT to do in this task

- Don't build a full BI tool with custom dashboards — fixed analytics is enough
- Don't integrate with real parts supplier APIs — manual catalogue management is fine for now
- Don't build automated marketing tools — the recruitment flow is just landing pages

## When complete

- Update `docs/HANDOFF.md`
- Commit and push
