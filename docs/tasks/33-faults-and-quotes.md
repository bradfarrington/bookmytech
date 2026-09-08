# Task 33 — Faults on the job; mechanic quotes for extra labour and parts, customer-approved and paid

**Status:** ✅ Complete (2026-09-08) — on branch `task-33-faults-and-quotes` (stacked on 30–32). **Migration `0062` must be applied** (three new tables, `bookings.source_quote_id`, seven new `booking_events` types, `job_quotes` on Realtime). `tsc` clean, 306 unit tests (8 new), lint unchanged from baseline, production build compiles. **Not exercised in a browser or against Stripe** — the tables don't exist until `0062` is applied; the manual script is under "How to verify". Deviations from the plan: none; the follow-on kind is stored here and completed in Task 34.

## Why this exists

Three of Gareth's twelve items (2026-09-08):

- "On the mechanic's dashboard I want to allow mechanics to adjust the labour and parts if
  need be, with a button to add labour and parts."
- "A box where mechanics can add faults if they encounter more issues on the job."
- "An automatic quote tool for mechanics to quote customers for additional work or follow-on
  quotes, to make more money for the mechanics."

Nothing could change a price after booking — not the mechanic, not the admin (refund excepted)
— and the customer T&Cs already required it: *"Additional work must not be carried out until
customer approval has been obtained through Book My Tech"* (`app/(customer)/terms/content.ts`,
"Customer Approval of Additional Work"; the mechanic agreement says the same). This task is
the software behind that clause.

## The money rules

- **An increase needs the customer's approval and an authorised payment before the work.** The
  approval page shows every line and the total above the Approve button; the mechanic's screen
  says "Don't start until it shows Approved".
- **A reduction needs no approval** — the customer already authorised more than they'll pay.
  It is applied at once and realised at completion by capturing less than was held.
- **Same take rate**, split fee / payout exactly like the base booking, using the **booking's
  snapshotted `commission_rate`** (a Pro-tier mechanic keeps theirs). Labour is priced at the
  platform hourly rate at the time of the quote, snapshotted on it.
- **Booking figures move in place.** On approval `total_pence`, `base_price_pence`,
  `parts_price_pence`, `platform_fee_pence` and `mechanic_payout_pence` are incremented (a
  reduction decrements). The mobile app shows `total_pence` as "what you pay", and after
  approving a quote the true figure IS the new one; the quote rows and a `quote_approved`
  event (before / after) are the audit trail. `service_duration_hours` is untouched.
- **Stripe: one new manual-capture PaymentIntent per approved quote.** A manual-capture hold
  can only capture up to what was authorised; incremental authorisation has to be requested
  when the intent is created and depends on the card network, so the base hold can't grow.
  The base booking has no saved payment method (`setup_future_usage` was never set), so the
  approval page collects the card again (Payment Element on web, PaymentSheet in the app).
  Follow-up, not here: save the card at booking so later quotes can be authorised off-session.

## What shipped

### Schema — `0062_faults_and_quotes.sql`

- **`booking_faults`** — `description` (1–500), `severity` (`advisory` | `urgent`), `quote_id`
  (set when a quote line was raised for it).
- **`job_quotes`** — `kind` (`now` = this visit, `follow_on` = a return visit [Task 34],
  `reduction` = negative total, born approved), `status` (`draft` | `sent` | `approved` |
  `declined` | `withdrawn` | `expired`), `title`, `note`, the snapshot (`hourly_rate_pence`,
  `commission_rate`, `labour_pence`, `parts_pence`, `total_pence`, `platform_fee_pence`,
  `mechanic_payout_pence`), `stripe_payment_intent_id` / `stripe_charge_id` / `captured_at`,
  `sent_at` / `responded_at` / `expires_at`, `follow_on_booking_id`. CHECK: reductions are
  exactly the negative-total rows.
- **`job_quote_lines`** — `kind` (`labour` | `part` | `other`), `description`, `hours`,
  `quantity`, `unit_pence`, `line_pence`, `node_id` (the HaynesPro job whose book time filled
  the hours), `part_id`, `fault_id`.
- `bookings.source_quote_id` (for Task 34). RLS: SELECT for the booking's customer (id or guest
  email), the mechanic, admins; no write policies. `job_quotes` published over Realtime.
- `booking_events` CHECK gains `fault_added`, `quote_sent`, `quote_approved`, `quote_declined`,
  `quote_withdrawn`, `quote_expired`, `price_reduced`; `payment_captured` is reused with
  `payload.quote_id` for a quote's capture.

### Pure logic (tested)

- `lib/quotes/pricing.ts` — `priceQuoteLines` (labour = hours × rate; part / other = qty ×
  unit; validation with customer-readable sentences; a £5,000 sanity ceiling), `priceReduction`
  (negative, same split, clamped to what the base hold can still cover), `splitCommission`.
- `lib/quotes/status.ts` — `QUOTABLE_STATUSES` (`now` and `reduction`: `in_progress`;
  `follow_on`: `in_progress` or `completed`), 7-day expiry, `isQuoteExpired`, `respondRefusal`.
