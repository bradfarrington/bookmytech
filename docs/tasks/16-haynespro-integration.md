# Task 16 — HaynesPro integration: vehicle-specific pricing, per-vehicle services, admin Vehicles area, mechanic technical data

**Status:** ✅ Complete (2026-07-09) — Stages A–F all built, tested (75 unit tests green) and production-build clean. **Owner action required before this goes live: apply migrations `0036` + `0037` via Studio** — until then the funnel prices exactly as before (the vehicle rung silently falls through), but *booking creation would fail* on the new snapshot columns. Deviations from spec: none of substance; the admin per-service "mapping panel" originally floated for the service edit page landed as the richer `/admin/vehicles` model page instead (owner-requested pivot), and mapping rules are seeded/edited in SQL for now.

> **Superseded in part by Task 17 (2026-07-20):** the packaged-services catalogue this task priced (Stages B–D: `service_time_mappings`, per-service durations, `service_vehicle_exclusions`, the admin "Services & pricing" tab) was removed — Stage G's bookable repairs became the ONLY booking type. Stages A (client), E (Vehicles area minus the services tab), F (SSO) and G survive. See `docs/tasks/17-remove-services.md`.

Wires the HaynesPro Data Exchange demo account (full supplier assessment: `docs/04-supplier-apis.md`) into the platform. Production switch-over = swapping the `HAYNESPRO_*` env values. Demo expires **2026-08-09**.

## Owner decisions consumed (2026-07-09)

