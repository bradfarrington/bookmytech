# Task 77: Closing NAPA's parts gaps

**Status:** 🟡 Built and pushed 2026-11-17, **Parts gaps screen local-only** (`lib/parts/parts-gaps-flag.ts`: shows on `next dev` only; the page 404s and its actions refuse on live and previews, Brad: "we haven't figured out what we're doing with that yet"). The pricing changes, the engine-code match and the three bug fixes below are live. Migration `0090` **applied** to the live database by Brad; 12 models scanned. Engine-code matching, code mappings (lookup + approval) and model part picks are built and tested; the Parts gaps screen is at `/admin/parts/gaps`. Code-match discovery run on 11 cars: three matches proposed. Deviation from the 2026-11-17 plan: Gareth **picks a NAPA part** per model rather than typing a price (Brad, 2026-11-17: "we don't want to be adding in prices manually - we want to be selecting parts"), and hiding needs nothing new: the existing global hides on Repairs already do it.

## Why

Task 76 left 539 of the 2024 Ranger's (S28BSW) 614 parts repairs unpriced. The agreed plan (`docs/HANDOFF.md`, 2026-11-17), as revised by Brad:

1. **Engine-code matches** (automatic, us).
2. **Code mapping** (us, Gareth approves): HaynesPro's code → the code NAPA stocks the same named part under. Up to 163 Ranger repairs, where NAPA has an equivalent code.
3. **Model parts** (Gareth): where NAPA sells a part type but lists nothing for a model, Gareth picks the part once per model and part type. 195 Ranger repairs.
4. **Hiding** (Gareth): dealer and bodyshop jobs, for every car. Already possible: global hides on `/admin/repairs` (Task 23).

Rules that still apply: never match by similar wording, never ask AAG/NAPA to fix gaps, never order from AAG, nothing for Gareth links to claude.ai.

## What shipped

**Engine codes** (`lib/parts/engine-codes.ts`, `lib/aag/quote.ts`)
- A catalogue part whose only vehicle condition is `TecDoc Engine Number` fits when one of its codes is the car's own. The car's codes come from NAPA's exact-match answers (`ArticleProperties` "Engine Code"), so it's NAPA checked against NAPA.
- A car can have several codes for one engine: FN60KYP is `C14HDEZ` on its filters and `SPJC` on its pads; BMW gives `S55B30T0 (S55B30A)`. Every code seen is kept per registration in `aag_engine_codes`.
- Codes are learnt from every standard quote with parts. When a catalogue part needs one and none is known, NAPA is asked for the oil and air filters (7, 8), which carried the code on every car tried except the Tesla (no code, so its engine-limited parts stay unpriced).
- Parts listed for another engine are left out; any other condition still drops the axle.
- **Safety fix found on the way:** a catalogue part placed by end or side rather than axle ("Transmission sided" / "Frontal sided" crankshaft seals, 572) is now a variant and never picked. Before, only the engine condition was stopping 572 from charging the dearer seal for either end.
- Live, read-only, S28BSW: 321, 323 and 1217 go from no parts to priced (£16.27, £24.89, £37.48); 572 stays unpriced.

**Code mappings** (`lib/parts/code-maps.ts`, `part_code_maps`)
- Only `approved` rows are used. NAPA is asked under both codes at once; HaynesPro's own code wins whenever it has parts. Mapped parts carry `napaGenart` on the offer.
- Approving clears the cached "no parts" answers for that part type, so the next quote asks again.
- Seeded with one proposal: brake fluid 71 → 3357 (checked live: 71 has nothing on S28BSW or FN60KYP; 3357 lists 4 and 14 unconditioned products in the full catalogue). **Caveat shown on the screen:** those products are one fluid in 0.25 / 0.5 / 1 / 5 litre bottles, and the default pick (Best, dearest) is the 5 litre at £45.57.

