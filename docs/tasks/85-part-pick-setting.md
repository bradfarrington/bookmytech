# Task 85: Choose how the default NAPA part is picked

**Status:** ✅ Complete (2026-11-24). Three settings under Admin → Pricing → "Choosing parts": stock, rating, price. Unset, they keep today's rule (Best, dearest, stock ignored), so no price changes until Gareth picks. No migration (three `platform_settings` rows), no API shape change.

Gareth, via Brad (2026-11-24): he wants "the cheapest parts quoted that are in stock". Brad: a setting in the admin area where he chooses the price option, the rating, and in stock or out of stock. Gareth chooses the combination.

## Decisions (Brad, 2026-11-24)

- **In stock** = NAPA has some anywhere it reports: Tamworth branch, Birmingham, Sheffield or Rotherham warehouses (next / 2 working days). `totalQty > 0`. No stock figures counts as out of stock.
- **Never rule a part out.** With nothing in stock, or nothing at the rating, the rest is still priced, so a customer never loses a price (and never gets "Get a quote") because of the setting.
- **Gareth picks the combination**; no rating is forced.

## What shipped

- **`lib/parts/supplier-offer.ts`:** `PartPickRule { price: cheapest|dearest, rating: any|best|better|good, stock: in_stock|any }`, `DEFAULT_PART_PICK_RULE` (dearest · best · any: the 2026-09-15 rule), `inStock`, `ratingDistance`, `compareStockAndRating`, `compareOffers`. `defaultOffer(offers, rule)` takes the part the rule prefers: **stock first, then rating, then price**, NAPA's order breaking a tie. Rating: the one wanted, else the nearest above, then the nearest below, unrated last (so "Best" is exactly today's "highest offered").
- **`lib/parts/part-pick-rule.ts`:** keys `parts_pick_price`, `parts_pick_rating`, `parts_pick_stock` (string values), `parsePartPickRule`, `loadPartPickRule` (never throws; falls back to today's rule), option labels, `describePartPickRule`.
- **`lib/parts/repair-part-choice.ts`:** `selectJobParts`, `selectRepairPart`, `sensiblePacks` and `fluidPick` take the rule (optional, defaulting to today's). Fluids follow stock and rating but **always buy the cheapest bottles that cover the need**, whatever the price setting ("dearest" would buy five 1 L bottles for 5 L). Unsized brake fluid likewise: cheapest of the bottles the rule prefers.
- **`lib/parts/quote-parts.ts`:** `quoteJobParts` loads the rule beside the markup and passes it to every `priceJobParts` call, so it reaches every customer price: repair list and search, price step, booking, the apps' quote and checkout, services with NAPA parts, a mechanic's suggested extra parts.
- **Admin → Pricing → "Choosing parts":** three Selects (Stock / Rating / Price), each saved on change via `updatePartPickRule` (validated, audited, applies to new quotes).
- **Admin vehicle → Parts panel:** loads the rule (`RepairPartGroupView.rule`, additive), the default pill reads it ("Default: Cheapest · Any rating · In stock"), the "Change" list is sorted in pick order, and each part shows "In stock" / "Out of stock".
- Unchanged: an admin's choice for an engine variant, and a model's picked part, still win. Suspension, sides, axles and pack-size rules apply as before. Bookings keep the parts they were priced with.

## Impact on real data (470 cached NAPA answers, 2026-11-24)

Today's rule picks an out-of-stock part for 140 of 470 part types. With **Cheapest · Any rating · In stock**, the default changes on 287 of them, by about £15 cheaper on average per part (cost, before markup); 94 still use an out-of-stock part because NAPA has none in stock. With **Cheapest · Best · In stock**, 206 change.

Stock is as of NAPA's cached answer (up to 12 hours old, `AAG_PRICE_FRESH_MS`).

## Acceptance criteria

- [x] Admin setting for price (cheapest / dearest), rating (any / best / better / good) and stock (in stock / in stock or not)
- [x] Applied to every customer price that uses NAPA's default part, and to the admin Parts panel
- [x] Falls back rather than leaving a part unpriced
- [x] Unset = today's behaviour (existing tests unchanged)
- [x] Tests: `supplier-offer.test.ts`, `part-quantities.test.ts`, `part-pick-rule.test.ts`. 912 pass; `tsc` clean

## Mobile apps

Nothing to do: no endpoint, response shape or schema change. Displayed part prices change once Gareth sets the rule, through the same quote endpoints the apps already call.
