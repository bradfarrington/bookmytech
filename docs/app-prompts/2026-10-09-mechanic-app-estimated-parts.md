# Mechanic app: flag estimated part prices on a job (backend Task 72)

The backend (`bookmytech`, Task 72) now prices a repair's parts even when our parts supplier doesn't list a part for the car, which is common on new models. That part's price is an **estimate** from other cars of the same make and model (any year), with a margin on top. The mechanic needs to see which part lines are estimates, because there's no exact part number to buy: they buy a suitable part. If it costs more than the estimate, they send the customer a quote for the difference using the existing extra-cost quote flow. If it costs less, they keep the difference. No change to how sourcing or payouts work.

## What changed

1. **Migration `0087`** adds **`booking_parts.price_estimated boolean not null default false`**. The app already reads `booking_parts` directly under RLS.
   - **Wait for Brad to confirm `0087` is applied, then run `npm run db:types`.**
   - Until it's applied the column doesn't exist. Don't name `price_estimated` in a `.select(...)` list before then, or the whole read fails. `select("*")` is safe either way. Treat a missing or undefined value as `false`.
2. **An estimated line** is a catalogue line (`source = 'catalogue'`) with `price_estimated = true`, and `supplier`, `supplier_part_number` and `brand` all null. `part_name` is the part group, e.g. "Brake disc (front)".

## What to build

1. **Job parts list:** under a line with `price_estimated = true`, show this instead of the "Priced as …" / part-number text:
   > Estimated price: buy a suitable part. If it costs more, send the customer a quote for the difference.

   If the quote flow is reachable from the job screen, make that sentence (or a small button next to it) open it.
2. Leave sourcing ("I'll source it" / "Order via BMT"), status and money unchanged for these lines.

## Copy rules (owner's instruction)

- Never mention AAG, Alliance Automotive, "supplier", or that a price couldn't be found on estimated lines. Use the wording above, which matches the website.

## Nothing else

No API route or response shape changed for the mechanic app.
