# Task 37 — The mechanic revises the job on site; ends it if the customer refuses

**Status:** ✅ Code-complete (2026-09-09) — on branch `task-37-revise-job` (stacked on `gareth-change-list-30-36`). **Migration `0064` must be applied** (`job_revisions`, one `platform_settings` seed, five new `booking_events` types, `job_revisions` on Realtime). `tsc` clean, 332 unit tests (14 new), eslint clean on every touched file, production build compiles. **Not exercised in a browser or against Stripe** — the table doesn't exist until `0064` is applied; the manual script is under "How to verify". Deviations from the plan: none.

## Why this exists

Gareth's item 9 — *"allow mechanics to adjust the labour and parts if need be with a button to add labour and parts"* — was built in Task 33 as an *additive* quote plus a unilateral "reduce the price" button, and the reduction was removed on 2026-09-08 because nobody had asked for it. On 2026-09-09 Brad clarified what Gareth meant:

> Mechanic gets to site, realises it's the wrong repair booked. Gives the option to proceed with the new work whether it's an increased or decreased amount. If the customer refuses, the mechanic chooses to charge either the cancellation fee or a diagnostic (set by you). If that price is lower than what is currently charged, the remainder goes back to the customer.

So the price can fall — but only as the arithmetic result of the customer approving a *different job*, never as a discount. This task is that.

## The money rules (owner decisions, 2026-09-09)

- **Every revision needs the customer's approval, cheaper or dearer.** The *work* changed, not just the price; one rule, one screen. The only difference between the two directions is whether a card is collected.
- **Dearer:** a second manual-capture hold **for the difference only** — Task 33's mechanism exactly. The revision's `hold_quote_id` points at a `job_quotes` row (kind `now`) carrying the difference, born `draft`, flipped to `approved` with the customer's card.
- **Cheaper or the same:** no new hold. The base hold captures the lower figure at completion and Stripe releases the rest.
- **On approval the booking IS the revised job**: lines, parts, description, duration, oil and the five money figures are replaced with the `after` snapshot (plus any approved Task 33 extra work already on top). `completeAndCharge`'s arithmetic is untouched: the base hold captures `total − Σ approved quotes = before`. No negative rows anywhere.
- **Declined:** the mechanic ends the job charging the **on-site diagnostic fee** (admin-set, seeded £59.99), the **en-route cancellation fee** (£50 default), or **nothing**. Captured from the base hold, the rest released; **paid out to the mechanic minus commission** like any charge. The booking becomes `cancelled` — no new status for the app — and the `cancelled` event carries the outcome.
- **One approved revision per booking.** A second rewrite on top of an authorised difference has no safe capture arithmetic (a later decrease below the held difference would over-charge), and in practice means "complete it and send a follow-on quote" — which is what the message says.
- **Pre-existing gap fixed on the way:** the customer-cancellation fee was captured and **never paid out**, although the policy page has always said it covers the mechanic's travel. `cancelBookingFor` now pays it out minus commission through the same code as the on-site fee and a completed job.

## What shipped

