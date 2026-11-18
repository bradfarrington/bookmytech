# Task 78: Buy every part a job needs, in the right number

**Status:** ✅ Complete (2026-11-18). A job now buys one part per side when NAPA lists a left and a right, and every plug the engine has when NAPA says how many. It also buys two of a part listed once on a "both" job. No migration. One additive optional field (`side`) on the mobile quote's part lines.

## Why (Gareth, via Brad, 2026-11-18)

1. "A repair which lists multiple products is only calculating one product into the price."
2. Spark plugs and glow plugs charged one plug, whatever the number of cylinders.

## What NAPA sends (live, read-only lookups, 2026-11-18)

Each article in the standard quote (`/api/quote`) is a part the car takes. Its product options are the brands to choose between. We kept one product per axle at the supplier's unit of issue (`RecMinOrdQty`, 1 for plugs), and threw away the details that say how many:

- **"No of Plugs"** on plug articles. FN60KYP (Fiesta 1.4) says 4; LA16DCV (BMW 320d) says 4.
- **Two plug articles side by side.** CX14RNY (Leon 2.0 TDI) lists Y1002AS ×3 "(Excl. pressure sensor type)" and Y1078PS ×1, `Position` "Cyl. 3", "Pressure sensor type". Best-dearest picked only the £104.88 sensor plug.
- **The side in the fitting position:** `FR LH` / `FR RH` shock absorbers, `FR DS` / `FR PS` wiper blades. Or in the description: "Tie Rod End Front Axle Left", "(Rear L/H)".
- The catalogue (`/api/quote/classic`) gives "Required quantity". Its `recMinOrdQty` of 4 on every glow plug is not the car's count (3 + 1 on the Leon).

HaynesPro's wording says how many the job wants: "Renew **both** front shock absorbers", "Renew **all the** glow plugs", "Renew **two** tail light bulbs", "Renew the **front left** shock absorber", "Renew the glow plug".

| Car | Job | Before | Now |
|---|---|---|---|
| FN60KYP | Renew the spark plugs | £4.81 | £19.24 (4 × £4.81) |
| CX14RNY | Renew all the glow plugs | £104.88 | £143.43 (3 × £12.85 + £104.88) |
| CX14RNY | Renew the glow plug | £104.88 | £12.85 |
| LA16DCV | Renew all the glow plugs | £21.38 | £85.52 |
| BA18MVO | Renew both front shock absorbers | £79.46 | £158.92 (left + right) |
| BA18MVO | Renew both rear shock absorbers | £58.59 | £117.18 (2 × the one rear part) |
| CX14RNY | Renew both track rod ends | £27.68 | £55.36 (left + right) |
| S28BSW | Renew the windscreen wiper blades | £28.02 (set) | £29.99 (driver + passenger) |

## The rules (Brad approved, 2026-11-18)

`lib/parts/repair-part-choice.ts` (`jobNeeds`, `partSlots`, `slotQuantity`, used by `selectJobParts`):

1. **Axles as before** (`partBuckets`).
2. **Sides.** When NAPA lists a left and a right part on the axle (or a driver's and a passenger's), a job that names a side takes that side's part. "One" jobs take either. Any other job takes one of each.
3. **Plugs.** When NAPA says how many the car has (`perVehicle`), a job wanting the set buys that many. That's "all", "both", or a plural part ("…the spark plugs"). Any other job buys one. On a set job, a plug NAPA lists for one cylinder ("Cyl. 3") is bought beside the others. On a one-plug job it is left out.
4. **"Both" with one unsided part** (the Civic's rear shock): at least 2. Brad agreed to this one, the only case where we assume rather than read it. Brake discs are already sold as a pair (unit of issue 2) and stay at 2, never 4.
5. **Everything else** is a choice between alternatives, as before: batteries, bulb types, fluid sizes, variant part numbers.

Offers carry `side`, `perVehicle`, `cylinder` and `fitRead` (all additive, `lib/parts/supplier-offer.ts`), read from the article's details (`AagQuoteLine.properties`, `lib/aag/quote.ts`). Cached answers without `fitRead` predate this. They are asked again rather than used as fresh, and still serve as a last known price (`freshAnswer`, `lib/parts/aag-part-prices.ts`).

A job buying two of the same part type now has two lines: `QuotedPart.side`, named "Shock absorber (front left)" by `partGroupName`. That name appears on booking parts, the mechanic's suggestions and the price step. Estimates for other cars use the same quantities (`rowLine`). The admin vehicle panel shows each side, the cylinder and the quantity the repair buys.

## Mobile

- `CustomerPartLine.side?` is additive and optional on `POST /api/mobile/v1/quote` and `/checkout/prepare`. Old builds ignore it. They will show two "Shock absorber · front" lines with the right total, which is correct but reads like a duplicate. **App work (customer app, optional):** show `side` beside `position` on part lines.
- Nothing else in either app changes. Customers see higher, correct totals on these repairs.

## Acceptance criteria

- [x] Spark and glow plugs buy every plug the engine has on an "all" or plural job, and one on a one-plug job
- [x] The Leon's pressure-sensor glow plug is bought beside the three ordinary ones, not instead of them
- [x] Left/right and driver/passenger parts are both bought on a job on both sides, and only the named side otherwise
- [x] "Both" with one unsided part buys 2; discs stay at their pair
- [x] Alternatives (batteries, bulbs, fluid sizes) still choose one
- [x] Stored answers from before re-ask NAPA instead of pricing one plug
- [x] Tests: `lib/parts/part-quantities.test.ts` (from live replies). Full suite passes; live check on the cars in the table

## Not done / noticed

- ~~Injectors~~ and ~~"windscreen" wiper jobs~~: done in Task 79 (2026-11-18).
- Gareth's own example for point 1 wasn't known; the fix covers every case found in the stored answers (87 part types list several parts on one axle).
