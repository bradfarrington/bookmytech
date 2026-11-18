# Task 79: Gareth's FN60KYP and LP17BJY queries

**Status:** ✅ Complete (2026-11-18). Search prices its parts. The website's repair list streams its prices in with a longer wait. No more workshop drums of fluid. A timed-out lookup is no longer stored as "no parts". Injectors are counted. Windscreen wiper jobs are the front only. No migration. One additive opt-in on the mobile search (`parts=1`).

Gareth tested on FN60KYP (2010 Fiesta 1.4) and LP17BJY (2017 Toyota ProAce 2.0 D4D) and sent screenshots, 2026-11-18.

## 1. Search shows "+ parts" (LP17BJY, "pads")

Gareth asked if it was because he'd redone the categories. It wasn't. **Search never priced parts**: only browsed levels did (Task 63).

- `searchRepairCatalogue(reg, q, db, { priceParts })` collects the HaynesPro job behind every hit (and every combined repair's jobs) and prices them through the same `withLevelParts` a level uses.
- The website's search (`app/actions/repair-search.ts`) passes `priceParts: true`.
- `GET /api/mobile/v1/repairs/search` takes **`parts=1`**, additive and opt-in like `/repairs/tree?parts=1`. Without it the hits are labour only, as before.
- After this, LP17BJY "pads": front pads £155.49, rear £147.82. **The two "Pads and Discs" combined repairs ask for a quote:** the disc jobs also list part type 54 "Bolt, brake disc" (the retaining screw), which NAPA doesn't sell. Switching 54 to "not charged" on a vehicle's Parts panel would price them (Brad/Gareth to decide).

## 2. £711.69 to drain and refill the coolant (LP17BJY)

When NAPA's standard quote had nothing, the catalogue offered antifreeze in **199 and 208 litre workshop drums**, and "Best, dearest" took one: £611.69 of antifreeze. With today's standard answer (1 L, 5 L, 20 L) it took the 20 L.

`sensiblePacks` (`lib/parts/repair-part-choice.ts`) narrows the default pick when NAPA lists a fluid in pack sizes:
- **Drums over 25 litres are never charged.** With nothing else, the part is priced by quote.
- Then the **biggest pack up to 5 litres** (antifreeze, gear and transmission oil), or **1 litre for brake fluid**. With none that small, the smallest pack.
- An unlabelled pack beside labelled ones is dropped (a drum NAPA didn't label).
- An admin's choice is still honoured whatever its size.

LP17BJY's drain and refill is now £122.37 (5 L at £22.37). This also settles Task 77's open item: brake fluid now defaults to the 1 litre bottle, not 5 litres. **Brad/Gareth: change the caps if those aren't right** (`packCapLitres`).

## 3. Timing and starter motor show "+ parts" (FN60KYP)

On a car's first visit, NAPA often took over 4 s per lookup (seen live today). The level's 4.5 s budget then ran out, and every row read "+ parts". The abandoned lookups still stored their answers, so a reload priced them: timing belt kit £64.36 (+ labour £250), with coolant pump £94.28, timing belt £17.19, starter motor £95.52. These are the parts on NAPA's portal in Gareth's screenshot.

The website's repair list (`repair-browser.tsx`) now renders the rows at once, labour only. A job with parts reads "Pricing". The level is priced again in a `<Suspense>` boundary (`PricedRows`), with **15 s overall and 8 s per NAPA call** (`STREAMED_PARTS_WAIT`), and streams in. Measured on a dev server: rows in 0.5–2 s, prices by 10–12 s on a cold car. `getRepairCatalogueLevel` / `searchRepairCatalogue` take `partsWait`. The funnel's price step and the mobile tree keep the 4.5 s / 4 s defaults.

**Mobile:** `/repairs/tree?parts=1` still has the 4.5 s budget, so a cold car in the app still reads "+ parts" until refreshed. Options for later: a longer budget for the app's call, or a second request from the app after the first.

## 4. Coil springs ask for a quote, though NAPA stocks them (FN60KYP)

At 16:26 the standard quote timed out. The catalogue listed standard and sports-suspension springs, which we rightly won't guess between. That was stored as **"no parts" for 12 hours**. Now (`lib/parts/aag-live-offers.ts`), a standard quote that **timed out or couldn't be reached**, followed by a catalogue of only variants, is a failure. Nothing is stored, the last known answer is kept, and NAPA is asked again next time. A standard quote that **answered** with an error (ISE0047, which some part types get every time) still lets the catalogue's answer stand, as before. `AagQuoteOutcome.failed.answered` tells the two apart.

FN60KYP's stored "no parts" row for part type 188 expires at about 04:26 on 2026-11-19. Until then its springs still ask for a quote. NAPA's standard quote does price them: KYB £19.87 front.

**Noticed, not changed:** NAPA lists a standard and a sports spring for the Fiesta as alternatives ("Suspension Note"). "Best, dearest" takes the sports one (£27.30 vs £19.87). The same may apply to shock absorbers.

## 5. Injectors (from Task 78)

NAPA's standard quote answers ISE0047 for injectors on every car tried. The catalogue sometimes says how many ("Quantity": 4 on DN23HFL), often not (CX16NYL).
- "Quantity" counts as the car's number for injectors only (on other parts it can mean the pack).
- A job renewing **every** plug, injector or ignition coil when NAPA doesn't say how many now goes to a **quote**, not charging one (`slotQuantity` returns null). "Renew the injector" still buys one.

## 6. "Windscreen" wiper jobs (from Task 78)

`jobPosition` reads "windscreen" as the front unless the job says rear. BA18MVO's "Renew the windscreen wiper blades" no longer adds the rear blade (£6.99).

## Acceptance criteria

- [x] Search hits show labour + parts on the website; the app can opt in with `parts=1`
- [x] No workshop drum is ever charged by default; antifreeze takes up to 5 L, brake fluid 1 L
- [x] The website's repair list shows rows at once and streams prices in with a longer wait
- [x] A timed-out standard quote plus an all-variants catalogue is not stored as "no parts"
- [x] Injectors counted where NAPA says; unknown counts on every-cylinder jobs go to a quote
- [x] Windscreen wiper jobs are the front only
- [x] Tests: `part-quantities.test.ts`, `aag-live-offers.test.ts`. 862 pass; `next build` passes; checked live on LP17BJY, FN60KYP and LA16DCV