- `lib/earnings.ts` `allocateTransfers` — one payout drawn from several charges, each capped
  at its capture (a Stripe transfer sourced from a charge can't exceed it).

### Core — `lib/quotes/`

- `load.ts` — `loadQuotesForBooking` / `loadQuote` / `loadFaultsForBooking` into plain views;
  `quoteMoney` (approved-now total, reductions, the one pending quote).
- `mechanic.ts` (mechanic actions only): `addFault` / `deleteFault`; `createQuote` (prices and
  sends in one go; catalogue parts take the BMT price and name — `supplier_cost_pence` never
  leaves the admin; one open `now` quote per booking at a time; links faults; event; email +
  SMS + push to the customer); `withdrawQuote` (releases a started hold); `reduceJobPrice`
  (born approved, booking figures decremented at once, customer emailed + texted);
  `searchJobRepairTimes` — **the "automatic" part**: `searchRepairCatalogue` on the job's own
  reg, so picking a job fills the hours in from HaynesPro's book time; `listQuoteParts`.
- `customer.ts` (shared by web and mobile, caller as parameter): `listQuotesFor`,
  `getQuoteFor`, `respondToQuoteFor` (decline → mechanic told; approve `now` → a PaymentIntent
  for the quote's total with `metadata { customer_id, booking_id, quote_id }`, reused if one
  was started; approve `follow_on` → `{ outcome: "book" }`), `confirmQuotePaymentFor`
  (re-reads the intent from Stripe; requires its metadata to name this quote and this caller,
  `requires_capture`, the exact amount; then approves, increments the booking, event, mechanic
  told; idempotent).
- `expire.ts` + `/api/cron/expire-quotes` (hourly at :30 in `vercel.json`): lapses `sent`
  quotes past `expires_at`, cancels any started hold, unlinks faults, emails the mechanic.
- `notify.ts` — every email / SMS / push a quote sends.

### `completeAndCharge` (`app/actions/job-progress.ts`)

1. Refused while a `now` quote is still `sent`.
2. Base hold captured for `total − credit − Σ approved-now quotes` (so a reduction captures
   less than was authorised and Stripe releases the rest). Every capture is idempotent (an
   already-captured intent is read back). Then each approved quote's hold is captured in full,
   stamping `stripe_charge_id` / `captured_at` and a `payment_captured` event with `quote_id`.
3. Payout: one `nettedPayout`, then `allocateTransfers` over the captured charges → one Stripe
   transfer per charge (`source_transaction` = that charge, `transfer_group` = the booking),
   one `recordPayout` + `payout_transferred` event each. A shortfall (payout > captured) is a
   system note.
- `refundBooking` refunds across the base and quote intents base-first (`refundAcrossIntents`),
  one `payment_refunded` event per Stripe refund with `payment_intent_id`; a part-way failure
  reports what moved.

### Mechanic — `jobs/[id]/_components/job-extras.tsx` ("Extra work & faults" card)

- **Faults found**: list (Advisory / Urgent, "quoted" once quoted), Add a fault, remove (own,
  unquoted), **Quote this** → opens the builder with a labour line pre-filled for the fault.
- **Quotes & price changes**: every quote with kind, status, lines, total; Withdraw on `sent`;
  "Approved and authorised — go ahead" on an approved `now`; "Don't start this work until it
  shows Approved" on a `sent` one.
- **Add labour or parts** (the builder): kind (Do it today / Book a return visit), title,
  lines — **Add labour** with a "Find the book time" search over this car's tree (picking a
  hit fills description + hours + `node_id`) or typed hours × the platform rate; **Add part**
  with a combobox over the catalogue (picking fills the BMT price) or a typed part and price;
  **Add other**; note; live totals ("Customer pays" / "You receive after 15%") from the same
  pure arithmetic; Send. Disabled with the reason when the status doesn't allow it.
- **Reduce the price**: amount + reason → applied at once.
- Earnings breakdown shows "of which approved extra work" / "after price reductions".

### Customer

- `/dashboard/quotes/[id]` (signed-in; the email link goes via `/login?next=`): mechanic, job
  ref, every line, the total, the note, the authorisation sentence; **Approve and authorise £X**
  → Payment Element (card again) → `confirmQuotePayment` → "Approved. £X is authorised and will
  be charged with the job"; **Decline**. A 3-D Secure detour returns to the page with the
  intent's secret on the URL and finishes the same way. A follow-on approve sends the customer
  to `/book/slot?quote=<id>` (Task 34).
- `components/customer/quote-proposal.tsx` — "Your mechanic has sent a quote for £X — review"
  on the active booking card, every upcoming row and the confirmation page; the dashboard loads
  the one unexpired `sent` quote per booking.
- Email `quote_sent` (lines table + button), SMS `quote_sent`, push; `price_reduced` email + SMS.

### Admin

`/admin/jobs/[id]`: "Faults & quotes" card (kind, status, lines, PI id, captured); the Split
card gains "of which approved extra work" / "after price reductions"; the timeline labels the
seven new events (and `payment_refunded` / `payout_transferred`, which had no label).

### Mobile — three additive routes, all thin wrappers over `lib/quotes/customer.ts`

