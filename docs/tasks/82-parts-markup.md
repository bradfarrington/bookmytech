# Task 82: A parts markup switch under Pricing

**Status:** ✅ Complete (2026-11-18). Off by default, so no price changes until Gareth switches it on. No migration (two `platform_settings` rows), no API shape change.

Gareth, via Brad: "a global switch in his settings maybe with labour prices which will be on or off for parts markup with then a percentage which will markup the parts for the total price of the repair."

## What shipped

- **Admin → Pricing → Labour rate & commission:** "Mark up parts" (a switch) and "Parts markup" (a percentage, 0–100%). Saved through `updatePlatformSetting` as `parts_markup_enabled` (1/0) and `parts_markup_rate` (decimal), and audited like the other settings.
- **`lib/parts/parts-markup.ts`:** `quoteJobParts` marks up the part lines NAPA priced when the switch is on: NAPA's answer for the car, or an admin's pick priced live by NAPA. Brad: "markup will only be on napa parts". Estimates from other cars and admin set prices are charged as they are. Each unit is rounded to the penny, then multiplied by the quantity. The cost stays on the line (`QuotedPart.costUnitPence`, `markupRate`, additive). Engine oil (priced per litre) isn't a part and isn't marked up.
- **Where it shows:** everywhere parts reach a price goes through `quoteJobParts`: repair list and search totals, the price step, the booking and its `booking_parts` rows, the app's quote and checkout, and a mechanic's suggested extra parts. The admin vehicle Parts panel still shows NAPA's trade cost and says the markup is added.
- **Who gets the markup:** it is part of the booking total, so the commission and the mechanic's share split it as they split everything (`lib/earnings.ts`: commission on the whole total). Brad, 2026-11-18: "keep the calculation as it is".
- A booking keeps the parts prices it was made with; switching the markup on or off changes new quotes only.

Also: NAPA's ISE0047 ("unable to create quote") is now a one-line warning, not `console.error`. It is NAPA's normal answer for some part types (injectors, every car), it is handled, and it was opening Next's error overlay in development.

## Acceptance criteria

- [x] On/off switch and percentage beside the labour rate
- [x] Every part in a repair's price marked up when on; unchanged when off
- [x] Tests: `parts-markup.test.ts`. 891 pass; `next build` passes; checked live that prices are unchanged with it off
