# Task 34 — A follow-on quote becomes a return visit

**Status:** ✅ Complete (2026-09-08) — on branch `task-34-follow-on-quotes` (stacked on 30–33). **No new migration** — it uses `job_quotes.follow_on_booking_id` and `bookings.source_quote_id` from `0062`. `tsc` clean, 310 unit tests (4 new), lint clean, production build compiles. **Not exercised in a browser** — `0062` has to be applied first; the manual script is under "How to verify". Deviations from the plan: none.

## Why this exists

The second half of Gareth's "automatic quote tool for mechanics to quote customers for
additional work **or follow-on quotes**". Task 33 shipped the quote itself and the `now` kind
(extra work on the current visit, paid with a second hold). A `follow_on` quote is for work
that can't be done today — the customer approves it and books a return visit, and the
mechanic who quoted gets first refusal on the job.

Nothing about it takes money at approval time: it is a normal booking, priced from the quote
instead of from the HaynesPro catalogue, and it goes through the ordinary funnel from the slot
step onwards — same pre-auth hold, same account credit, same dispatch, same confirmation.

## What shipped

### Pricing a quote as a booking — `lib/quotes/follow-on.ts` (pure, tested)

`buildFollowOnQuote(quote)` turns a `follow_on` quote into the **same `RepairsQuote` shape**
the funnel already prices HaynesPro jobs into, so `prepareCheckoutFor` and `createBooking`
need to know nothing about quotes beyond where the price came from:

- **The figures are the quote's own snapshot** — `labourPence`, `partsPence`, the hourly rate
  and the commission rate the customer saw and approved. Never re-derived from today's rate,
  so a platform price change between the quote and the booking doesn't move the price.
- A **labour** line becomes a job line, keeping its HaynesPro `node_id` when the book time
  filled the hours in (else `q:<line id>`); an **other** line rides as a fixed-price line; a
  **part** line is not a repair line at all — it becomes a `booking_parts` row.
- `billedHours` from the labour hours (1-hour minimum), and `visitHours` at least 1 so a
  parts-only quote still blocks out a sensible slot.
- `followOnRefusal(quote)` is the one gate: wrong kind, already booked, closed, or expired.

`lib/quotes/book-follow-on.ts` `quoteFollowOn(quoteId, caller, db)` adds the ownership half:
it loads the quote, proves the caller owns **the job it was raised on** (`ownsBooking`), and
returns the priced quote plus that job's vehicle and mechanic.

### The funnel — one branch, at the top

`lib/bookings/create-booking.ts` gained `resolveBookingQuote(input, customerId)`: **where a
booking's price comes from**, the catalogue or a follow-on quote. Both `prepareCheckoutFor`
and `createBooking` call it, so the hold and the row cannot disagree. `CreateBookingInput` and
`PrepareCheckoutInput` gain `quoteId?`; it is signed-in only.

With a quote, `createBooking` also:

- takes the **vehicle** (reg, make, model) and the **preferred mechanic** from the job the
  quote was raised on — never from the request;
- writes `bookings.source_quote_id`;
- writes the quote's part lines to **`booking_parts`** (`sourcing: 'self'` — the mechanic
  supplies them). **The first rows that table has had since Task 17**, which makes the
  mechanic's existing Parts card and its payout recompute live;
- marks the quote `approved` with `follow_on_booking_id`, and writes a `quote_approved` event
  on the **original** job naming the new booking.

Dispatch needs no change: `preferred_mechanic_id` already offers the job exclusively to that
mechanic first (`lib/dispatch/dispatch.ts`), falling through to a broadcast if they aren't
available.

### Customer — `/book/slot?quote=<id>`

The slot page takes `quote`: signed-in only (`/login?next=` otherwise), it prices through
`quoteFollowOn`, derives reg / make / model / postcode / preferred mechanic from the original
job, titles the step "Pick a time for your return visit", and its Back goes to the quote.
Everything after that is the existing picker — address, window (or several all-day days),
credit, the pre-auth hold, 3-D Secure. `SlotPicker` gained a `quoteId` prop that rides in the
sessionStorage draft and the 3DS `return_url` (`returnParams` collapses to `?quote=`), and
is threaded into `prepareCheckout` and `createBookingAction`.

