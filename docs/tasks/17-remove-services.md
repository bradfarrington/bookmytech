# Task 17 — Remove the packaged-services catalogue (repairs-only booking)

**Status:** ✅ Complete (2026-07-20) — services, service_categories and every service-keyed table/UI removed; the HaynesPro repair flow (Task 16 Stage G) is now the only booking path. Funnel route renamed `/book/service` → `/book/repairs` (301 redirect kept). **Owner action: apply migration `0040` via Studio** — until then the app code and DB disagree (booking creation inserts no `service_id`, which the live NOT NULL column rejects).

## Why

Owner decision 2026-07-20: "get rid of services entirely because we are using the repairs from HaynesPro for the services now." The packaged catalogue duplicated what the HaynesPro repair tree already prices per-vehicle (including servicing/maintenance operations), and every catalogue price was a worse answer than the OEM book time for the actual car.

## What shipped

### Migration `0040_remove_services.sql`

1. Backfills `bookings.repair_description` from the joined service name for every legacy service booking (safety-net label `'Vehicle service'`), so history still displays after the join target is gone.
2. Drops `bookings.service_id`.
3. Drops `haynespro_vehicle_cache.durations` (the per-service raw-hours cache).
4. Drops, dependents first: `service_parts`, `service_time_mappings`, `service_vehicle_exclusions`, `service_area_prices`, `services`, `service_categories`.

Survivors: `repair_vehicle_exclusions` (0039), `bookings.repair_node_id`/`repair_description` (0038), all price-snapshot columns on bookings, `parts` + `booking_parts` (catalogue + per-booking snapshots), `mechanics.specialisms` / `mechanic_applications.specialisms` (informational text).

### Booking funnel — repairs only

- `/book` entry is **reg-only** (the "Use car details" manual tab is gone — a repair can only be priced from a reg via DVLA → HaynesPro). `lib/vehicles/catalogue.ts` deleted.
- `/book/vehicle` requires a reg; next step is `/book/repairs`.
- **`/book/service` → `/book/repairs`** (folder renamed; permanent redirects in `next.config.ts`: `/book/service` → `/book/repairs`, `/services` → `/book` — query strings pass through). The page renders only the repair browser; the tabs and `ServiceGrid` are gone. Unresolvable vehicles get a "get in touch" empty state — there is no catalogue fallback.
- `/book/match` + `/book/slot` take `repair=<nodeId>` only; the `service=<slug>` branch is deleted. Match forwards `pref` (rebook same-mechanic) to slot.
- `createBookingAction` / `prepareCheckout`: `repairNodeId` required, `serviceId`/`serviceName` gone; the insert writes no `service_id`; the per-service parts snapshot block is removed (repairs carry no parts line — parts are agreed with the mechanic). The hidden `custom-repair` container service and `repairContainerServiceId()` are gone.
- Funnel analytics: `service_selected` now fires on reaching the repair picker (`/book/repairs` mount) so the 5-step funnel stays monotonic without touching `analytics_funnel()` (0020).
- ProgressStepper step 2 renamed "Service" → "Repair".

### Pricing

- `calculatePrice(serviceId, …)` and the whole duration ladder are deleted from `lib/pricing/calculate.ts`. What remains: `computePrice` (pure), `resolveArea` (coverage, used by admin areas), `getHourlyRatePence`, `getTakeRateBase`. `quoteRepair` (lib/haynespro/repair-booking.ts) is the only quoting path: billed hours (exact book time since 2026-07-20, min 1h) × global hourly rate, commission = platform default.
- `lib/haynespro/durations.ts` + `admin-durations.ts` deleted (service_time_mappings strategies); `getGenartNodes`/`getMaintenanceSystems` removed from `tree.ts`; `resolveVehicle` no longer reads/writes a `durations` map.
- `lib/haynespro/exclusions.ts` is repair-only (`excludedServiceIdsFor*` gone).
- `/admin/pricing` keeps the global hourly rate, commission defaults, cancellation fees and areas; the per-service durations table and per-(service,area) overrides grid are gone (`service-prices-section.tsx`, `overrides-section.tsx`, `updateServiceDuration`, `updateServiceCommission`, `upsertServiceAreaPrice` deleted).

### Admin

- `/admin/services/**` (list/new/edit/settings/categories) deleted, with `app/actions/services.ts` + `categories.ts`; sidebar link, breadcrumbs and flash-toast keys removed.
- `/admin/vehicles/[make]/[model]`: the "Services & pricing" tab (per-model service toggles + resolved durations) is gone — "Repair times" (with its per-node toggles), "Manuals" and "Technical data" remain; default tab is now Repair times. `availability-toggle.tsx` + `app/actions/vehicle-exclusions.ts` deleted.
- Admin overview / live / jobs (list, detail, CSV export) / analytics / mechanics detail label jobs by `repair_description`; the jobs service filter is gone; analytics' service-mix chart groups by repair description.

### Mechanics

- **Dispatch has no specialism filter** — every repair broadcasts to every online, approved, in-range mechanic (the services join in `lib/dispatch/dispatch.ts` is gone).
- Specialisms are now a **static list** (`lib/specialisms.ts`, slugs matching the old catalogue so stored arrays keep their labels) and are profile/vetting info only: apply flow step 3 + review, admin add-mechanic form, and the availability page all read it. The availability page's per-specialism "offers this week" demand proxy was removed (it grouped by service slug).

### Customer surfaces

- Landing: `ServicesPreview` (DB-driven, "from £X") replaced by static `RepairsPreview` (`#repairs` section) pointing into the funnel; nav/footer links updated ("Services" → "Repairs"); `/services` page deleted (redirects to `/book`).
- Dashboard rebook: links to `/book/match?reg=…&repair=<node>` (+ `pref` for same-mechanic) when the booking has a `repair_node_id`; legacy service-era bookings fall back to `/book?reg=…`.
- Reminder click-through (`/r/[token]`) always lands on `/book/vehicle?reg=…` — the suggested-service deep link to the slot picker is gone.

### Tests

- e2e booking spec drives the repair tree and **skips unless `HAYNESPRO_*` env + `E2E_REG`** (a reg that resolves live) are present — there is no HaynesPro-free bookable path any more.
- Unit tests updated: durations/service-exclusion suites removed; pricing tests unchanged (computePrice/resolveArea are pure and stayed).

## Notes / follow-ups

- `mechanic_applications.specialisms` + `mechanics.specialisms` keep old catalogue slugs; `specialismName()` maps them to labels.
- `reminder_schedules.service_suggestion_slug` still exists and is populated by `REMINDER_META`; it's no longer used for routing. Drop the column whenever reminders are next touched.
- Brake-check follow-up reminders now key on the repair description matching /brake/i (was `serviceSlug === "brakes-tyres"`).
- Old migrations (0001, 0002, 0016, 0021, 0033, 0036–0039) are untouched history; `0040` removes what they created. Fresh environments must still run them in order.

## Acceptance criteria

- [x] Migration `0040` backfills legacy booking names then drops every service table/column; idempotent.
- [x] Funnel books a repair end-to-end with no `services` reads anywhere (`/book` → vehicle → repairs → match → slot → pay).
- [x] `/book/service` and `/services` redirect permanently.
- [x] Admin services area, per-service pricing controls and per-model service toggles removed; repair toggles remain.
- [x] Dispatch broadcasts without a specialism filter.
- [x] All job surfaces (admin/mechanic/customer, emails, CSV) label jobs by `repair_description`.
- [x] Typecheck, production build and unit tests green.
