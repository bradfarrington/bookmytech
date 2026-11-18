# Task 80: Wait for NAPA, warm it early, and buy fluids by the litre

**Status:** ✅ Complete (2026-11-18), except the brake disc bolt (see 1). NAPA lookups no longer time out. A car's parts are priced as soon as its reg is looked up. A repair button only ever shows a price or "Get a quote". Coolant and brake fluid are bought by the litres the car holds. No migration. No API shape change.

Brad's follow-ups to Task 79, 2026-11-18.

## 1. Pads and Discs combined repairs (LP17BJY): price the pads and discs

They went to a quote only because the disc jobs also list part type 54, "Bolt, brake disc" (the disc retaining screw), which NAPA doesn't sell. The fix is to stop charging part type 54. Its job's pads and discs then price as one combined repair, as they already sum (`foldLevelParts`).

**Not done: needs Brad or Gareth.** Writing `part_group_settings` (54, charged = false) was blocked by the session's permission check, because it changes every customer's price. Do it on any vehicle's Parts panel: a disc repair → "Bolt, brake disc" → switch off "Charge customers".

## 2. Never time out, never save a timed-out answer

Brad: "we should never save timed answers and should never timeout cause this can cause false results and false prices."

- `AAG_CUSTOMER_TIMEOUT_MS` (was 4 s) and the client's `REQUEST_TIMEOUT_MS` (was 12 s) are now **60 s**. That is a ceiling for a dead connection only, not a time limit. A connection still silent after a minute counts as NAPA not answering: never saved, never priced from, asked again next time (Task 79's fix).
- The level's 4.5 s budget (`LEVEL_PARTS_BUDGET_MS`) is **gone**. A level waits for every answer. The website's `partsWait` plumbing from Task 79 is removed with it.
- Applies to the website, the funnel's price step and the app's `/repairs/tree?parts=1` and `/repairs/search?parts=1`. The app waits for prices, so it no longer gets "+ parts" from a timeout.

## 3. Start NAPA when the car is identified

`lib/parts/warm-parts.ts` `warmVehicleParts`: the car's whole HaynesPro tree (getFullTree + getRepairtimeNodesV4, memoised), less Gareth's hides, Common jobs first. Every part type is asked through the customers' price cache, ten at a time, skipping fresh answers. It runs in `after()` from `lookupVehicleAction(reg, { warmParts: true })`. Only the reg box, the vehicle step and the app's `/vehicle/lookup` pass `warmParts`. The garage list, reminders and the HaynesPro resolver look regs up without it. A car warmed in the last 10 minutes (on that server) is skipped.

`loadAagPartOffers` shares a lookup already on its way to NAPA (`sharedFetch`), so a list opened mid-warm waits for the same answer instead of asking twice.

Measured live: DN23HFL, 133 part types in 56 s. Its starter motor list then priced in 0.45 s and its timing list in 1.6 s.

## 4. Buttons only show a price

Brad: "the buttons should only ever show the price and never the words pricing or + parts."

- While the website's list streams its prices in, a row with parts shows a blank placeholder where its button goes (`aria-label` "Getting the price for …"). There is no text and no labour-only price.
- A row with parts and no price, and no flag saying why, gets **Get a quote**, never "£100 + parts". The search box now passes `quoteHref` too.
- Measured on a dev server: FN60KYP's timing list, warm, swaps placeholders for prices after about 0.8 s. KR65MHX, unwarmed, after about 4 s.

## 5. Coolant and brake fluid by what the car holds

Brad: "shouldn't this calculate the amount of litres needed and then choose the bottle that's needed for the engine?"

- `lib/haynespro/fluid-capacity.ts` reads HaynesPro's "Cooling system" and "Brake system" capacities (the largest when they vary). It never takes an EV's motor or battery cooling.
- `fluidKind` (quote-parts.ts): "Antifreeze", "Coolant", "Brake fluid" part types. Not coolant pumps, sensors, hoses or tanks.
- `fluidPick` (repair-part-choice.ts): enough bottles of one size to cover the need, the cheapest within the best rating offered, never a drum. Antifreeze is taken as **concentrate mixed 50/50** unless NAPA calls it ready-mixed ("RTU", "ready to use", "premix"). A top-up still charges a full fill (Brad, Task 73). An admin's chosen bottle is bought in the number the car needs.
- No capacity from HaynesPro (LP17BJY has none) → Task 79's pack rule (biggest pack up to 5 L, 1 L for brake fluid).
- Live: FN60KYP holds 5.5 L, so 2.75 L of concentrate: 3 × 1 L, £19.80 (was £6.60).
- The admin Parts panel picks the same bottles (`RepairPartGroupView.fluid`).

**For Brad/Gareth:** the 50/50 mix is an assumption. Say if mechanics use ready-mixed or a different ratio.

## Acceptance criteria

- [ ] Pads and Discs combined repairs price on pads and discs. Needs part type 54 switched off (1)
- [x] No short timeouts; a timed-out lookup is never saved or priced from
- [x] A car's parts are asked of NAPA when its reg is looked up, on the website and in the app
- [x] Buttons show a price or "Get a quote", never "Pricing" or "+ parts" (website)
- [x] Coolant and brake fluid bought by the litres HaynesPro says the car holds
- [x] Tests: `fluid-capacity.test.ts`, `part-quantities.test.ts`. 873 pass; `next build` passes; checked live on FN60KYP, LP17BJY, DN23HFL, KR65MHX
