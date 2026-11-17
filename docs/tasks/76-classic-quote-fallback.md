# Task 76: NAPA's full catalogue when the standard quote has nothing

**Status:** ✅ Complete (2026-11-17). The standard quote first, then `/api/quote/classic`, for customer pricing and the admin Parts panel. No migration, no API shape change. Deviation: the "check fit" flag reaches Gareth's Parts panel and the quote snapshot, but not the mechanic's job screen. That needs a `booking_parts` column (and both apps' types regenerated), so it's left for a follow-up.

## Why (Brad, 2026-11-17)

Live AAG credentials went in on 2026-11-17. On live, many repairs still showed "+ parts", and the price step then refused the booking ("We can't get a price for the parts this repair needs right now"). Brad: "we need to find a way so that nothing says + parts".

## What the live tests showed (2026-11-17, read-only lookups)

- **The standard quote and the classic quote each find parts the other misses.** On S28BSW (2024 Ford Ranger 3.0), the standard quote priced 27 of 384 part groups, classic priced 34, and the two together priced 42. Classic found alternators, and 8 of the 11 groups where the standard quote failed with ISE0047. The standard quote found bulbs and mirrors that classic didn't.
- **FN60KYP (2010 Fiesta 1.4):** of the 1,037 parts repairs a customer can see (after the admin's 1,209 hides), 235 were fully priced on the standard quote alone (23%) and 424 with the fallback (41%).
- **The rest is mostly not a lookup problem.** About 113 Fiesta repairs only check, tighten or clean a part and shouldn't charge for it (Task 73). Most of the others are bodywork, interior and dealer-only parts that NAPA doesn't sell (speakers, trims, glass, hinges, seat belts, airbags, dashboards). About 20–30 are parts NAPA sells under another heading (a tensioner in a timing belt kit).
- **The Ranger is an outlier.** Across the 31 cars looked up in the app (1994–2024), nearly all priced 9 or 10 of 10 common parts, including 2023 and 2024 vans. The Ranger returned "no parts" for headlight bulbs, shock absorbers and driveshafts that every older car prices. That's a question for AAG.
- **HaynesPro marks each part group on a job as `mandatory`** (`ExtGeneralArticle.mandatory`, Repair Times OpenAPI). Every group on the Ranger's jobs is mandatory, so the flag doesn't change coverage there. `getFullTree` returns a car's whole repair tree in one call, without genarts, and `getRepairtimeNodesV4` takes 200 ids per call. That makes a full-car coverage check about 12 calls instead of about 360.

## What shipped

- `lib/parts/aag-live-offers.ts`: `fetchAagLiveOffers` asks the standard quote, then classic when it has no parts or fails. Classic parts are marked `fromCatalogue: true`. Its "no parts" vs "failed" rules: either lookup saying plainly "no parts" means no parts. Classic's ISE0047 is ambiguous (it also means "nothing"), so it never turns a standard-quote failure into "no parts", and the price cache keeps its last known answer.
- `lib/aag/quote.ts` `classicToQuoteBody`: a classic reply becomes one standard-quote article per product. Ratings take the standard casing ("best" → "Best"). "Front Axle" / "Rear Axle" become `FR` / `RR`, so a front job never takes a rear part. Stocked branches are ranked in NAPA's order (classic gives no priority), and "N/A" becomes no ETA.
- `lib/aag/client.ts` `aagQuoteClassicResult`: one GenArt, with "no parts" kept apart from failures.
- `lib/aag/types.ts`: classic types corrected to the camelCase live and UAT actually send.
- `lib/parts/aag-part-prices.ts` (customer pricing and the cache) and `lib/parts/supplier-lookup.ts` (admin Parts panel) both ask through `fetchAagLiveOffers`.
- `SupplierOffer.fromCatalogue?` and `QuotedPart.fromCatalogue?`: additive and optional. The admin Parts panel shows a "Full catalogue" pill and a "check it fits this engine" line.
- `scripts/probe-aag-quote.mjs --classic` now reads classic's camelCase. It printed "0 products" before.

The default pick is unchanged: the admin's choice for the engine variant, else Best-rated, dearest within. Classic lists the model's whole range, so the dearest Best could be for another engine version. That's why it's flagged.

## Acceptance

- [x] A part group the standard quote has nothing for is priced from classic when classic has parts.
- [x] The standard quote is never second-guessed: when it has parts, classic isn't asked.
- [x] Classic's front and rear parts land on the right axle.
- [x] A failure on both keeps the cache's last known answer (unchanged 7-day rule).
- [x] Admin Parts panel marks classic parts.
- [ ] Mechanic job screen marks classic parts: deferred (needs a `booking_parts` column; see Status).
- [x] Only read-only lookups are sent: both paths go through `AAG_READ_ONLY_PATHS`.

## Notes

- **Latency:** a part group the standard quote misses now costs a second call (4 s timeout on the customer path). A cold reg's repair list may show "+ parts" for longer on first load (`LEVEL_PARTS_BUDGET_MS` 4.5 s). The work still finishes and fills the cache, so a reload shows the price.
- **Cache:** answers stored as "empty" before this shipped keep being served until they're 12 hours old, then the fallback applies.
- **Mobile apps:** no API or schema change. More repairs now show a full price instead of "+ parts" in both apps, because the server prices them.

## Next (agreed with Brad 2026-11-17, not started)

1. Task 73 (charge only the parts a job replaces): confirm the spec with Brad first.
2. An admin list of "repairs that don't price", ranked by how many cars each fails on, with hide, set price and "use NAPA's equivalent part" (matching) per repair type.
3. Email AAG about the 2024 Ranger (S28BSW): bulbs (107), shock absorbers (854) and driveshafts (13) return ISE0011/ISE0006 but price on every older car.