**Model parts** (`lib/parts/model-parts.ts`, `model_part_choices`, `aag_product_prices`)
- Keyed on HaynesPro's exact model (`hp_make` + `hp_model_label`), so "FORD Ranger" is apart from an older "FORD Ranger (TKE)". Optionally per axle.
- Priced live by part number through `/api/product/info`, which gives the same trade price as the car lookups (checked live: £31.85, £45.69, £26.96 on FN60KYP's discs). Cached 12 h fresh / 7 days last known, like `aag_part_prices`.
- Used only where NAPA has no part for the car; before estimates and set prices. Quoted as `source: "chosen"` with `modelPart: true`.
- The picker refuses a part number NAPA files under a different part type (`CustomerProductGroup`).

**Gap recording** (`lib/parts/part-gaps.ts`, `part_gaps`)
- `quoteJobParts` records each charged part type NAPA had nothing for, per model, with HaynesPro's name, a repair that needs it and the last reg. One upsert per quote that has gaps.

**Parts gaps screen** (`/admin/parts/gaps`, `app/actions/parts-gaps.ts`), reworked the same day at Brad's request ("laid out properly just like the haynespro categories … with dropdowns for the parts to choose from for the repair")
- **Scan a model** by registration (`lib/parts/model-scan.ts`, `model_part_scans`): HaynesPro's whole tree in one `getFullTree` call plus part types 200 repairs a call (12–20 metered calls a car), saved; then NAPA asked, read-only, for the part types on **visible** repairs only.
- The model's visible repairs that NAPA can't price, laid out by HaynesPro category (icon, category, sub-group trail, repair), each missing part with a **dropdown**: parts NAPA priced under that part type on other cars (same make first, never the model itself, axle-matched), or "Another NAPA part number…" checked live. A choice covers the part type on the whole model (per axle where the repair names one). "Show every repair" lists the priced ones too; "Re-check NAPA" asks again.
- Code matches to review (approve / reject / undo) with evidence, and **Find code matches** (`lib/parts/code-match-discovery.ts`) across every scanned model: identical HaynesPro names only.
- Models customers priced with missing parts that aren't scanned yet, each with a one-click scan.
- No sidebar link (Brad, 2026-11-17); locally it is reached by typing `/admin/parts/gaps`.
- **Plain-English pass (Brad, 2026-11-17: "explain more about whats done but in plain english so a student in year 5 could understand it")**: a "How this page works" panel (four steps, what the computer already does, what Gareth needs to do), "Same part, two names" with Yes / No buttons, a progress bar and four counts per model, and wording without jargon ("Add a car model", "Ask NAPA again").
- **NAPA's pictures**: the part dropdown is a searchable list of cards showing NAPA's picture (95% of NAPA offers carry one), the part's name, brand, part number, quality rating, price and the cars NAPA sells it for, with a warning that these are parts for other cars and must be checked before choosing. A chosen part shows as a green card with its picture.
- Scans ask NAPA with a 15 s timeout, 10 part types at a time (customers' quotes keep 4 s); the first import at 4 s, 25 at a time, timed out 329 times.
- A part type NAPA gave no clear answer on (its general error on both lookups, so nothing is stored) says so, and can still be chosen.

**Code-match discovery, run 2026-11-17** on S28BSW plus ten cars (FN60KYP, L1BSW, LA16DCV, CX14RNY, SG62UBC, P33LUE, KR65MHX, CX16NYL, BA18MVO, DN23HFL; 193 HaynesPro calls): 887 part-type codes, only 18 names used under two codes. Checked live on three cars, three are real matches and are seeded as proposals: brake fluid 71 → 3357, front fog light 289 → 2484, headlight 2482 → 259. Both codes work for engine oil, antifreeze, drive shafts and mirror covers (no mapping needed); neither works for fuses, sun visors, seat covers and the rest. **So code matching is small:** most of the Ranger's "NAPA doesn't answer to this code" gaps are parts NAPA doesn't stock under any code, and fall to hiding or a chosen part.

**Three live bugs found and fixed on the way (2026-11-17, evening)**
- **Oxygen sensor jobs priced the wrong part.** HaynesPro lists "Sensor, exhaust gas temperature" (3938) on "Renew the upstream / downstream / catalytic converter downstream oxygen sensor"; NAPA prices 3938 as exhaust gas temperature sensors (NGK 97265 on a Transit). `correctedGroups` in `lib/parts/job-charges.ts` (applied inside `chargedGroups`, so every reader gets it) swaps it for "Oxygen sensor" (3922) on oxygen/lambda sensor jobs, on every car. No booking had been priced with 3938.
- **Global hides hid the wrong repairs.** HaynesPro numbers a job's versions per car: 1E05001991WV1 is "Renew the starter motor Dual-clutch transmission" on one car and "… Manual transmission" on a 2010 Fiesta. Hides keyed on the id hid repairs Gareth never chose (418 across the 11 scanned cars, 15–78 per car: the Fiesta's manual starter, a Civic's brake master cylinder…) and missed the ones he did where the number differed. `lib/haynespro/exclusions.ts` now matches a hide on a variant id (…WV<n>) by HaynesPro's job number plus the wording saved with the hide (`variantKey`, `NodeMatcher`); groups and other ids still match by id; without wording a variant falls back to its id. Checked on the 11 cars: 0 wrongly hidden (was 418), every intended hide still applies, 346 wrongly hidden repairs back. Callers (catalogue, search, quoteRepair, admin model page, Parts gaps) pass HaynesPro's name; `quoteRepair` now checks after fetching the nodes.
- **A group opened from a search hit showed the search results instead of the group.** `RepairSearch` is keyed on the level (`repair-browser.tsx`), so its query clears when the customer opens a group. Together with the hides fix, "starter motor" on FN60KYP now opens to both starter jobs, priced with parts (£155.52 manual, £167.52 automatic).
- **Renames had the same variant problem (found 2026-11-17, after the hides fix).** `repair_catalogue_overrides` matched by id, so a rename on a variant landed on whichever job had that number on each car: the Civic's manual and CVT brake fluid reservoirs both read "Renew the brake fluid reservoir", the Sportage's 4WD "Remove/refit the anti-roll bar" read "Renew the anti-roll bar (rear axle nearside)", and the Fiesta's manual starter (…WV1) missed the rename made on the Leon's (…WV2). `overrideFor` (`lib/catalogue/overlay.ts`) now matches a variant override by job number + saved wording, like hides; catalogue, search and the admin model page use it. Replayed on the 12 scanned cars' full trees: 0 renames on the wrong job, 0 missed. Moves on variants still go by id (none exist today).
- **Saving a hide or rename could overwrite another car's row.** Both tables hold one row per node id, so hiding or renaming the Leon's plain starter (…WV1) would have replaced the Fiesta's manual-starter row (also …WV1). `setRepairVehicleAvailability` and `upsertOverride` now refuse when the row under that number was saved for different wording (`isSameVariantJob`), with a message naming the other job. A proper fix is a key that includes the wording (migration), not done.
- **Customer app: a group opened from search kept the search on screen** (`bmt-customer-app` `src/app/book/repairs.tsx`, same bug as the website's). Opening a group from results now clears the search and starts its trail from the top.

## Manual quote when NAPA doesn't list a part (2026-11-17)

Gareth, on parts NAPA hasn't listed (the Ranger's): *"have a message pop up with contact us for a manual quote that way we can quote manually but hopefully not too much needs to be manually quoted"*. Brad: positive wording, no "we can't".

- `MissingPart.reason` (`lib/parts/quote-parts.ts`): **`not_listed`** when NAPA answered and has nothing usable for the car (lists nothing, or nothing it will price), **`unavailable`** when NAPA didn't answer. `needsManualQuote` is true for **either** (Brad, 2026-11-17: "if it doesn't return then it should go to get a quote route"), so a refusal over parts always offers the quote and never says "try again". The reason is kept for the logs. The browse list flags a row as soon as its parts come back unpriced; only when the whole level runs past its time budget does a row still read "+ parts", and its price step then offers the quote.
- `quoteRepairsResult` keeps `reason: "parts_unavailable"` (every caller's branching is unchanged) and adds `needsQuote: true` + `quoteJobs` (the repairs, by the names the customer saw). `PARTS_NEED_QUOTE_MESSAGE`: *"Our team prices the parts for this repair on your car by hand. Ask us for a quote and we'll email you a price."* It is what booking create returns too.
- Catalogue levels flag such rows `needsQuote: true` (`quoteOnlyLevelRows`); never with `totalPence`. Search hits aren't parts-priced, so they read "+ parts" and the price step offers the quote.
- **Website:** the row says "parts priced by our team" and **Get a quote** opens a pop-up (*"We'll price this one for you"*) → `/book/quote/request?…&for=parts` with the repair filled in; the price step shows the message and **Ask for a quote**.
- **App** (`bmt-customer-app`): the same pop-up (native alert), "Get a quote" on the row, and **Ask for a quote** on the price step; `for=parts` changes the request screen's intro.
- Live check on S28BSW: "Renew the glow plug" and "Renew the glow plug relay" come back `needsQuote`; the alternator, starter, air filter and front pads still price.

**Pricing answers (Gareth via Brad, 2026-11-17):** no markup on parts (NAPA trade price, as now); VAT left as it is; mechanics buy the parts. Gareth worked out £24 profit for a mechanic on one repair: commission is taken on parts too, so a parts-heavy job leaves little (1 h + £175 of parts: £58.75, or £23.75 if the mechanic can't reclaim VAT on the parts). Left as is by decision.

## Migration `0090_parts_gaps.sql`

Six new tables (`aag_engine_codes`, `part_code_maps`, `model_part_choices`, `aag_product_prices`, `part_gaps`, `model_part_scans`), three seeded code-match proposals, RLS on, admin select, service-role writes. Nothing existing changed. Until it's applied everything degrades to Task 76 behaviour: no stored engine codes (still learnt per request), nothing mapped, nothing picked, nothing recorded, and the screen says to apply it.

## Mobile apps

**Manual quotes (2026-11-17), additive only:** `GET /repairs/tree` rows may carry `needsQuote: true`; a `not_priceable` reply from `POST /quote` may carry `needsQuote: true` and `quoteJobs: string[]`, with a new `message`. Old builds show the message verbatim (it says to ask for a quote) and their "Ask for a quote" card still works; the app update adds the pop-up and buttons.

No API path, request or response shape changes. **Displayed figures and lists change** (AGENTS.md): oxygen sensor jobs are now priced with a lambda sensor, and repairs that were wrongly hidden by variant number appear again in both apps (the mobile repair endpoints use the same catalogue code). Nothing to do in the app repos beyond the type regeneration. `QuotedPart` and `SupplierOffer` gain optional fields only (`modelPart`, `napaGenart`); `customerPartLines` is unchanged. Both apps should regenerate their types after `0090` (`npm run db:types`), as after every migration; they don't read the new tables.

## Acceptance

- [x] A catalogue part limited to the car's own engine code is priced; one for another engine is never used.
- [x] A part placed by end or side is never picked from the catalogue.
- [x] Approved mappings price under NAPA's code on every car; HaynesPro's own code still wins when it has parts.
- [x] An admin can pick a NAPA part for a model and part type (optionally per axle); customers pay NAPA's live price for it.
- [x] Gaps are recorded per model as customers price repairs, and listed on the Parts gaps screen.
- [x] Only read-only NAPA lookups are sent.
- [x] Code-match discovery run (11 cars); three proposals seeded.
- [ ] Code-match proposals reviewed by Gareth.
- [x] Migration `0090` applied (Brad, 2026-11-17).
- [x] Scans of the 11 cars loaded into `model_part_scans` and priced (visible repairs only).
- [ ] Checked in a browser on the live site.

## Open questions for Brad

1. **Brake fluid and other consumables:** the default "Best, dearest" picks the biggest bottle when NAPA lists one product in several sizes. Pick per part type, or prefer the smallest container?
2. ~~Discovery~~: run on 11 cars, see above.
