# Task 76: NAPA's full catalogue when the standard quote has nothing

**Status:** ✅ Complete (2026-11-17). The standard quote first, then `/api/quote/classic`, but only where classic's answer is an exact match. Applies to customer pricing and the admin Parts panel. No migration, no API shape change, nothing for Gareth to check.

## Why (Brad, 2026-11-17)

Live AAG credentials went in on 2026-11-17. On live, many repairs still showed "+ parts", and the price step then refused the booking ("We can't get a price for the parts this repair needs right now"). Brad: "we need to find a way so that nothing says + parts".

## What the live tests showed (2026-11-17, read-only lookups)

- **The standard quote and the classic quote each find parts the other misses.** On S28BSW (2024 Ford Ranger 3.0), the standard quote priced 27 of 384 part groups, classic priced 34, and the two together priced 42. Classic found alternators, and 8 of the 11 groups where the standard quote failed with ISE0047. The standard quote found bulbs and mirrors that classic didn't.
- **FN60KYP (2010 Fiesta 1.4), all 1,213 parts repairs:** 274 fully priced on the standard quote alone (23%). With classic's exact matches only, 361 (30%). With every classic answer, 498 (41%), but that included guesses (below).
- **Classic lists the model's whole range, with NAPA's conditions on each part.** For FN60KYP's front discs it listed Brembo 09.C422.11 (278 mm, "for vehicles with disc brakes on the rear axle") beside 09.A968.21 (258 mm, "for vehicles with drum brakes on the rear axle", the one the standard quote returns). "Best, dearest" would have picked the wrong one. Of the 79 part groups only classic priced on the Fiesta, 27 carry no vehicle condition at all; the other 52 are limited to some versions (right-hand drive, engine codes, trim, "new fixing system"). Brad, 2026-11-17: the system must decide fit itself, never ask Gareth to check, and must not guess.
- **The rest is mostly not a lookup problem.** About 113 Fiesta repairs only check, tighten or clean a part and shouldn't charge for it (Task 73). Most of the others are bodywork, interior and dealer-only parts that NAPA doesn't sell (speakers, trims, glass, hinges, seat belts, airbags, dashboards). About 20–30 are parts NAPA sells under another heading (a tensioner in a timing belt kit).
- **The Ranger is an outlier.** Across the 31 cars looked up in the app (1994–2024), nearly all priced 9 or 10 of 10 common parts, including 2023 and 2024 vans. The Ranger returned "no parts" for headlight bulbs, shock absorbers and driveshafts that every older car prices. That's a question for AAG.
- **HaynesPro marks each part group on a job as `mandatory`** (`ExtGeneralArticle.mandatory`, Repair Times OpenAPI). Every group on the Ranger's jobs is mandatory, so the flag doesn't change coverage there. `getFullTree` returns a car's whole repair tree in one call, without genarts, and `getRepairtimeNodesV4` takes 200 ids per call. That makes a full-car coverage check about 12 calls instead of about 360.

## What shipped

- `lib/parts/aag-live-offers.ts`: `fetchAagLiveOffers` asks the standard quote, then classic when it has no parts or fails. Only classic's unambiguous parts are used (`unambiguousClassic` in `lib/aag/quote.ts`): per axle, the parts are used only when none carries a vehicle condition, even a lone one. An axle with any conditioned part is dropped, never guessed, and falls through to estimates as before. Classic parts carry `fromCatalogue: true` as a record only. Its "no parts" vs "failed" rules: either lookup saying plainly "no parts" means no parts. Classic's ISE0047 is ambiguous (it also means "nothing"), so it never turns a standard-quote failure into "no parts", and the price cache keeps its last known answer.
- `lib/aag/quote.ts` `classicToQuoteBody`: a classic reply becomes one standard-quote article per product. Ratings take the standard casing ("best" → "Best"). "Front Axle" / "Rear Axle" become `FR` / `RR`, so a front job never takes a rear part. Stocked branches are ranked in NAPA's order (classic gives no priority), and "N/A" becomes no ETA.
- `lib/aag/client.ts` `aagQuoteClassicResult`: one GenArt, with "no parts" kept apart from failures.
- `lib/aag/types.ts`: classic types corrected to the camelCase live and UAT actually send.
- `lib/parts/aag-part-prices.ts` (customer pricing and the cache) and `lib/parts/supplier-lookup.ts` (admin Parts panel) both ask through `fetchAagLiveOffers`.
- `SupplierOffer.fromCatalogue?` and `QuotedPart.fromCatalogue?`: additive, optional, record only. No UI: a part used from classic fits as surely as one from the standard quote.
- `scripts/probe-aag-quote.mjs --classic` now reads classic's camelCase. It printed "0 products" before.

The default pick is unchanged: the admin's choice for the engine variant, else Best-rated, dearest within. Because the variants are filtered out first, it only ever chooses between parts that all fit.

Possible later gain: some conditions can be settled from what we know about the car (UK cars are right-hand drive; engine codes and rear drums/discs from HaynesPro). Settling them would turn some of the 52 conditioned Fiesta groups into exact matches. Not built.

## Acceptance

- [x] A part group the standard quote has nothing for is priced from classic when classic has parts.
- [x] The standard quote is never second-guessed: when it has parts, classic isn't asked.
- [x] Classic's front and rear parts land on the right axle.
- [x] A failure on both keeps the cache's last known answer (unchanged 7-day rule).
- [x] Classic parts with variants on the job's axle are never priced (no guessing).
- [x] Only read-only lookups are sent: both paths go through `AAG_READ_ONLY_PATHS`.

## Notes

- **Latency:** a part group the standard quote misses now costs a second call (4 s timeout on the customer path). A cold reg's repair list may show "+ parts" for longer on first load (`LEVEL_PARTS_BUDGET_MS` 4.5 s). The work still finishes and fills the cache, so a reload shows the price.
- **Cache:** answers stored as "empty" before this shipped keep being served until they're 12 hours old, then the fallback applies.
- **Mobile apps:** no API or schema change. More repairs now show a full price instead of "+ parts" in both apps, because the server prices them.

## Next

Task 73 shipped the same day. The plan for the remaining gaps (engine-code match, code mapping, Gareth's model prices, hiding, a "Parts gaps" admin screen) is in `docs/HANDOFF.md` under 2026-11-17. AAG is **not** to be asked to fix gaps (Brad, 2026-11-17).
