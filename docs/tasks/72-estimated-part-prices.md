# Task 72: Estimated part prices when no supplier lists the part

**Status:** 🟡 **Built and pushed to `main` 2026-10-09, not verified end to end.** Typecheck clean, unit tests pass, lint clean on every touched file. **Migration `0087` is written, not applied.** Until it is, estimated parts save without their flag (the price is still right). Shipped alongside fixes from the same session (see "Also in this change").

**Rule changed the same day (owner):** estimates come from the **same make and model only**, any year or generation. **Never a different model**, not even the same make. The first build fell back to same make and then any car; that was removed. So a repair stays "+ parts" when no other car of that model has been priced. On S28BSW (2024 Ranger) that is currently most of them, because no other Ranger has been looked up yet.

## Why

Aftermarket suppliers don't list parts for new models until they've been on the road a few years. A 2024 Ford Ranger (S28BSW) priced 21 of its 306 parts repairs on AAG's sandbox, and everything else showed "£60 + parts" and couldn't be booked. The owner's direction (2026-10-09): **it has to price while booking, there and then.** "+ parts" leaves the customer, Book My Tech and the mechanic all blind.

## Owner decisions (2026-10-09)

1. **The customer is told a price is an estimate.** The wording never mentions AAG, a supplier, or a price not being found. It says "estimated", "our best price for your vehicle", and that the mechanic will ask before going ahead if a part costs more.
2. **The margin is the dearest price found on cars of the same model, plus 15%.**
3. **When the real part is cheaper, the mechanic keeps the difference.** This is how `sourcing: 'self'` already works, so nothing changes. A dearer part goes through the existing extra-cost quote (Task 33), which the customer approves and pays before the work.

## How a part is priced now

`lib/parts/quote-parts.ts` `priceJobParts`, per charged part group and axle:

1. **AAG's price for this car**, or its last known price from the past 7 days (unchanged).
2. **Otherwise, an estimate** (new, `lib/parts/part-estimates.ts`). This uses what AAG charged for the same part group on other cars, from `aag_part_prices`, answers up to 180 days old. Each car is identified through `haynespro_vehicle_cache`. Same engine variant (`car_type_id`) first, then the same make and model of any year: `modelFamily()` strips HaynesPro's generation markers ("Fiesta Mk VI" → FIESTA, "Leon III (5F)" → LEON, "Corsa D (S07)" → CORSA). **Never a different model.** Within that, the line our own selection would pick for the job on that axle is taken, the dearest one is used, and 15% is added, rounded up to the penny. The car's own answer is never used.
3. **Otherwise, the admin's set price** for the group (unchanged, now after the estimate).
4. **Otherwise, unpriced**, and the booking is refused as before.

Estimates only load when the first pass leaves something unpriced: two database reads, and nothing is asked of AAG. They improve as more registrations are looked up, because each lookup stores AAG's answer.

## Contract changes (all additive)

- `QuotedPart.source` gains `"estimate"`. `QuotedPart.estimate?: { basis, samples }`.
- **Customer app:** `CustomerPartLine.estimated: boolean` on `parts[]` in `POST /api/mobile/v1/quote` and `/checkout/prepare`. `CatalogueNode.partsEstimated?: true` beside `partsPence` on `/repairs/tree?parts=1`.
- **Mechanic app:** `booking_parts.price_estimated boolean not null default false` (migration `0087`), read directly under RLS.

## UI

- **Browse rows:** "· includes estimated parts" in place of "· parts included".
- **Price step (`PriceHero`):** "· estimated" on the line, plus a note under the parts list.
- **Slot step:** "· estimated" on the line.
- **Mechanic job page (`PartsOrder`):** "Estimated price: buy a suitable part. If it costs more, send the customer a quote for the difference."
- **Admin job page:** "Estimated from the same model".

## Also in this change (same session, 2026-10-09)

- **Hidden repairs over 1,000 were being ignored.** Every read of `repair_vehicle_exclusions` stopped at PostgREST's 1,000-row cap (1,208 rows today), so some hides didn't apply to customers and the admin switch showed them as on. `loadRepairExclusionRows` reads in pages; used by the funnel, the admin tree and `/admin/repairs/hidden`.
- **A hidden job still counts inside a combined repair** (owner decision): hiding brake discs on their own keeps "Pads and Discs". `lib/catalogue/overlay.ts`, the search, and `quoteRepairsResult` (which still refuses a hidden job chosen on its own).
- **The AAG check page** says where a status was seen (live site or local dev) and gives each check's real reason, including "no parts for this vehicle". The vehicle Parts panel does the same.
- **Data, applied directly 2026-10-09 (shared database):** part groups 2746 "Wear indicator, brake pad" and 3369 "High performance brake disc" set to not charged. A duplicate "Brake disc" group `1M01800000GCJ` hidden for all vehicles.

## Acceptance criteria

- [x] A part AAG can't price on a car is estimated from cars of the same make and model (any year), dearest plus 15%.
- [x] A different model is never used, even of the same make.
- [x] An estimate is preferred to the set price; the set price is still used when no car has a price.
- [x] A car's own answer is never used to estimate.
- [x] Customer wording says "estimated" and never mentions a supplier.
- [x] Booking rows carry `price_estimated`; a booking still saves while `0087` is missing.
- [x] The mobile contract changes are additive only.
- [ ] `0087` applied, and `npm run db:types` re-run in both apps.
- [ ] A booking taken end to end on the dev server with an estimated part, seen on the mechanic's job.
- [ ] Customer and mechanic app builds showing the estimate wording.

## Known limits and next step

- **An estimate needs another car of the same model to have been priced.** Every registration looked up adds to the pool, but a new or rare model starts with none. S28BSW (2024 Ranger) shows "+ parts" on most repairs today because no other Ranger has been looked up.
- **Proposed follow-up (not built): seed the pool.** Keep a list of real registrations covering the models customers book (several years of each, e.g. older Rangers), and price their common part groups on a schedule. It has to run where AAG accepts the call: an allowlisted dev machine on the sandbox, or anywhere once live credentials arrive.

## When complete

Apply `0087`, update `docs/HANDOFF.md`, and commit.