Task 33's approval page already sent a `follow_on` approve here; the quote stays `sent` until
the booking is actually made, so abandoning the funnel doesn't consume it.

### Mobile — additive on two existing endpoints

`POST /checkout/prepare` and `POST /bookings` accept `quoteId`; with it, `vehicleReg`,
`vehicleMake` and the repair ids may be omitted and the vehicle validation is skipped. Response
shapes are unchanged.

## How to verify

1. With `0062` applied: as a mechanic on an `in_progress` (or `completed`) job, Add labour or
   parts → kind **Book a return visit** → one labour line found through the book-time search
   plus one catalogue part → Send.
2. As the customer: quote banner → `/dashboard/quotes/<id>` → **Approve and pick a date** →
   lands on `/book/slot?quote=<id>`, headed "Pick a time for your return visit", priced at the
   quote's total, the vehicle from the original job, Back → the quote.
3. Pick a slot and pay with the test card. The new booking:
   `source_quote_id` = the quote, `total_pence` = the quote's total, `parts_price_pence` = its
   parts, `preferred_mechanic_id` = the quoting mechanic; `booking_repairs` has the labour
   line (its HaynesPro node id where there was one); **`booking_parts` has the part**, self-sourced.
4. The quote is now `approved` with `follow_on_booking_id`; the **original** job's timeline has
   `quote_approved` naming the new booking.
5. Dispatch offers the new job to the quoting mechanic exclusively first; their job page shows
   the part with the "I'll source it / Order via BMT" toggle.
6. Refusals: open the same `?quote=` URL again → bounced to the quote with "You've already
   booked this return visit."; a second customer's session → "This isn't your quote."; an
   expired quote → the expiry sentence.
7. Regression: an ordinary booking (no `quote=`) prices and books exactly as before.
8. Mobile: `POST /checkout/prepare` with only `{ postcode, quoteId }` → a hold for the quote's
   total; `POST /bookings` with `quoteId` and no vehicle fields → the booking above.

## Acceptance criteria

- [x] A `follow_on` quote can be booked as a return visit from the customer's approval page
- [x] It is priced at exactly the figures the customer approved, not today's rate
- [x] The vehicle and the quoting mechanic come from the original job, not the request
- [x] Labour lines become `booking_repairs`; part lines become `booking_parts` (self-sourced)
- [x] The quoting mechanic is offered the new job first
- [x] The quote is consumed only when the booking is made; double-booking is refused
- [x] Mobile: `quoteId` on `/checkout/prepare` and `/bookings`, additive
- [x] Unit tests for the pricing and the refusals
- [ ] Exercised end-to-end in a browser — script above

## Follow-ups

- **Parts are self-sourced.** The "Order via BMT" toggle exists on the mechanic's job page and
  will re-price their payout, but nothing orders anything — that waits on the parts API.
- A quote whose HaynesPro job has since been hidden for that vehicle still books: the price is
  the quote's, deliberately. Worth revisiting if the catalogue changes materially.
- The customer can't yet see follow-on quotes for jobs that have finished from anywhere but the
  emailed link and the past-jobs card's booking; a "Quotes" list on the dashboard would fix it.

## Mobile app (per AGENTS.md)

1. **No migration** (uses `0062`'s columns). No `npm run db:types` beyond Task 33's.
2. `POST /api/mobile/v1/checkout/prepare` and `POST /api/mobile/v1/bookings` accept optional
   **`quoteId`** (uuid). With it, omit `vehicleReg` / `vehicleMake` / `repairNodeId(s)` — the
   server takes them from the quote's own job. Everything else (slot, address, parking, credit,
   `stripePaymentIntentId`, `paymentMode`) is unchanged.
3. Flow: `POST …/quotes/:id/respond { decision: "approve" }` on a `follow_on` returns
   `{ ok: true, outcome: "book", quoteId }` → open the app's slot screen → `prepare` with
   `quoteId` → PaymentSheet → `POST /bookings` with `quoteId`.
4. The new booking's `repair_node_id` may be `q:<uuid>` (a quote line with no HaynesPro job) —
   ids stay opaque, and "Book again" should be hidden for one, as for `p:` products.
5. `bookings.source_quote_id` is populated on such a booking; `booking_parts` rows now exist
   and are readable under the customer policy.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
