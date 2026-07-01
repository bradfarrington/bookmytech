# Task 15 — Duration × hourly-rate pricing

**Status:** ✅ Complete (2026-07-01) — labour is now duration × a global hourly rate; migration `0033`. Not live-fired against a running app this session (build, typecheck and 16 pricing unit tests pass). Per-area duration is data-model + engine + action ready; a dedicated admin grid for it is deferred (see below).

Replaces the fixed per-service labour price with a **duration in hours** multiplied by a **single global hourly rate** (seeded £60 = `6000`p). Parts and commission are unchanged: parts add on top, commission is still charged on the whole total and **taken out** of it (owner decision — the customer pays the total; the platform keeps its cut; the mechanic gets the rest).

```
service_amount = resolved_duration_hours × hourly_rate_pence   (override wins if set)
total          = service_amount + parts        (unchanged — Task 10)
fee            = round(total × commission_rate) (unchanged — from total)
payout         = total − fee                    (unchanged)
```

The old **area `labour_multiplier` is retired from pricing** — areas are still resolved by postcode, but only to pick a per-(service, area) **duration** override (owner: "the duration of the service in each area … makes the price fluctuate"). `service_area_prices.override_price_pence` remains as an optional hard price override that trumps the duration calc.

`services.starting_price_pence` is kept as a **cached indicative price** = `round(default duration × hourly rate)`. It's recomputed whenever a service's duration or the global rate changes, and is never edited directly — every customer-facing "from £X" preview still reads it, so nothing downstream had to change.

---

## Data model (`0033_hourly_pricing.sql`)

- **`services.duration_hours`** `numeric(4,2)` — the service's default duration (source of truth for labour). Seeded with **dummy** durations for the 10 catalogue services (owner to set real values in admin before go-live); any other row defaults to 1h. `starting_price_pence` recomputed from `duration × 6000`.
- **`service_area_prices.duration_hours`** `numeric(4,2)` nullable — per-(service, area) duration override. NULL = inherit the service default.
- **`platform_settings` key `hourly_rate_pence`** = `6000` — the global hourly rate (JSONB store, read by `getHourlyRatePence`).
- **`bookings.service_duration_hours` + `bookings.hourly_rate_pence`** — snapshot the duration + rate that produced the booking's labour amount (alongside the existing `0016` base/fee/payout snapshot). Legacy `labour_multiplier` column stays (default 1.000) but is no longer written.

**Acceptance criteria:**
- [x] Services are priced by duration (hours), not a fixed price.
- [x] A single global hourly rate multiplies duration into the labour amount, editable in admin.
- [x] Parts add on top of the labour amount (unchanged Task 10 flow).
- [x] Default commission applies to the whole total (unchanged; taken out of the total).
- [x] Duration can be overridden per area (data model + engine + action); the price fluctuates by area via duration.
- [x] Existing customer-facing price previews keep working (cached `starting_price_pence`, recomputed on change).
- [ ] Dedicated admin **grid** for per-area durations — **deferred** with the supplier parts API; the column, engine resolution and `upsertServiceAreaPrice({ durationHours })` are already in place, so the grid is UI-only work when the per-area data lands.

---

## Code

- **`lib/pricing/calculate.ts`** — `computePrice` now takes `durationHours` + `hourlyRatePence` (was `startingPricePence` + `labourMultiplier`); `basePence = round(duration × rate)` unless `overridePricePence` is set. `PriceBreakdown` swaps `labourMultiplier` → `durationHours` + `hourlyRatePence`. `calculatePrice` resolves duration (area override → service default → legacy price ÷ rate fallback) and reads the rate via the new **`getHourlyRatePence`** (mirrors `getTakeRateBase`; `DEFAULT_HOURLY_RATE_PENCE = 6000`).
- **`app/actions/create-booking.ts`** — snapshots `service_duration_hours` + `hourly_rate_pence` instead of `labour_multiplier`.
- **`app/actions/services.ts`** — the service form field is now **duration**; create/update store `duration_hours` and recompute the cached `starting_price_pence` from the global rate.
- **`app/actions/pricing.ts`** — `updateServiceBasePrice` → **`updateServiceDuration`** (edits duration, recomputes cached price, audited); `updatePlatformSetting` accepts **`hourly_rate_pence`** (pence) and, on change, **recomputes every service's cached price**; `upsertServiceAreaPrice` accepts an optional `durationHours`.
- **Admin UI** — pricing page: "Durations & commission" section (duration cell + live labour-price readout) and a global "Hourly labour rate" control in platform defaults. Service create/edit form: duration input with a live "duration × £rate → £price" hint. New `hours` inline converter.
- **Tests** — `lib/pricing/calculate.test.ts` rewritten for the duration model (16 cases pass).

---

## When complete
- [x] Update this file's status + acceptance boxes.
- [x] Update `docs/HANDOFF.md` (Current task).
- [ ] Commit (left to the owner — not committed this session).