### Schema — `0064_job_revisions.sql`
- **`job_revisions`** — `status` (`sent` | `approved` | `declined` | `withdrawn` | `expired`), `reason` (why the booked repair isn't right — the customer reads it), `note`, `before` / `after` jsonb snapshots (`lib/revisions/snapshot.ts`: lines, parts, description, duration, oil, rate, commission and the five money figures), `after_repair_ids`, `before_total_pence`, `after_total_pence`, `difference_pence` (CHECK `= after − before`), `hold_quote_id` (CHECK: set exactly when the difference is positive on a `sent` row), `sent_at` / `responded_at` / `expires_at`. RLS: SELECT for the booking's customer, the mechanic, admins; no write policies. Published over Realtime.
- `platform_settings.on_site_diagnostic_fee_pence = 5999`.
- `booking_events` CHECK gains `revision_sent`, `revision_approved`, `revision_declined`, `revision_withdrawn`, `revision_expired`. Ending the job reuses `cancelled` (payload `cancelled_by: 'mechanic'`, `outcome: 'customer_declined_revision'`, `revision_id`, `fee_kind`, `fee_pence`) and `payment_captured` (`kind: 'on_site_diagnostic' | 'on_site_cancellation'`).

### Pure logic (tested — `lib/revisions/diff.test.ts`)
- `snapshot.ts` — `snapshotFromBooking` (the job as booked, from the row + `booking_repairs` + `booking_parts`, with approved extra work subtracted), `snapshotFromQuote` (from a fresh `RepairsQuote` plus the parts; parts priced qty × unit on top of the quote's own parts line, commission split on the whole, BMT-sourced parts off the payout — the rule in `booking-parts.ts`), `approvedExtras`, `repairIdsFromLines`, `parseSnapshot`.
- `diff.ts` — `diffRevision` (added / removed / kept lines and parts, signed difference, direction, duration change), the customer and mechanic sentences, `packDiff` for the email, `followOnLinesFromRevision` (Task 38).
- `fees.ts` — `onSiteFeeOptions`, `onSiteFeeFor`, `feePayout` (`splitCommission`).
- `status.ts` — `REVISABLE_STATUSES = ['in_progress']`, 24-hour expiry, `revisionRefusal`.

### Core — `lib/revisions/`
- `mechanic.ts` — `previewRevision` / `sendRevision`: ownership, `in_progress` only, `quoteRepairs(reg, ids, admin, { hourlyRatePence, commissionRate })` at the **booking's snapshotted** rate and commission (an additive override on `quoteRepairs`, Task 37 — a platform rate change since booking must not reprice the job), catalogue parts at BMT price, typed parts as given; refuses when nothing changed, when a revision or a `now` quote is already `sent`, or when a revision is already `approved`. `withdrawRevision`; `withdrawHoldQuote`. **`endJobOnSite`** — requires a declined / expired revision; captures the fee with `amount_to_capture` (idempotent read-back), releases the rest, withdraws any draft hold, booking → `cancelled`, events, payout, customer told. `searchJobCatalogue` — every bookable hit for this car (plain jobs, combined-repair options, products).
- `customer.ts` (web + mobile, caller as parameter) — `listRevisionsFor`, `getRevisionFor`, `respondToRevisionFor` (decline → mechanic told; approve with `difference ≤ 0` → `applyRevision` at once; approve with `difference > 0` → a PaymentIntent for the difference on the hold quote, `metadata { customer_id, booking_id, quote_id, revision_id }`, reused if started), `confirmRevisionPaymentFor` (re-reads the intent: metadata names this revision and this caller, `requires_capture`, the exact difference → hold quote `approved` → `applyRevision`; idempotent).
- `apply.ts` — **`applyRevision`**, the one place an approved revision is written: replaces `booking_repairs` (one line → no rows, the `repairLinesFor` invariant), reconciles `booking_parts` (kept rows keep sourcing and status), updates the booking's description, `combine_source`, `service_duration_hours`, `vehicle_raw_duration_hours`, `engine_oil_*` and the five money columns to `after` + approved extras; `revision_approved` event with before / after / added / removed; mechanic told.
- `expire.ts` — `expireStaleRevisions`, run by the existing hourly `/api/cron/expire-quotes`.
- `lib/payments/payout.ts` — **`payoutToMechanic`**, extracted from `completeAndCharge` (which now calls it): gross earning → netted against debt → one transfer per captured charge (`source_transaction`) → ledger + events. Shared by the completed-job payout, the on-site fee and the customer-cancellation fee.
- `completeAndCharge` refuses while a revision is `sent`; `createQuote` refuses a `now` quote while one is `sent`.

### Mechanic — `jobs/[id]/_components/revise-job.tsx` ("Change what's being done", above Extra work & faults)
- One line of distinction: *Booked the wrong repair? Change the job here. Found extra work on top? Use Extra work & faults below.*
- The job sheet: one chip per chosen catalogue item (a combined repair once) with Remove; **Add a repair** searches this car's catalogue; parts on the booking with Remove; **Add a part** from the catalogue (BMT price filled in) or typed; **Why the booked repair isn't right** (the customer reads it); note. Debounced server preview: was / customer pays (signed difference) / you receive / visit length; the direction sentence. **Send to customer** — only when the preview matches the current inputs and something changed.
- *Sent* → summary + "Waiting for the customer — don't start the revised work until it shows Approved" + Withdraw. *Approved* → "Revised · was £X, now £Y" (the job sheet above is the new one; once per booking). *Declined / expired* → **the end-the-job panel**: three radio options priced live (on-site diagnostic / cancellation fee / no charge), a note, "Charge £X and end the job" with a confirm, "Send a different revision", and the reminder that carrying on with the original job needs no action.
- Actions `app/actions/job-revisions.ts`.

### Customer
- `/dashboard/revisions/[id]` (signed-in): what the mechanic found, then **No longer needed** (struck) / **Instead** (highlighted) / **Still on the job**, oil line, was → new total with the signed difference, the direction sentence, **Approve** / **Decline**, and the fee warning. A dearer job collects the card for the difference.
- `components/customer/hold-payment.tsx` — the Payment Element + 3-D Secure resume, **extracted from the quote approval page** and used by both, so there is one card-collection implementation.
- `components/customer/revision-proposal.tsx` banner on the active card, upcoming rows and `/book/confirmed/[id]`.
- Actions `app/actions/customer-revisions.ts`.

### Notifications
Emails: `revision_sent` (customer; `revision_diff` custom renderer), `revision_approved_mechanic`, `revision_declined_mechanic`, `revision_expired_mechanic`, `job_ended_on_site` (customer). SMS: `revision_sent`, `job_ended_on_site`, `mech_revision_approved`, `mech_revision_declined`. Push on send.

### Admin
- `/admin/pricing` → "On-site diagnostic" row; `cancelFeeTiers` returns it as `diagnostic`.
- `/admin/jobs/[id]` → "Revised job" card (status, was → now, reason, the diff); the timeline labels the five events.
- **Legal copy, read live:** the T&Cs cancellation table gains the on-site row; `/cancellation-policy` gains "If the booked repair isn't what your car needs".

### Mobile — three additive routes, thin wrappers over `lib/revisions/customer.ts`
- `GET /api/mobile/v1/bookings/[id]/revisions` → `{ ok, revisions: RevisionView[] }`.
- `POST …/revisions/[revisionId]/respond` `{ decision }` → `{ ok, outcome: "declined" }` | `{ ok, outcome: "pay", clientSecret, paymentIntentId, amountPence }` (the difference; PaymentSheet, then …) | `{ ok, outcome: "approved" }` | `{ ok: false, error }`.
- `POST …/revisions/[revisionId]/confirm` `{ paymentIntentId }` → `{ ok }`.

## How to verify (after `0064`)

1. Mechanic on an `in_progress` job booked as "Front brake pads" with a pads part: **Change what's being done** → remove the pads chip and the part → search "wheel bearing" → add → Add a part "Wheel bearing kit" £45 → reason → preview shows was £X, customer pays £Y (+£Z) → Send. `job_revisions` row `sent` with `hold_quote_id`; a `job_quotes` row `draft` for £Z; `revision_sent` event; customer emailed (diff table), texted, pushed.
2. Customer: dashboard banner → `/dashboard/revisions/<id>` → Approve → card (3DS test card `4000 0025 0000 3155`) → "Approved". Booking: `repair_node_id` = the bearing, `booking_repairs` replaced, `booking_parts` = the kit, `total_pence` = £Y, hold quote `approved` at `requires_capture`; `revision_approved` event; mechanic emailed + texted; the job page reads "Revised · was £X, now £Y".
3. Complete → Stripe: base captured for £X, hold quote for £Z; two transfers; ledger one earning, two payouts.
4. Same with a cheaper swap → no card step; `total_pence` falls; complete → base captured for the lower figure, the rest released.
5. Decline → mechanic panel → "Charge the on-site diagnostic (£59.99)" → confirm → Stripe captured £59.99, rest released; booking `cancelled`; `cancelled` event with `outcome`; `payment_captured` `kind: on_site_diagnostic`; ledger earning + payout of £59.99 minus commission; customer emailed the reason and fee.
6. Try "Complete job" while a revision is `sent` → refused. Try "Add labour or parts" → refused. Cron: `expires_at` in the past → `expired`, hold withdrawn, mechanic emailed.
7. Customer cancels a job en route → fee captured **and** paid out to the mechanic (`payout_transferred` event, ledger rows).
8. Mobile: `GET …/revisions`; `respond` approve → `outcome: "pay"` + `clientSecret`; another customer's token → "This isn't your booking."

## Acceptance criteria

- [x] Mechanic can rewrite the job sheet — repairs from this car's catalogue, parts kept / added / removed — and see the customer's price before sending
- [x] Every revision needs the customer's approval; a dearer one collects the card for the difference only, a cheaper one applies with no card
- [x] On approval the booking IS the revised job, and completion captures the right figures with no change to its arithmetic
- [x] After a decline the mechanic can end the job charging the on-site diagnostic, the cancellation fee, or nothing; the fee is paid out minus commission
- [x] The customer-cancellation fee is now paid out to the mechanic (pre-existing gap)
- [x] Withdraw, decline, expiry (cron) all release any started hold and tell the other side
- [x] Admin sees revisions, the fee outcome, and edits the diagnostic fee; the Terms and the policy page show it live
- [x] Mobile: additive endpoints and table; the app's `total_pence` stays truthful
- [x] Unit tests: snapshots, diff, invariant, fees, expiry
- [ ] Exercised end-to-end in a browser and against Stripe test mode — script above

## Follow-ups / open questions for Gareth

- The on-site diagnostic fee is seeded at **£59.99**; change it on `/admin/pricing`.
- Is a paid on-site diagnostic credited if the customer later books the revised work as a follow-on? Plan: **no** (same open item as Task 31's FAQ promise).
- Revising a job before arrival (`confirmed` / `en_route`) — plan: **`in_progress` only**; extend if he wants it.
- The ended booking's parts stay as they were booked (nothing was fitted); nothing to reconcile.

## Mobile app (per AGENTS.md)

1. **Migration `0064`** → `npm run db:types`. New customer-readable table `job_revisions` (on Realtime — subscribe on the booking screen like `job_quotes`).
2. **Show a "Revised job" card** when a row has `status = 'sent'` (unexpired): what the mechanic found (`reason`), then `before` vs `after` — removed lines struck, added highlighted — the new total and the signed `difference_pence`; Approve / Decline via the endpoints above. Approve → `outcome: "pay"` → PaymentSheet for the **difference** → `confirm`; or `outcome: "approved"` at once.
3. **On approval the booking row changes in place:** `repair_node_id`, `repair_description`, `service_duration_hours`, `engine_oil_*`, and `total_pence` — which can now go **down** as well as up while `in_progress`. `booking_repairs` and `booking_parts` rows are replaced. Not a reschedule; treat the Realtime UPDATE as a display refresh.
4. New `booking_events.event_type` values (`revision_*`) — keep a fallback label. A `cancelled` event may now carry `outcome: 'customer_declined_revision'`, `fee_kind` and `fee_pence`; `payment_captured.kind` gains `on_site_diagnostic` / `on_site_cancellation`.
5. Push "Your mechanic has revised the job" deep-links on `bookingId`.

## When complete

Update `docs/HANDOFF.md`, `docs/02-data-model.md`, the mobile brief; commit.
