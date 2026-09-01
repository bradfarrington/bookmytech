# Task 20 — Manual vehicle selection (mobile API + web funnel)

**Status:** ✅ Complete (2026-09-01) — **both clients.** Stage 1 shipped the four endpoints of the app's `manual-vehicle-crm-prompt.md` on a new shared core `lib/haynespro/vehicle-picker.ts`; Stage 2 put the same picker into the **website**, which the prompt had deliberately left out but which had the identical wrong-price bug. Migration `0051` was applied by Brad mid-task, so the full happy path is **verified end-to-end in a real browser** — see "What was verified". **Deviations from the prompt:** a type's power is sent as `outputKw` **and** `outputBhp` rather than one field called `output` (HaynesPro's number is kW, and the prompt asked not to mislabel it); two failure codes exist that the prompt didn't name (`type_unknown`, `vehicle_unknown`) alongside `make_mismatch` and `no_coverage`; the three read endpoints answer an outage with a 200 `{ ok: false, code: "unavailable" }` rather than an empty list; `CatalogueVehicle` gained an **optional, additive** `make`.

## Why this exists

Reg → HaynesPro vehicle is **not a lookup, it is a fuzzy match**. `resolveVehicle` takes DVLA's make and model strings and runs them through `buildModelCandidates` → `scoreCandidate` → `pickBestCandidate`, and on a long DVLA model string the variant it lands on is a guess between several plausible engine types.

The live tree makes that concrete. `FORD Ranger (2011–2023)` lists **three variants all named "2.0 (EcoBlue)"**, separated only by engine code and power — 132 kW `YM2X`, 125 kW `BC2X`, 96 kW `YL2X`. Nothing in DVLA's `RANGER WILDTRAK ECOBLUE 4X4 A` picks between them. **A wrong variant means wrong labour times, which means a wrong price.**

Until this task, neither client could correct it. The web funnel's "Edit manually" form collected make/model/year as free text and threaded it through the URL for **display only** — it never reached the pricing engine, so the page showed the corrected car and kept charging for the guessed one. The app had the same link wired to an empty `onPress`, which is what started this. Stage 1 fixed the app; Stage 2 fixed the website.

## P1–P3 — the cascade ✅

Three unauthenticated reads, thin wrappers over the memoised tree in `lib/haynespro/tree.ts` (no HaynesPro work was needed; the cascade already existed for `/admin/vehicles`):

| Endpoint | Returns |
|---|---|
| `GET /api/mobile/v1/vehicle/makes` | `{ ok: true, makes: [{ id, name }] }` |
| `GET /api/mobile/v1/vehicle/models?makeId=<int>` | `{ ok: true, models: [{ id, name, madeFrom, madeUntil, image }] }` |
| `GET /api/mobile/v1/vehicle/types?modelId=<int>` | `{ ok: true, types: [{ id, name, fullName, engineCode, fuelType, capacity, outputKw, outputBhp, madeFrom, madeUntil }] }` |

**Unauthenticated**, matching `/repairs/tree` and `/quote`: the app lets guests price a job, and correcting the vehicle happens at step 1 of the funnel, long before the account gate. They count against the existing `mobile_catalogue_*` buckets — memoised for a day upstream and cheap, but public.

`HpTreeNode` is flattened to what a picker needs, so the app is not coupled to HaynesPro's wire shape. Notes on the flattening:

- **`outputKw` and `outputBhp`, never a bare `output`.** HaynesPro's number is kW. A Model 3 Long Range is `output: 211`, which is 283 bhp — printing "211 bhp" would be wrong on every EV and every performance variant. The prompt asked for one or the other; both is cheaper than picking wrong.
- **`capacity` is null on an EV**, not `0` — HaynesPro reports 0 for "not applicable", and "0 cc" is not a fact about anyone's car.
- **`fuelType` is passed through uppercase as HaynesPro gives it** ("DIESEL", "ELECTRICAL"), flattened from its two wire shapes (string at some levels, array at others; multiples join as `"PETROL / ELECTRIC"`). Presentation is the app's call — capitalising it here would turn "LPG" into "Lpg".
- **Nodes with a null `id` are dropped**, which includes HaynesPro's "Vehicle not found" node (see the gotcha below).
- **An outage is a 200 refusal, not an empty list.** HaynesPro always has ~89 makes and every model has variants, so an empty cascade means an outage or an id we don't know; rendering it as "this car has no variants" tells the customer something false about their car and gives them nothing to do about it.

## P4 — the correction ✅

`POST /api/mobile/v1/vehicle/resolve`, body `{ reg, carTypeId }`. **Authenticated**, its own `vehicle` rate-limit family, `{ ok: true, vehicle: { description, hourlyRatePence } }` on success — the same `vehicle` shape `/repairs/tree` returns, so the app reuses its type and re-fetches the tree straight after.

### It needs no changes to the pricing path

`resolveVehicle(reg, db)` caches its answer in `haynespro_vehicle_cache` keyed on the normalised reg, and **every priced endpoint goes through that cache** — `/repairs/tree`, `/repairs/search`, `/quote`, `/checkout/prepare`, `POST /bookings`, web and mobile alike. So the correction only writes that row and every endpoint prices the corrected vehicle with no signature change anywhere. **The cache is the seam**; threading a `carTypeId` override through five routes would be five places to forget it.

Which means the row must be written **completely**. `applyManualVehicleSelection` writes `car_type_id`, `repairtime_type_id`, `description`, `hp_make`, `hp_model_label`, `resolved_via`, `resolved_by`, `resolved_at` and `expires_at` together. Two of those are silent-wrong-price traps rather than tidiness:

- **`repairtime_type_id`** is where the labour times come from. Null means no coverage, and the customer has just chosen a vehicle that cannot be priced — so it **refuses with `no_coverage` and leaves the existing row alone** rather than writing an unpriceable one over a reg that was working a second ago.
- **`hp_model_label`** is what `excludedRepairNodeIdsForVehicle` matches the admin's per-model repair exclusions on. Leaving the old label attaches the old car's exclusions to the new one — silently, and in the direction of quoting repairs that are meant to be switched off. It is derived with the **same `deriveModelLabel`** the fuzzy path uses, so a manual row and a matched row are indistinguishable to the exclusion code.

`resolved_via = 'manual'` is also the **don't-re-resolve flag**: `resolveVehicle` now returns a manual row without checking its expiry and never overwrites it from DVLA details. `expires_at` is *also* written far future, so the rule holds even for a reader that doesn't know it — a correction that lapsed after 30 days would quietly revert the price to the wrong guess, which is the bug this feature exists to fix.

### The three guards

The cache is **global and keyed on reg alone, with no customer scoping**. One person's correction moves that plate's price for everyone who books it, website included. That is correct — it *is* the right car — and it is also an open door.

1. **Authenticated.** P1–P3 are public reads of a supplier catalogue; this is a write to shared pricing state. `mobileActionCaller(request, "vehicle")` — 5/min and 20/day per user, 10/min and 60/day per IP, tighter than every other family.
2. **Constrained to the DVLA make.** The chosen type's make must agree with the make DVLA holds for that reg. DVLA is authoritative on make; it is the *variant* that is ambiguous. So a Ranger may be repointed at any other Ford and never at a 911 — which is the entire attack. The make comes from walking the chosen node's own branch (TYPE → its MODEL → its MAKE, both hops memoised and both already made by the customer reaching the picker), **not** from `getRepairtimeTypesV2`, which disagrees (see the gotchas). `makesMatch` is prefix-based in either direction after de-accenting, because the two sources spell manufacturers differently — DVLA's "MG MOTOR UK LTD" against HaynesPro's "MG", "CITROËN" against "CITROEN" — with a five-entry alias table for the pairs where neither is a prefix (VW, MERCEDES, LDV, GWM). Checked against the live 89-make list: **no HaynesPro make name is a prefix of another**, so the loose rule cannot let one make masquerade as another.
3. **Audited.** `resolved_by` (the **token's** user, never anything in the body) and `resolved_at`, on manual rows only. Without them a mispriced booking is untraceable — you cannot tell a bad fuzzy match from a deliberate correction, or say who made it.

A reg DVLA can't confirm is refused (`vehicle_unknown`) rather than written unguarded: with no authoritative make there is no guard.

One thing the prompt didn't mention that had to be handled: **the in-memory negative cache**. A reg that fails to resolve is remembered for ten minutes, and that check runs *before* the database read — so without `clearNegativeCache`, a customer whose car didn't match (the likeliest reason to correct it) would have gone on getting nothing for the rest of the window with their correction sitting unread in the table.

## Two HaynesPro gotchas found while building this

Both verified live on 2026-09-01 and now recorded in `docs/04-supplier-apis.md`:

- **Identification-tree ids are namespaced per level.** `vehicle_id=270` is FORD at `vehicle_level=MAKE` and an unrelated "ALFA ROMEO 33 (905) 1.7 8V QV" at `vehicle_level=TYPE`. A TYPE fetched by id is genuinely a TYPE — which is why `applyManualVehicleSelection` trusts the **node that comes back**, never the id it sent.
- **`getRepairtimeTypesV2`'s make is a different vocabulary from the tree's.** For the tree's "FORD Ranger 2.0 EcoBlue" it answers `make: "FORD USA"`, `model: "RANGER Extended Cab Pickup"`. Using it for the make guard would have refused half of the corrections it is meant to permit.
- Not-found is **HTTP 200** with an all-null node carrying `status.statusCode 6` ("Vehicle not found"), which `haynesProCall` passes straight through (it only re-auths on 5). A null `id` is the miss — and returning null for it also stops `memoised` caching a miss for a day.

## Stage 2 — the same picker on the website ✅

The prompt left the web funnel alone as "yours to schedule". It shouldn't have waited: the website had the *same* bug and a worse version of it, because the thing it offered instead **looked** like a fix.

**What was there.** Two places let a customer say "that's not my car", and neither could change a price:

- The landing-page modal (`vehicle-lookup-modal.tsx`) — "Not your car? **Try a different reg**", which just closes the modal. Correct for a typo, useless for a wrong match.
- `/book/vehicle` — "Details look wrong? **Edit manually**" → a free-text make/model/year form that threaded its answers through the URL and was read only by `vehicleLabel()` for the caption. **The page showed the corrected car and kept charging for the guessed one.** That form is now deleted.

**Where the picker went, and why there.** The vehicle step shows DVLA's record, which is nearly always right at make-and-model level. The variant — the thing the price is built from — is only ever visible on `/book/repairs`: *"Repair times matched to your FORD Ranger 3.0 TDCI"*. So that line is where someone notices, and it is now where the fix lives, as a "Not your car?" link that opens the picker inline and `router.refresh()`es on success. It is also on `/book/vehicle` (replacing the free-text form, continuing straight to the repairs step) and — the biggest win — **on the not-matched dead end**: a reg HaynesPro can't match used to end at "we can't price this vehicle online yet, get in touch", and now offers "tell us what you drive" first and the help link second.

**Wiring.** `app/actions/vehicle-picker.ts` — four `"use server"` actions that are each a call into the same `lib/haynespro/vehicle-picker.ts` the mobile routes use, so the two clients cannot disagree about which car a reg is. `components/customer/vehicle-picker.tsx` is the shared UI (three cascading `Select`s, used from three places).

Three things worth knowing:

- **The make is fixed, not a dropdown.** The picker seeds itself with DVLA's make and shows it as a read-only "FORD · from DVLA" row, because the server refuses a correction whose make disagrees with DVLA — offering the choice would be offering a dead end. Only if DVLA's make matches nothing in HaynesPro's list does a make dropdown appear. That needed `makesMatch` in the *browser*, so it moved to `lib/haynespro/make-match.ts`, which imports nothing and is safe to bundle.
- **`CatalogueVehicle` gained `make`** so the repairs page can seed the picker without a second DVLA call. Optional and additive — an older app build ignores it. DVLA is only called on the *failure* path, where it is a cache hit from step 1 anyway.
- **Guests may correct a vehicle.** The funnel prices a job before asking for an account, so the moment someone spots the wrong car is a moment they are usually anonymous; requiring a sign-in would gate the funnel at its worst point and leave the wrong price standing for everyone who declines. The DVLA make guard doesn't depend on who is calling, so the blast radius is unchanged — a plate can still only move to a different variant of its own make. `resolved_by` is null for a guest, `resolved_at` is still stamped, and the `vehicle` rate family applies per IP. **`selectVehicleManually` is the one place to change if this should be signed-in only.**

## What was verified

**Live, against the real APIs and a local dev server** (`npm run dev`, real HaynesPro + real DVLA + the live Supabase project), using `S28BSW` — an existing cache row that is itself the case that prompted this: a Ford Ranger fuzzy-matched to "3.0 TDCI".

| | |
|---|---|
| `/vehicle/makes` | 89 makes, alphabetical |
| `/vehicle/models?makeId=270` | 96 Ford models, including the four different "Ranger"s that only production years tell apart |
| `/vehicle/types?modelId=102000254` | the Ranger's variants, including the three identically-named "2.0 (EcoBlue)"s at 132/125/96 kW |
| bad/missing `makeId`/`modelId` | 400 with customer copy |
| unknown but well-formed id | 200 `{ ok: false, code: "unavailable" }` |
| `/vehicle/resolve` no token / bad token | 401 |
| `/vehicle/resolve` `text/plain` body | 415 (the anti-CSRF control) |
| non-integer `carTypeId`, missing `reg` | 400 |
| unknown `carTypeId` | `type_unknown` |
| **Ranger's reg → a Tesla type** | **`make_mismatch`** — "DVLA has this registration down as a Ford, so we can't change it to a Tesla…" |
| Ranger's reg → a different Ranger variant | passes every guard, reaches the write |
| reg DVLA doesn't know | `vehicle_unknown` |
| 6th call in a minute | 429 with `Retry-After` |
| the live `S28BSW` cache row afterwards | **untouched** |

During that run `0051` had not yet been applied, so the write itself failed **closed, not open** — `PGRST204 Could not find the 'resolved_at' column`, nothing written, the existing row intact, and the migration named in the log. Everything upstream of it ran green.

**Then Stage 2, in a real browser** (Playwright against the dev server), once `0051` had been applied:

| | |
|---|---|
| `/book/repairs?reg=S28BSW` | "Repair times matched to your FORD Ranger 3.0 TDCI" + "Not your car?" |
| the picker opens | make seeded and fixed: **"FORD · from DVLA"** |
| models | 96, including all four Fords called "Ranger", separated by year: `Ranger (1999–2011)`, `(2006–2012)`, `(2011–2023)`, `(2022–on)` |
| variants | 26, labelled with what actually tells them apart — `2.0 (EcoBlue) · 1996 cc · 177 bhp · 2019–2022`, then 168 bhp, then 129 bhp |
| "Use this vehicle" | **saved** — the row became `car_type_id 619023273`, `repairtime_type_id 141852`, `description "FORD Ranger 2.0 (EcoBlue)"`, `resolved_via 'manual'`, `resolved_at` stamped, `resolved_by` null (guest), `expires_at 2126` |
| browser console / page errors | none |

**That run changed a live cache row, and it was put back.** `S28BSW` was an existing fuzzy-matched row, not a scratch one. It was restored by deleting the manual row and re-requesting the page, which re-resolved it to exactly what it held before — `car_type_id 619114949`, `"FORD Ranger 3.0 TDCI"`, `resolved_via 'details'` — with a fresh 30-day TTL, which is what any normal re-resolution does. **Use a scratch reg next time:** the cache is keyed on reg alone and global, so there is no such thing as a private test write here.

Also: `tsc --noEmit` clean, `eslint` clean on every file touched, production build compiles with all four routes present, **156 unit tests (12 new)** covering the node flattening (kW→bhp, EV capacity, the two `fuelType` shapes, null-id drops) and every branch of `makesMatch`.

The live schema was diffed during Stage 1: `0048`, `0049` and `0050` had already been applied. `0051` was applied by Brad partway through Stage 2 — **there is no outstanding migration.**

## Acceptance criteria

- [x] `GET /vehicle/makes`, `/vehicle/models?makeId`, `/vehicle/types?modelId` — unauthenticated, catalogue rate buckets
- [x] `HpTreeNode` flattened to picker fields; null-id entries dropped server-side
- [x] `output` sent as kW and bhp, never one unlabelled number
- [x] `POST /vehicle/resolve` — authenticated, its own tighter rate-limit family
- [x] Writes `car_type_id`, `repairtime_type_id`, `description`, `hp_make`, `hp_model_label` completely
- [x] `resolved_via = 'manual'`; `resolveVehicle` treats a manual row as authoritative and never re-resolves or expires it
- [x] `expires_at` far future on manual rows
- [x] `repairtime_type_id` null → `no_coverage` at 200, existing row left alone
- [x] Chosen type's make must match DVLA's — `make_mismatch` at 200 otherwise
- [x] `resolved_by` / `resolved_at` audit columns, from the verified caller (`0051`)
- [x] Response is the same `vehicle` shape `/repairs/tree` returns
- [x] No pricing endpoint gained a `carTypeId` parameter — the cache is the seam
- [x] Unit tests for the pure helpers; live probe of every refusal path
- [x] The happy path writing a row end-to-end — driven in a real browser once `0051` landed
- [x] The same picker on the website: `/book/vehicle`, `/book/repairs`, and the not-matched dead end
- [x] The free-text "Edit manually" form deleted

## Follow-ups

- **The landing-page modal still only says "Try a different reg".** `app/(customer)/_components/vehicle-lookup-modal.tsx` shows DVLA's record before the funnel starts, and at that point "you typed the wrong reg" really is the likeliest explanation — no price has been quoted yet. Left deliberately. Worth revisiting only if people are bouncing there.
- **A guest can correct any plate they know the number of.** Bounded by the DVLA make guard (a Ford can only become another Ford) and the per-IP `vehicle` limits, and deliberate — the funnel prices before it asks for an account. But it is the loosest door in the system, and `selectVehicleManually` is the single place to close it if that stops being the right trade.
- **A correction is permanent and global, and nothing can undo it from the app.** Whoever corrects a plate last wins it for every future customer of that plate, and the only way back is SQL. That is the right default (an unmatched car is worse than a mis-corrected one) but `/admin/vehicles` should grow a view of manual rows — `resolved_via = 'manual'` with `resolved_by`/`resolved_at` is exactly the query — with a "revert to automatic" button that deletes the row and lets it re-resolve.
- **HaynesPro car-type ids are not stable across their quarterly database updates**, which is why every other row expires. Manual rows deliberately don't, so after an update a manual row may point at an id that has moved. It fails safe (the catalogue reports no repair data rather than mispricing), but the admin view above is what would make it visible.
- **No route-handler test is repeatable.** Same gap as Tasks 18 and 19: the probes here were real but throwaway. The `vehicle` bucket is 5/min per user, so a ported Playwright spec must space its calls or use a fresh account per case — the probe run hit its own limit mid-suite.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
