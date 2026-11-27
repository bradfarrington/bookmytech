# Task 87: Parts that depend on the car (belts, air-con, stop-start)

**Status:** ✅ Complete (2026-11-27). One NAPA part is charged once per job; drive belts are matched to what they drive; parts NAPA lists in versions for cars with / without air-con or stop-start ask the customer (website price step, both apps' API), are priced at the dearer version when unanswered, and show the mechanic every version. Migration `0093`. Customer app `a13cd2d`, mechanic app `d89a6ca` (committed locally, not pushed).

Brad, 2026-11-27, from job 00133 (Astra K 1.0, SW16 PFD): "Renew the ancillary drive belt" charged twice, as a V-belt and a V-ribbed belt.

## What was wrong

1. **The same part, charged twice.** HaynesPro tags some jobs with two part types that NAPA files the same part under: "V-belt" (genart 10) and "V-ribbed belt" (305) both returned Gates GAT5PK1650 on job 00133. Across the 12 scanned models, 34 jobs did this: belts, the two EGR valve types, coolant tank cap / radiator cap, fuel pump / fuel supply unit, ignition coil / coil unit, tensioner pulleys, and some bulbs and strut mounts where both types picked the same part.
2. **Two different belts on one car.** A Peugeot 308 1.2 PureTech has a 6PK1043 alternator belt and a 3PK576 stretch-fit water-pump belt. NAPA lists both under both belt types, and the pick rule chose one, so "Renew the coolant pump drive belt" priced the alternator belt and "Renew all the ancillary drive belts" only one of the two.
3. **One belt or the other, depending on the car's spec.** 10 of the 19 cars with belt answers get two or more belts back. NAPA says why in its article details (dropped until now): "Fitment" +AC / -AC (6 cars), FOR / NOT FOR STOP-START, a chassis-number cut-off (VW Transporter), an engine variant (FOR CARB / FOR MONOP). The pick rule chose between them blind, so a car with air-con could be quoted, and its mechanic told to buy, the shorter non-air-con belt.

Nothing we look up says whether a car has air-con or stop-start: not HaynesPro (its VIN decode and 259 operations have no equipment list), NAPA, DVLA, MOT history, or the LKQ attributes we used to have. So the customer is asked.

## Decisions (Brad, 2026-11-27)

- **The exact same product code is what cancels out.** Part types that pick different parts are separate parts and both charge (high beam + headlight bulb, strut mount + repair kit, anti-roll bar bush + mounting). Not "lists that overlap".
- **Quantity is the vehicle's, never the sum.** Each part type works out how many the car needs on its own (NAPA's per-vehicle count, unit of issue, "both"/"all" in the job), so a repeat keeps the larger quantity.
- **The system sorts belts out itself.** Driven unit from the job wording; chassis from the VIN.
- **Air-con and stop-start: ask the customer**, only when it changes a part ("Yes / No / Not sure"). Unanswered: price the dearer version (the customer never pays more than quoted) and **tell the mechanic both versions**, so they never buy the wrong part on our say-so.
- **Remember the answer on the customer's saved car**, so they're asked once per car.

## What shipped

**Charge a part once per job** (`lib/parts/quote-parts.ts`, `mergeRepeatedPart`; committed separately as `cf18ade`). A second line for the same supplier part number on the same job (different part type, same axle and side; an axle missing on one side matches either) merges into the first at the larger quantity.

**NAPA's details read** (`lib/parts/supplier-offer.ts`). Additive `SupplierOffer` fields: `drivenUnit` ("Driven Unit"), `airCon` / `stopStart` (parsed from "Fitment": `airConOf`, `stopStartOf`), `fitmentText`, `chassis: { note, fits }` (`chassisFits`: VW-group notes "TO CH. 7H-6H079890" against the VIN NAPA returns with the quote; null when it can't tell). `OFFER_READ_VERSION` 3, so cached answers are asked again (read-only).

**Choosing the part** (`lib/parts/repair-part-choice.ts`).
- `byDrivenUnit`: on a drive-belt or belt-pulley job, when NAPA names two or more driven units: the job's named unit ("coolant pump drive belt" → water pump), else the main (alternator) belt; "all the ancillary drive belts" → one of each.
- `forChassis`: drops parts the VIN rules out.
- `forEquipment`: with the customer's answer, drops the other version.
- `equipmentOptions`: when buyable parts split on air-con or stop-start, the pick (or admin choice) for each kind of car; charged: the customer's kind, else the dearest. Returned as `fitOptions { dependsOn, options[{ partNumber, brand, for, label }], answered? }` on the part. Nothing when every kind of car takes the same part.
- `CarTraits` gains `airCon` / `stopStart`.