- `GET /api/mobile/v1/bookings/[id]/quotes` → `{ ok, quotes: QuoteView[] }`.
- `POST …/quotes/[quoteId]/respond` `{ decision }` → `{ ok, outcome: "declined" }` |
  `{ ok, outcome: "pay", clientSecret, paymentIntentId, amountPence }` (confirm with
  PaymentSheet, then …) | `{ ok, outcome: "book", quoteId }` | `{ ok, outcome: "approved" }` |
  `{ ok: false, error }`.
- `POST …/quotes/[quoteId]/confirm` `{ paymentIntentId }` → `{ ok }`.

## How to verify

1. Apply `0062`. As a mechanic on an `in_progress` job: Extra work & faults → Add a fault
   ("Rear pads down to 2 mm", Advisory) → listed; `booking_events` has `fault_added`.
2. Quote this → builder opens with a labour line for the fault → "Find the book time": type
   "rear brake pads" → pick → hours and description fill from HaynesPro; Add part → pick "Rear
   brake pads" from the catalogue → BMT price fills; totals update; Send → toast; quote listed
   as "Waiting for the customer"; the fault reads "quoted"; customer gets email (lines table,
   button), SMS and push; `quote_sent` event.
3. Try "Complete job" → refused: "A quote is still waiting on the customer…".
4. As the customer: dashboard banner → `/dashboard/quotes/<id>` → Decline → mechanic emailed
   + texted; quote "Declined". Mechanic sends again → Approve → card form → `4000 0025 0000
   3155` (3DS) → returns to the page → "Approved"; `job_quotes.status = approved`,
   `stripe_payment_intent_id` at `requires_capture`; `bookings.total_pence` rose by the quote;
   `quote_approved` event with before / after; mechanic emailed + texted; the job page reads
   "Approved and authorised — go ahead".
5. Mechanic: Reduce the price £10 "took less time" → total falls by £10; customer emailed +
   texted; `price_reduced` event.
6. Complete job → Stripe: base intent captured for (authorised − £10), quote intent captured
   in full; two transfers with `transfer_group` = booking id; `mechanic_ledger` one earning,
   two payouts; timeline shows both captures and both transfers.
7. Admin: refund more than the base charge → two refunds, two `payment_refunded` events.
8. Cron: set a `sent` quote's `expires_at` into the past → `curl /api/cron/expire-quotes` →
   `expired`, its intent cancelled, mechanic emailed.
9. Mobile: `GET …/quotes` lists them; `respond` with `approve` → `outcome: "pay"` + a
   `clientSecret`; another customer's token → "This isn't your booking."

## Acceptance criteria

- [x] Mechanic can note faults on an active job; customer and admin see them
- [x] Mechanic can build a quote of labour (book time auto-filled from HaynesPro) and parts (catalogue-priced) and send it
- [x] Customer must see every line and the total before approving; approval authorises a second hold
- [x] Completion refused while a quote is pending; captures base + approved quotes; pays out per charge
- [x] Mechanic can reduce the price without approval; customer told; less captured
- [x] Withdraw, decline, expiry (cron) all release any started hold and tell the other side
- [x] Admin sees faults, quotes and the money split; refunds work across several intents
- [x] Mobile: additive endpoints and tables; app's `total_pence` stays truthful
- [x] Unit tests: pricing, reductions, expiry / refusal, transfer allocation
- [ ] Exercised end-to-end in a browser and against Stripe test mode — script above

## Follow-ups / open questions for Gareth

- **Reductions without approval** — happy for a mechanic to lower the price unilaterally? A cap
  (e.g. not below 50%) is a one-liner in `priceReduction` if wanted.
- **Saved cards**: set `setup_future_usage` at booking so a quote can be authorised without
  re-entering the card. Needs a Stripe Customer per profile and consent copy — its own task.
- **Parts on quotes are self-sourced** (the mechanic supplies them); the "Order via BMT" toggle
  on `booking_parts` doesn't apply to quote parts yet.
- The quote email links to the web approval page; the app gets the same via push → booking
  screen → its own approval UI (endpoints above).

## Mobile app (per AGENTS.md)

1. **Migration `0062`** → `npm run db:types`. New customer-readable tables `job_quotes`,
   `job_quote_lines`, `booking_faults`; `job_quotes` is on Realtime (subscribe on the booking
   screen the way `booking_events` is). `bookings.source_quote_id` is new (null until Task 34).
2. **Show faults** on the booking screen; show a **"Quote waiting" card** when a `job_quotes`
   row has `status = 'sent'` (unexpired), leading to an approval screen: list the lines and
   the total, then Approve / Decline via the endpoints above. Approve → `outcome: "pay"` →
   PaymentSheet with the `clientSecret` (manual capture, like the booking) → `confirm`.
3. **`bookings.total_pence` may rise (approved quote) or fall (reduction) while `in_progress`.**
   Not a reschedule; treat the Realtime UPDATE as a display refresh.
4. New `booking_events.event_type` values (`fault_added`, `quote_*`, `price_reduced`) — keep a
   fallback label for unknown types.
5. Push "Your mechanic has sent a quote" deep-links on `bookingId` only.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
