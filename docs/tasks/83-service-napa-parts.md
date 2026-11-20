# Task 83: NAPA parts on manually added services

**Status:** ✅ Complete (2026-11-20). Built as proposed. Migration `0091` adds `catalogue_products.part_genart_ids`. A service with parts ticked gets each part priced from NAPA for the car, on top of its own price, which becomes the labour. Deviations from the proposal:
- The admin picker is a fixed list of part types (`lib/catalogue/service-parts.ts`), not a search of every NAPA part type. One line adds another. Gareth's five, plus glow plugs (243), brake fluid (3357) and coolant (3356) added the same day for services he adds later (Brad). The fluids are bought by HaynesPro's capacity for the car. A searchable picker of every part type waits until he needs more.
- No data is seeded. Ticking the parts and dropping the price to labour only are one save, so nobody is charged for filters twice.
- Not live-fired on a real car yet.

Brad, 2026-11-20: "for the services weve added manually like the diagnostics or something else that needs oil for example - can we get those to price up for the parts from napa aswell please and if so how will we do it"

## How it worked before

The services added by hand (diagnostics, servicing, inspections, DPF cleans) are `catalogue_products` rows. Each has a fixed price or set labour hours. The only extra a service could carry was engine oil, charged at the £/litre setting × the oil capacity HaynesPro gives for the car. No NAPA parts were involved.

Repairs are different: each HaynesPro job lists its part types, and `quoteJobParts` prices those from NAPA for the exact car.

## Answers (Brad and Gareth, 2026-11-20)

- [x] **Do the current service prices already include the filters?** Yes. Each service's price becomes the labour, and the parts go on top ("then we will just add our labour"). Brad and Gareth set the labour figures in `/admin/services`.
- [x] **What if NAPA can't price a part for a car?** Not answered directly. Built to the standing rule for repairs (Brad, 2026-11-17: "if it doesn't return then it should go to get a quote"). The service offers "Get a quote" for that car. Changing this to fall back to a fixed price would be a small change in `foldProductParts` and the quote.
- [x] **Should engine oil keep using the £/litre setting?** Yes: £/litre × HaynesPro's capacity, as now. Any service that needs oil uses the same switch.
- [x] **Which services need parts?** Gareth:
  - Interim service: oil, oil filter
  - Full service: oil, oil filter, air filter
  - Major service (petrol): oil, oil filter, air filter, cabin/pollen filter, spark plugs
  - Major service (diesel): oil, oil filter, air filter, cabin/pollen filter, fuel filter

## What shipped

1. **Parts per service in the admin.** `/admin/services` → edit has a "NAPA parts" box of ticks: Oil filter (7), Air filter (8), Pollen filter (424), Fuel filter (9), Spark plugs (686), Glow plugs (243), Brake fluid (3357), Coolant (3356). The ids were checked against NAPA's cached answers. When any are ticked, the price field reads "Price (labour)". The services table shows "+ NAPA oil filter, air filter…" under the price. Saving with ticks before `0091` is applied says so.
2. **Priced like a repair.** `quoteRepairsResult` adds each product's parts to the same `quoteJobParts` call as the repairs (`servicePartsJobs`), under the product's own id (`p:<uuid>`). So a service gets:
   - the right part for that reg
   - every spark plug (from NAPA's "No of Plugs"; if NAPA doesn't say, it goes to a quote, as the repair does)
   - the parts markup (Task 82)
   - Gareth's per-model picks (Task 77)
   - parts saved on the booking (`booking_parts.node_id = 'p:<uuid>'`), so the mechanic sees what to buy
   - "Get a quote" when a part can't be priced, with the service named in `quoteJobs`
3. **Priced in the list.** The Servicing level and search hits price the parts (`priceProductParts` / `foldProductParts` in `lib/catalogue/level-parts.ts`), setting `partsPence` / `totalPence` / `needsQuote` exactly as repair rows do. The website shows the logo until it's priced, and a service row says "parts included". Until priced, a product node carries `genartIds`, so a client shows "+ parts" or a quote button rather than a short price.
4. **Warmed early.** `warm-parts.ts` asks NAPA for the part types of the services offered for the car's fuel first, when the reg is looked up.
5. **Homepage.** A service with parts reads "from £X + oil & parts" (before the car is known).

## Acceptance

- [x] Admin can tick NAPA part types per service; saved in `part_genart_ids`.
- [x] Quote, hold and booking price a service's parts from NAPA for the exact car, on top of its price and oil.
- [x] Spark plugs are bought per cylinder.
- [x] A service whose part NAPA can't price goes to "Get a quote".
- [x] The Servicing list shows the parts-inclusive price.
- [x] Unit tests: `lib/catalogue/service-parts.test.ts` (9). Full suite passing, `tsc` and lint clean.
- [ ] Live check on a real petrol and diesel reg once `0091` is applied and the parts are ticked (Brad).

## To switch it on (Brad)

1. ~~Apply `supabase/migrations/0091_service_parts.sql`.~~ Applied 2026-11-20.
2. In `/admin/services`, for each service, tick its parts and change the price to labour only, **in the same save**:
   - Interim service: Oil filter
   - Full service: Oil filter, Air filter
   - Major service (petrol): Oil filter, Air filter, Pollen filter, Spark plugs
   - Major service (diesel): Oil filter, Air filter, Pollen filter, Fuel filter
   - Leave "Includes engine oil" on.
3. The diesel Major service's "What's included" doesn't mention the fuel filter. Add it if it should.

## App impact

- **Migration `0091`**: regenerate types in both apps (`npm run db:types`). Neither app reads `catalogue_products` directly.
- **Pricing change**: once the parts are ticked, service prices are per car (labour + oil + parts).
- **API (additive only)**: product nodes in `/repairs/tree` and `/repairs/search` may now carry `genartIds`, `partsPence`, `totalPence`, `partsEstimated` and `needsQuote`, the same optional fields repair nodes already carry. The quote's `parts` lines may now have a service's `p:<uuid>` as their `nodeId`, and `quoteJobs` may name a service. No field renamed or removed.
- **The customer app**: its `describeNodePrice` already reads `needsQuote` → `totalPence` → `+ parts` for any node, so the list should be right with no change. To check in the app: the service row shows the total and "Get a quote" correctly, and the price step lists the service's part lines. Old builds from before Task 63 show the service's labour + oil with "+ parts".