**Through the quote.** `quoteJobParts({ equipment })`, `quoteRepairsResult(…, equipment)`, `quoteRepairs(…, equipment)`. `RepairsQuote` gains optional `equipmentQuestions` (unanswered), `equipmentAsked` (all relevant) and `equipment` (answers used).

**Answers** (`lib/bookings/car-equipment.ts`): read from the funnel URL (`ac` / `ss` = y / n / u) or an app body (`equipment: { airCon, stopStart }`), merged with the saved car's (given wins, "Not sure" included), stored on the booking (only when answered) and the saved car (yes / no only; "Not sure" never clears an earlier answer). The question wording lives here (`EQUIPMENT_QUESTION`, `EQUIPMENT_WHY`).

**Website.** Price step (`/book/match`) shows "A quick question about your car" with Yes / No / Not sure per question, as links (server re-prices); answers travel through Time → Address → Confirm in the URL (`stepQuery`), into the Confirm draft (survives a 3-D Secure return) and into prepare / create. `checkout-context`, prepare and create resolve answers identically, so the hold matches the booking.

**Mechanics.** `booking_parts.fit_options` (written by `catalogueBookingPartRows`, at booking and when a revision re-prices parts). Website mechanic job page: an amber "Check air-con before buying" box listing each version, "(priced as)" on the charged one, "Ask the customer in the chat, or check on arrival"; when answered, "The customer said the car has air-con. If not, buy the other version." Admin job page shows the same line. A mechanic's suggested extra parts and revisions are priced with the booking's answers; a suggestion's text names both versions.

**Apps' API (additive).** `POST /quote`: body `equipment?`, response `quote.equipmentQuestions[{ key, question, why, answer }]`; reads a Bearer token if sent, for the saved car. `POST /checkout/prepare` and `POST /bookings`: body `equipment?`. Old builds send nothing: priced at the dearer version, mechanic told both.

## Migration 0093

`bookings.car_air_con`, `bookings.car_stop_start`, `customer_vehicles.air_con`, `customer_vehicles.stop_start` (boolean, null = not known), `booking_parts.fit_options` (jsonb). Server-written; read under the existing RLS row policies. **Apply before deploying**: a booking with an answer names the bookings columns (as other optional columns do, they're only named when set); `booking_parts.fit_options` falls back if missing.

## Impact on real data (2026-11-27)

- 34 jobs across 12 scanned models lose a duplicated line; no other line or quantity moves.
- Job 00133's Astra: one belt line. Unanswered, priced as GAT5PK1680 (with air-con, £23.78); "No" → GAT5PK1650 (£22.52).
- Peugeot 308: "ancillary drive belt" → 6PK1043; "all the ancillary drive belts" → 6PK1043 + 3PK576SF; "coolant pump drive belt" → 3PK576SF (that job is hidden for the 308 model in admin, so it isn't offered; it may have been hidden because it used to price the wrong belt).

Bookings already made keep their parts: the two existing bookings with the duplicated belt (job numbers 132 and 133, SW16 PFD) still have both lines.

## Not done

- Engine-variant splits ("FOR CARB" / "FOR MONOP") aren't resolved: NAPA's and HaynesPro's engine codes don't reliably match (the Astra is B10XFL to NAPA, B10XFT to HaynesPro). The pick rule chooses, as before.
- Chassis notes in other formats than VW group's.

## Acceptance criteria

- [x] The same NAPA part on one job is charged once, at the vehicle's quantity
- [x] Different parts on one job still both charge
- [x] A drive belt job takes the belt for what it drives; "all the belts" takes one of each
- [x] Chassis-number cut-offs are checked against the VIN where the format is known
- [x] Customer asked about air-con / stop-start only when it changes a part (website price step; apps via API)
- [x] Unanswered: dearer version charged, mechanic shown every version
- [x] Answer kept on the booking and the saved car; reused for the mechanic's extra work
- [x] Tests: `equipment-fit.test.ts`, `car-equipment.test.ts`, `quote-parts.test.ts`. 949 pass; `tsc` clean

## Apps

- **Customer app (`a13cd2d`):** the price step shows `quote.equipmentQuestions` (Yes / No / Not sure, wording as sent), re-quotes with `equipment`, and sends the same `equipment` to the confirm re-quote, `/checkout/prepare` and `POST /bookings`; a held authorisation is reused only when the answers match. Answers live in the booking draft, cleared on a change of reg.
- **Mechanic app (`d89a6ca`):** the job's parts read `booking_parts` with `select('*')` (safe before 0093) and show the versions box, same wording as the website.
- Both: the 0093 columns are hand-added to `src/types/database.ts`; re-run `npm run db:types` once the migration is live. Not run on a device yet.
- Old builds keep working: no field they use changed.