1. **Prices vary per vehicle**, auto-calculated from HaynesPro OEM book times.
2. ~~**Billing rounds UP to whole hours, minimum 1 hour**~~ **Amended 2026-07-20: billing uses the EXACT book time, minimum 1 hour**: 0.7 → 1h; 1.2 → 1.2h; 2.3 → 2.3h (`lib/pricing/billable.ts`). Applies only to the HaynesPro-derived duration; admin-entered durations are used as-is.
3. **Ambiguous variants → quote the longest** (e.g. clutch time differs by gearbox and we can't know which — never under-quote).
4. **Booking flow**: reg → find the vehicle → show the services *available for that car* (admin-toggleable per vehicle) → picked service enters the existing booking flow.
5. **Admin gets a Vehicles area**: brand-logo grid → make/model drill-down → per-model view of available Haynes repair operations, the repair manuals for them, and vehicle documentation — plus the per-model service availability toggles.
6. **Parts**: once a parts-price API is wired in, map BMT parts to HaynesPro's per-job required-parts lists (TecDoc genart ids). Groundwork only in this task.

## Identification reality check (verified live 2026-07-09)

HaynesPro has **no reg-plate lookup** — its identification inputs are VIN / TecDoc / details / tree. So DVLA (free) stays the *reg bridge* (reg → make/model/engine/year), and HaynesPro takes over from there (exact variant, times, manuals, docs). When the VRM supplier's docs arrive, VIN decoding replaces details-matching as the primary bridge (more precise); everything downstream is unchanged.

Also verified: the identification tree returns **95 makes (no logo images — we bundle our own logo pack in `/public/brands/`)**; **models carry real HaynesPro car images** (svgz URLs); **repair manuals are licensed** on the demo account (`getStoryOverview` returns the full list for a Golf IV); **maintenance service times are licensed** (`includeServiceTimes=true` works).

## Duration resolution ladder (extends Task 15)

```
billableHours(HaynesPro vehicle-specific)   ← NEW, wins when resolvable
  → per-(service, area) override            ← unchanged
  → service default duration                ← unchanged
  → legacy price ÷ rate fallback            ← unchanged
```

The funnel **never blocks on HaynesPro**: any failure (unknown vehicle, API down, unmapped service) silently falls through the ladder; the booking snapshots which source priced it.

---

## Stage A — HaynesPro client (`lib/haynespro/`) ✅ built

- `client.ts` — REST JSON fetcher. **VRID session token persisted in `platform_settings` key `haynespro_vrid`** (service-role) so all serverless instances share one token (minting a new VRID per username invalidates previous ones → per-instance caches would churn). On `statusCode 5`: re-read the stored token (another instance may have refreshed), else re-auth once, retry. `isHaynesProConfigured()` gates on env — app runs fine without credentials.
- `types.ts` — minimal types for the ops used.
- Verified-live status shape: bad vrid → HTTP 200 + `[{…, status: {statusCode: 5}}]`.

## Stage B — vehicle resolution + duration lookup ✅ built

- **`haynespro_vehicle_cache`** (migration `0036`): one row per normalised reg → `car_type_id`, `repairtime_type_id`, `description`, `hp_make` + `hp_model_label` (resolved make/model **names** — what Stage D exclusions match on), `resolved_via`, `durations jsonb` (serviceId → raw hours, lazily filled), `expires_at` ~30 days (**HaynesPro ids are NOT stable across their quarterly DB updates** — must expire + re-resolve). Service-role-only RLS.
- `vehicle.ts` — `resolveVehicle(reg)`: cache → DVLA/DVSA details (existing lookup) → `decodeVINV4` when a VIN exists (future) else `findCarTypesByDetailsV3`, candidates scored on capacity (±100cc hard gate) / fuel (hard gate) / year-in-range. Negative results cached in-memory 10 min.
- `durations.ts` — mapping strategies: `genart` (`getRepairtimeNodesByGenartsV4` + description filter + max/min/sum combine), `maintenance_max`/`maintenance_min` (largest/smallest scheduled service time), `none`. Raw hours cached on the vehicle row so match → slot → create-booking price identically.
- `lib/pricing/billable.ts` — `billableHours(raw) = max(1, ceil(raw − ε))`, unit-tested.
- **`service_time_mappings`** (`0036`) seeded from live-verified Golf IV probes:

  | service | strategy | genarts | filter | verified raw → billed |
  |---|---|---|---|---|
  | front-brake-pads | genart | {402} | "front brake pads" | 0.7 → 1h |
  | front-brake-discs-pads | genart | {82} | "both front brake discs" | 0.9 → 1h |
  | battery-replacement | genart | {1} | "renew the battery" | 0.2 → 1h |
  | clutch-replacement | genart | {479} | "clutch assembly" (max over gearbox variants) | 4.8 → 5h |
  | cambelt-replacement | genart | {307} | "timing belt kit" | 2.4 → 3h |
  | full-service | maintenance_max | — | — | 1.6 → 2h |
  | interim-service | maintenance_min | — | — | 0.5 → 1h |
  | diagnostic / mot-precheck / air-con-regas | none | — | — | service default |

## Stage C — pricing wiring + booking snapshot ✅ built

- `calculatePrice(serviceId, postcode, client?, vehicle?: { reg })` — vehicle duration wins the ladder when resolvable; breakdown gains `durationSource` (`vehicle|area|service|legacy`) + `vehicleRawDurationHours`. `computePrice` stays pure/untouched.
- Call sites pass the reg: `/book/match`, `/book/slot`, `createBookingAction` and `prepareCheckout` (grew a `vehicleReg` input so the Stripe hold matches the vehicle-specific total — the slot picker passes it). Bookings snapshot `duration_source` + `vehicle_raw_duration_hours` (`0036`); `service_duration_hours` keeps holding the **billed** hours.
- Price hero shows "Estimated time on your {make model}: Xh" when source = vehicle.

## Stage D — per-vehicle service availability (booking flow filter) ✅ built

- **Default ON, admin toggles OFF per model** — unlisted/new vehicles never break the funnel; admin curates exceptions (e.g. no cambelt service for EVs).
- **`service_vehicle_exclusions`** (migration `0037`): `service_id` + `make_name` + `model_name` (stable HaynesPro **names**, unlike its numeric ids). Matching (`lib/haynespro/exclusions.ts`, unit-tested): normalised `make_name + " " + model_name` equals the cache row's `hp_model_label` (stored by `resolveVehicle`, Stage B). Toggle server action: `app/actions/vehicle-exclusions.ts` (admin-gated).
- `/book/service` grid: when exclusion rows exist and the reg resolves, excluded services are hidden; an empty exclusions table short-circuits with zero HaynesPro traffic; any failure hides nothing (identical to today).

## Stage E — admin Vehicles area (`/admin/vehicles`) ✅ built

- **Brand grid** — 88 PASSENGER makes from `getIdentificationTreeV2` (memoised ~24h in `lib/haynespro/tree.ts`) as logo tiles; **all-88 logo pack bundled in `/public/brands/`** (86 SVGs converted from the owner's `car logos/` folder — their files are plain SVG despite the `.svgz` extension — plus 2 PNGs for Alfa Romeo/Cupra which it missed; filenames = `brandLogoSlug(makeName)`). `BrandTile` chains svg → png → styled-initials on `<img>` error, so a missing file can never break the grid.
- **Make page** (`/admin/vehicles/[makeId]`) — model grid using **HaynesPro model images** (svgz, plain `<img>`) + production years.
- **Model page** (`/admin/vehicles/[makeId]/[modelId]?type=<carTypeId>&tab=…`) — engine-variant picker (custom `Select`), four tabs:
  - **Services & pricing**: every active service with its availability toggle (Stage D) + the resolved Haynes duration for the selected variant (raw → billed) via `lib/haynespro/admin-durations.ts`.
  - **Repair times**: read-only tree browse (`getRepairtimeSubnodesByGroupV4`, breadcrumbed).
  - **Manuals**: `getStoryOverview` list → `getStoryInfoV6` viewer (nested lines, remarks, images).
  - **Technical data**: adjustments (`getAdjustmentsV7`), capacities (`getLubricantCapacitiesV4`), VIN/ID-plate locations (`getIdLocationV3`, `carTypeLevel=3`).
- All HaynesPro reads go through the Stage A client server-side; nothing HaynesPro-derived is stored except toggles + caches. Sidebar: "Vehicles" under Commercial.

## Stage F — mechanic SSO (Portal-to-Portal) ✅ built (mint verified live)

- `lib/haynespro/sso.ts` — SOAP 1.2 `registerVisitByDistributor` (`…/reg/services/RegistrationV2`, SOAP-only; NB the WSDL really does spell `companyIdentificaton`), passing `userType` (env), `interface=TOUCH`, per-mechanic `username` (`bmt_<uid>`), the booking vehicle (`carTypeId=t_<id>` via the reg cache) and a landing `subject`. One-time links → minted per click.
- `GET /api/haynespro/sso?booking=…&subject=…` — verifies the caller is the assigned mechanic (or admin), resolves the reg, mints, redirects.
- "Technical data" card on `/mechanic/jobs/[id]`: Repair manuals / Service data / Wiring & electronics buttons (rendered only when the SSO env is configured).

## Stage G — bookable HaynesPro repairs on the funnel (owner request 2026-07-10) ✅ built

- `/book/service` now has **two tabs** once the reg is in: **Our services** (the packaged grid, unchanged) and **Repairs for your car** — the HaynesPro repair-times tree for the resolved vehicle, browsable group → subgroup → timed leaf (same drill-down as the admin model page, customer-styled with breadcrumbs).
- Each timed leaf shows the billed estimate ("Estimated 1 hour on your car") and a price button = `billableHours(book time) × global hourly rate`; clicking it enters the normal funnel: `/book/match?repair=<nodeId>` → slot → pre-auth → booking.
- **Server-authoritative pricing**: every step re-quotes from `(reg, nodeId)` via `quoteRepair()` (`lib/haynespro/repair-booking.ts` — `getRepairtimeNodesV4` by id, memoised; verified live). The client never supplies a duration or price. No parts line; commission = platform default; snapshots `duration_source='vehicle'` + raw hours.
- **Migration `0038`**: `bookings.repair_node_id` + `bookings.repair_description`, plus a hidden container service (`custom-repair`, `is_active=false`) that repair bookings attach their `service_id` to, keeping every services join/FK intact.
- **Display**: mechanic offer / jobs list / job detail, admin jobs list / detail and the customer dashboard all prefer `repair_description` over the joined service name, so everyone sees e.g. "Renew the air filter", not "Vehicle repair". Booking emails use it too.
- **Dispatch**: repair bookings skip the specialism filter (a granular repair maps to no catalogue specialism) — broadcast to every mechanic in range.
- Also fixed (2026-07-10): the service grid's stale hard-coded "primary slugs" list meant only Diagnostic rendered as a card — the grid now shows every available service with correct per-slug icons.
- **Per-model repair toggles** (owner request 2026-07-10, migration `0039`): every row of the admin Repair times tab — groups AND individual timed repairs — has an on/off switch (`repair_vehicle_exclusions`, keyed make/model names + node id). OFF hides the node from the customer Repairs browser (a hidden group removes the whole branch — no path to drill in) and `quoteRepair` refuses to price an excluded leaf, so stale URLs can't book one. Default ON; unmatched rows fail open.
- Also fixed (2026-07-10): **hybrids/EVs no longer fail the fuel gate.** HaynesPro tags hybrids with their combustion fuel (a Cayenne E-Hybrid is `fuelType: PETROL`, "Hybrid" lives only in the type name) while DVLA says "HYBRID ELECTRIC" — the old exact-ish fuel match disqualified every candidate. Scoring now maps DVLA fuel families (petrol / diesel / petrol-hybrid / diesel-hybrid "ELECTRIC DIESEL" / pure-EV "ELECTRICITY") to accepted HaynesPro fuels and bumps hybrid-NAMED variants for electrified vehicles. Verified against live data: Porsche Cayenne reg → "Cayenne (9YA) 3.0 E-Hybrid".
- Also fixed (2026-07-10): **reg → HaynesPro matching now survives trim-noisy DVLA/MOT model strings.** "RANGER WILDTRAK ECOBLUE 4X4 A" matched nothing (HaynesPro's text search needs "Ranger"); `resolveVehicle` now walks progressively shorter model prefixes plus two derived last-resorts — badge→series ("320D M SPORT"→"3", "C220 D AMG LINE"→"C") and make-stripped ("MAZDA3"→"3") — (`buildModelCandidates`, unit-tested), with local capacity/fuel/year scoring picking the variant. **Validated with a 40-car live sweep of the UK's most common models: 40/40 matched (was 34/40 before the badge/make-strip candidates)**; badge twins that share capacity+fuel+years (316d vs 320d) resolve to the same platform/engine family so times are right — exact-variant precision arrives with the VRM supplier's reg→VIN. NB WorkshopData Touch's own reg box is HaynesPro's VRM-partner contract feature — confirmed by scanning every group of their API spec: NO reg/plate operation exists in our Data Exchange contract. DVLA stays the reg bridge until the VRM supplier lands.

## Later (not this task)

- **VRM supplier bridge** (reg → VIN) when their docs arrive — swaps in as the primary resolution path.
- **Parts mapping**: genart ids per job (from `getRepairtimeNodesByGenartsV4` / `getMaintenancePartsForPeriod`) ↔ BMT `parts` catalogue (`genart_id` column) ↔ the future parts-price API. Owner decision 6 above.
- Pre-warm the vehicle cache from the vehicle-confirm step; "test against a reg" preview in admin mapping panel; per-service exact prices on the booking service grid (needs batch lookup + skeleton loading).

## Acceptance criteria

All of the below assume migrations `0036`–`0039` are applied (owner, via Studio) — the code ships inert without them, except that **booking creation needs the new snapshot columns**, so apply before deploying.

- [x] Mapped service + resolvable vehicle → priced from the HaynesPro time, rounded up (min 1h), snapshotting `duration_source='vehicle'` + raw hours. *(Engine path built + unit-tested; do one live booking check after the migrations are applied.)*
- [x] Any resolution failure → today's behaviour exactly; funnel never errors on HaynesPro (every lookup returns null and falls through the ladder).
- [x] Match, slot and booking-create price identically for the same reg (raw hours cached per (reg, service) on the vehicle row; `prepareCheckout` holds the same amount).
- [x] Booking service grid hides services excluded for the resolved model (matcher unit-tested; default = hide nothing).
- [x] `/admin/vehicles`: brand grid → models (with HaynesPro images) → model page with service toggles + resolved durations + repair list + manuals + documentation. (All underlying API calls verified live against the demo.)
- [x] Mechanic job detail links into WorkshopData Touch for the booked vehicle (SSO mint verified live: code 0 + one-time redirectUrl).
- [x] Unit tests for the pure helpers pass (**75 green**, incl. rounding, status codes, combine, scoring, model-label derivation, exclusion matching); production build + typecheck clean.
- [x] Stage G: Repairs tab on `/book/service` browses the tree for the resolved reg; a timed leaf books through match → slot → pay with the price re-quoted server-side at every step; the repair name shows on all job surfaces. (Chain verified live: browse → leaf → by-id re-lookup identical.)

## Env (`.env.local`, never committed)

`HAYNESPRO_DISTRIBUTOR_USERNAME`, `HAYNESPRO_DISTRIBUTOR_PASSWORD`, `HAYNESPRO_USERNAME`, `HAYNESPRO_SSO_COMPANY_ID`, `HAYNESPRO_SSO_PASSWORD`, `HAYNESPRO_SSO_USERTYPE`. Missing = feature silently off.

## When complete
- [x] Update this file's status + acceptance boxes.
- [x] Update `docs/HANDOFF.md` (Current task).
- [ ] Apply migrations `0036`–`0039` (owner, via Studio) — **required before deploying this code**; verified NOT yet applied as of 2026-07-10.
- [ ] Commit (owner).
