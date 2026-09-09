# Book My Tech — Manual Test Guide: Gareth's changes (Tasks 30–38)

A plain-English walkthrough of everything built for Gareth's 2026-09-08 change list, on the
**website** (customer), the **mechanic console** and the **admin console**. The mobile app has
its own brief (`docs/mobile-app-brief-2026-09-08.md`) and is tested by the app project.

Same format as `manual-test-guide.md`:

> **Do this** → **Expect this**

Work top to bottom — the sections build on each other (a revision needs a job in progress,
a follow-on quote needs a completed one). Tick each box. If something doesn't match, note the
section number and move on; **don't work around it** — a mismatch is a bug to report.

---

## 0. Before you start (do all of this or nothing below works)

- [ ] **Apply migrations `0059` → `0064` in order** in the Supabase SQL editor (one at a time,
      each is idempotent so a re-run is safe): `0059_booking_mileage`, `0060_catalogue_products`,
      `0061_checklists`, `0062_faults_and_quotes`, `0063_promo_codes`, `0064_job_revisions`.
      → Each finishes without error. Nothing in this guide works before this step; several
      pages will 500 or show empty cards.
- [ ] Run the app on the branch `gareth-change-list-30-36`: `npm run dev`.
- [ ] `.env.local` has **Stripe test-mode keys** (`sk_test_…`), the **HaynesPro** credentials
      (the catalogue, search, book times and engine-oil capacity all need them), and Resend /
      SMS keys — or set `TEST_OUTBOX_DIR=/tmp/bmt-outbox` to capture every email, SMS and push as
      JSON files instead of sending them. **That is the easiest way to check "the customer was
      told".** `ls -t /tmp/bmt-outbox | head` after each step.
- [ ] Cards: `4242 4242 4242 4242` (no challenge) and `4000 0025 0000 3155` (3-D Secure
      challenge — use this at least once on every card step below). Any future expiry, any CVC.
- [ ] Three logins: a **customer** (signed in — quotes and revisions can't be approved from a
      guest link), a **mechanic** who is approved, **online**, and has **finished Stripe
      Connect onboarding** (otherwise payouts are logged as failed notes rather than
      transferred), and an **admin**.
- [ ] A registration that resolves in HaynesPro (any mainstream car). Note its **engine-oil
      capacity** from the mechanic's Technical data tab later — you'll compare it in §2.
- [ ] Open the **Stripe dashboard (test mode)** → Payments, and the **Supabase table editor**
      in other tabs. Several checks below read them directly.

**Where things are:** customer site `/`, dashboard `/dashboard`; mechanic console
`/mechanic`; admin console `/admin`. The hourly cron that lapses quotes and revisions is
`GET /api/cron/expire-quotes` — curl it with `Authorization: Bearer $CRON_SECRET` (or no
header when `CRON_SECRET` is unset locally).

---

## 1. Task 30 — mileage box and the customer search bar

### 1.1 Search bar (customer)
- [ ] `/book/repairs?reg=<your reg>` → a search box sits **above the breadcrumbs**.
- [ ] Type `br` → nothing happens (too short). Type `brake pads` → after a moment, priced rows
      appear with the same Add / Book buttons as browsing. Titles that came from a **group**
      show a single breadcrumb.
- [ ] A long query like `won't start` → the **Diagnostics** product appears among the hits
      (that proves search covers products, §2).
- [ ] Clear the box → the browse list comes back exactly as before.
- [ ] Hammer the box with 20 different queries quickly → at some point a polite rate-limit
      sentence, not a crash (it shares the mobile API's HaynesPro-spend buckets).

### 1.2 Mileage (mechanic → admin → email)
- [ ] As the mechanic, open any accepted job → the **Vehicle** card has a **Mileage** row with
      an input and Save. Enter `62410` → Save → it persists on refresh. Enter `-5` or `2000000`
      → refused with a sentence.
- [ ] Admin `/admin/jobs/<id>` → "Mileage · 62,410 miles (recorded by the mechanic)".
- [ ] After the job completes (§3), the **receipt email** carries "Mileage recorded: 62,410
      miles"; the completion event in the timeline carries it too.
- [ ] After completion the field is read-only text.

---

## 2. Task 31 — four categories, fixed-price products, engine oil

### 2.1 Admin sees the seeds
- [ ] `/admin/services` → grouped by category: **Diagnostics** ×3 at £59.99, **Pre-purchase
      inspection** Bronze £72.99 / Silver £92.99 / Gold £139.99, and **Servicing** Interim /
      Full / Major **switched off** with placeholder prices. (Gareth hasn't given service prices
      yet — leave them off unless you're testing §2.4.)
- [ ] Reorder arrows and the active toggle work; New / Edit forms use the custom Select for
      category and "Fixed price / By the hour"; the Switch for "includes engine oil".
- [ ] `/admin/pricing` → an **Engine oil** section: £15.00 per litre and a default quantity of
      5 L.

### 2.2 The new top level (customer)
- [ ] `/book/repairs?reg=…` → **four cards**: Repairs / Diagnostics / Servicing / Pre-purchase
      inspection, each with a one-line blurb. (Servicing is **missing** while its products are
      off — that is correct, not a bug.) The stepper's second step reads "What you need".
- [ ] **Repairs** → HaynesPro's usual root groups, breadcrumb root reads "Start".
- [ ] **Diagnostics** → three rows at **£59.99**, captioned "Fixed price · about 1 hour".
- [ ] **Pre-purchase inspection** → Bronze / Silver / Gold at the seeded prices with their
      durations.

### 2.3 Book a diagnostic alone — the 1-hour minimum must NOT apply
- [ ] Book **Plug-in diagnostic** on its own → `/book/match` price hero shows **£59.99** with
      a "Fixed price" caption, **not** 1 h × £60. Complete checkout with `4242…`.
- [ ] Supabase `bookings`: `repair_node_id = 'p:<uuid>'`, `total_pence = 5999`,
      `service_duration_hours = 1`; **no `booking_repairs` rows** (single item).
- [ ] Mechanic offer and job page, and admin job page, all show the product name with a
      "Fixed price" caption.

### 2.4 Servicing with engine oil (switch a service on for this test only)
- [ ] `/admin/services` → edit **Full service**: set a price (e.g. £149), keep "includes
      engine oil" on, switch it **active**.
- [ ] `/book/repairs?reg=…` → **Servicing** card appears → Full service row reads
      *"Includes engine oil · X L × £15"* where **X is the car's HaynesPro sump capacity**
      (compare with the Technical data tab; e.g. a Golf ≈ 4.3 L). On an **EV** there is no oil
      line at all.
- [ ] Add **Full service + front brake pads** together → price hero: labour on the pads' book
      time, the fixed service price, an **oil row** under labour, one total. Book it.
- [ ] Supabase: `parts_price_pence` = the oil charge; `engine_oil_litres`,
      `engine_oil_price_per_litre_pence = 1500`, `engine_oil_source = 'haynespro'`; two
      `booking_repairs` rows, one with `kind = 'product'`.
- [ ] Admin job page Split card: "of which parts" shows the oil; commission is on the whole
      total (Brad: "charge the commission").
- [ ] Switch Full service **off** again when done, unless Gareth's prices are in.

### 2.5 Copy
- [ ] Home page "what we fix" preview leads with Diagnostics / Servicing / Pre-purchase
      inspection; the FAQ and `/help` say **£59.99** for a diagnostic and no longer promise it
      is "refunded against the work" (nothing implements that; flagged for Gareth).

---

## 3. Task 32 — service checklists and inspection reports

### 3.1 Admin editor
- [ ] `/admin/services/checklists` → four lists: **Interim 46 / Full 56 / Major 66** items;
      **Pre-purchase inspection 173** items in 10 sections with Bronze / Silver / Gold chips
      (Bronze 64 · Silver 116 · Gold 173).
- [ ] Open one → rename, add an item, add a section, reorder, tier chips (inspection only),
      soft-remove and restore all work. The product form links a product to a list + tier.

### 3.2 Mechanic fills it in (needs a booked inspection or service)
- [ ] Book a **Gold inspection** as the customer; accept as the mechanic; open the job →
      a **Checklist** card previews every Gold item, read-only, before work starts.
- [ ] Start journey → I've arrived → the chips become live: **Pass / Advisory / Fail / Not
      checked** on an inspection (Checked / N/A on a service), each with an "Add a note"
      that saves on blur. Answers survive a refresh. The header counts "N of 173 done".
- [ ] A **Bronze** booking shows **only Bronze items** (64).

### 3.3 Completion gates
- [ ] Leave 3 items unanswered → **Complete job** → refused: "Finish the checklist first — 3
      items still need an answer."
- [ ] Answer them but leave **mileage blank** → refused: "Enter the vehicle's mileage before
      completing the job."
- [ ] Enter mileage → complete → charges as normal (§7 for what that looks like now).

### 3.4 Customer report
- [ ] Customer `/dashboard` → the completed card has **View report** → a page with product,
      vehicle + reg, mileage, date, mechanic, a Pass / Advisory / Fail strip, every section with
      result pills and notes, the job photos, a **Book the advisories** button into
      `/book/repairs?reg=…`, and a print button.
- [ ] Another customer's account on that URL → **404**.
- [ ] The receipt email has a **View your report** button.
- [ ] Admin job page → a **Checklist** card with the answers.

---

## 4. Task 33 — faults, and quotes for extra work on this visit

Start with a job **in progress** (any plain repair, booked with `4242…`).

### 4.1 Faults (mechanic)
- [ ] Job page → **Extra work & faults** → Add a fault: "Rear pads down to 2 mm", Advisory →
      listed with an Advisory tag; `booking_events` has `fault_added`.
- [ ] Remove it (own, unquoted) → gone. Add it again for the next step.

### 4.2 Build and send a quote
- [ ] **Quote this** on the fault → the builder opens with a labour line already carrying the
      fault. **Find the book time**: type `rear brake pads` → pick → **hours and description
      fill from HaynesPro**. Add part → pick **Rear brake pads** from the catalogue → BMT price
      fills; totals update live ("Customer pays" / "You receive after 15%").
- [ ] Send → toast; the quote lists as **Waiting for the customer**; the fault reads
      "quoted"; **customer email (lines table + button), SMS and push** in the outbox;
      `quote_sent` event.
- [ ] Try **Complete job** now → refused: "A quote is still waiting on the customer…".
- [ ] Try to send a **second** `now` quote → refused until the first is withdrawn.

### 4.3 Customer declines, then approves
- [ ] Customer `/dashboard` → blue **"Your mechanic has sent a quote for £X — Review"** banner
      on the active card → `/dashboard/quotes/<id>` shows **every line and the total above the
      buttons** (a T&Cs requirement). **Decline** → mechanic emailed + texted; quote reads
      Declined.
- [ ] Mechanic sends it again → customer **Approve** → the card form appears → use
      **`4000 0025 0000 3155`** → complete the challenge → back on the page → "Approved. £X is
      authorised…".
- [ ] Stripe: a **second PaymentIntent** at `requires_capture` for the quote's total.
      Supabase: `job_quotes.status = 'approved'`, `bookings.total_pence` **rose** by the quote;
      `quote_approved` event with before/after. Mechanic emailed + texted; the job page reads
      "Approved and authorised — go ahead".

### 4.4 Complete → two captures, two transfers
- [ ] Complete the job → Stripe: the **base intent captured**, the **quote intent captured
      in full**, **two transfers** to the mechanic each sourced from its charge, both with
      `transfer_group` = the booking id. Supabase `mechanic_ledger`: one earning, two payouts.
      Timeline: two `payment_captured` (one with `quote_id`), two `payout_transferred`.
- [ ] Receipt email lists "Additional work approved: £X".

### 4.5 Refund across intents (admin)
- [ ] `/admin/jobs/<id>` → refund **more than the base charge** → **two Stripe refunds**
      (base first, then the quote's), two `payment_refunded` events.

### 4.6 Expiry (cron)
- [ ] Send a fresh `now` quote on another in-progress job; in Supabase set its `expires_at`
      to yesterday; `curl /api/cron/expire-quotes` → `status = 'expired'`, any started intent
      **cancelled** in Stripe, mechanic emailed, `quote_expired` event.

---

## 5. Task 34 — a follow-on quote becomes a return visit

- [ ] On a **completed** job, mechanic → Add labour or parts → kind **Book a return visit** →
      one tree job (search fills the book time) + one catalogue part → Send. Customer emailed.
- [ ] Customer → quote page → **Approve and pick a date** → lands on `/book/slot?quote=<id>`:
      the price hero shows the **quote's** figures (not a catalogue reprice), the same
      mechanic is noted as preferred. Pick a slot, pay with `4242…`.
- [ ] Supabase: new booking with `source_quote_id`, `preferred_mechanic_id` = the quoting
      mechanic, `booking_repairs` for the labour line(s) (`node_id` may be `q:<uuid>` if no
      HaynesPro job backed it), and **`booking_parts` rows for the part** (first time that
      table has had rows). The original quote → `approved` with `follow_on_booking_id`.
- [ ] Dispatch offers the job to **that mechanic first**; their job page shows the part with
      the sourcing toggle. "Book again" on the customer's card is **hidden** for a `q:` id.
- [ ] Guests: the quote link goes via `/login?next=…`.

---

## 6. Task 35 — discount codes

### 6.1 Admin
- [ ] `/admin/discounts` (sidebar → Commercial → Discounts) → **New**: `WELCOME10`, 10%,
      max 2 redemptions, 1 per customer → saved, listed with 0/2.
- [ ] Open it → **Send to customers**: search picks 3 customers, tick SMS, preview → **Send
      to 3 customers** → 3 emails (+3 SMS) in the outbox, 3 rows in `promo_code_sends`, the
      list shows the sent count.
- [ ] `/admin/customers/<id>` → **Send a discount** (pick a code) and **Grant credit** (£5 +
      note) → ledger row with source `promo`.

### 6.2 Checkout
- [ ] Customer at `/book/slot` → **Have a discount code?** → `WELCOME10` → Apply → summary
      shows "Discount (WELCOME10) −£X"; the **hold is total − discount**. A wrong code shows a
      sentence next to the field, not an error page. Signed out → "Sign in to use a discount
      code."
- [ ] Abandon at the card step → `promo_redemptions` row `released` within the hour (or on
      leaving). Complete the booking → `redeemed` with `booking_id`; `bookings.discount_pence`
      and `promo_code` set; **`total_pence` is still the pre-discount figure**.
- [ ] Same customer again → "You've already used that code." A third customer after two
      redemptions → "…has been used up."
- [ ] Complete the job → Stripe capture = total − discount; **mechanic payout unchanged**
      (BMT-funded); admin refund capped at the charge. Receipt email shows the discount line.

---

## 7. Task 36 — the signature is gone

- [ ] Mechanic on an `in_progress` job → **Complete job & charge customer** → a confirm panel
      naming the amount ("Charge £114 to the customer's card and mark this job complete?") →
      **Confirm & charge** → "Job complete — payment captured." **No signature pad**, no
      second button, no "Use saved signature".
- [ ] `booking_events` completion row payload: `mechanic_confirmed: true`, `charge_pence`,
      `mileage`, and `checklists[]` on a service/inspection.
- [ ] No "Customer sign-off" card on the job page. Customer tracker while in progress: "We'll
      email your receipt as soon as it's done"; price page and confirmation email say payment
      is captured when the mechanic completes the job; the mechanic's earnings note reads
      "Paid out after you complete the job".
- [ ] The §3.3 checklist and mileage gates **still hold** — only the signature gate went.

---

## 8. Task 37 — the mechanic revises the job on site

This is the one Gareth described. Do the three paths in order: dearer, cheaper, declined.

### 8.1 Setup
- [ ] `/admin/pricing` → Cancellation fees now has **On-site diagnostic** at £59.99. Change it
      to £49.99 and back — the change shows on `/terms` (cancellation table, new row) and
      `/cancellation-policy` ("If the booked repair isn't what your car needs") **live**.
- [ ] Book **Front brake pads** with a pads part on a car (`4242…`); accept, start journey,
      arrive → `in_progress`.

### 8.2 Dearer revision (card for the difference)
- [ ] Mechanic job page → **Change what's being done** card (above Extra work & faults) with
      the one-line distinction. Open it → the job sheet: one chip per booked item, the parts
      on the booking, each with Remove.
- [ ] Remove the pads chip and the pads part → search **"wheel bearing"** → add a hit → **Add
      a part** "Wheel bearing kit" £45 → the preview re-prices after a moment: **Was £X ·
      Customer pays £Y (+£Z)** · You receive · "Customer pays £Z more — they'll authorise it on
      their card…". Visit length line if it changed.
- [ ] Send is disabled until a **reason** is typed. Type "The pads are fine — the noise is a
      worn front wheel bearing." → **Send to customer** → panel shows **Waiting for the
      customer** with a Withdraw link.
- [ ] Supabase: `job_revisions` row `sent` with `hold_quote_id`; a `job_quotes` row
      **`draft`** titled "Revised job — difference" for £Z; `revision_sent` event. Outbox:
      customer email with the **No longer needed / Instead** table, SMS, push.
- [ ] Try **Complete job** → refused ("The revised job is still waiting…"). Try **Add labour
      or parts** → refused. Try a second revision → refused.
- [ ] Customer `/dashboard` → **amber** "Your mechanic has revised the job — £Y (+£Z)" banner
      → `/dashboard/revisions/<id>`: the reason in amber, **No longer needed** (struck) /
      **Instead** (highlighted), was → new total with **+£Z**, the direction sentence, the fee
      warning under the buttons.
- [ ] **Approve and authorise £Z** → card form → `4000 0025 0000 3155` → challenge → "Approved.
      £Z is authorised on your card and the new total of £Y is charged when the job is
      complete."
- [ ] Supabase `bookings`: `repair_node_id` = the bearing, `repair_description` changed,
      `total_pence = £Y`, `service_duration_hours` updated; `booking_repairs` replaced (or
      none, if one line); `booking_parts` = the kit only; hold quote `approved` at
      `requires_capture` for **£Z only**; `revision_approved` event with before/after/added/
      removed. Mechanic emailed + texted; job page badge **"Revised · was £X, now £Y"**; the
      job header shows the bearing.
- [ ] **Complete** → Stripe: base captured for **£X**, hold quote captured for **£Z**, two
      transfers. Ledger one earning, two payouts. Receipt email total £Y.

### 8.3 Cheaper revision (no card)
- [ ] New job in progress booked as **pads + discs** (a combined repair) → Change what's being
      done → remove the discs → preview shows **−£** and "Customer pays £N less — the
      difference is released…" → reason → Send.
- [ ] Supabase: `job_revisions` row with **`hold_quote_id` null**, no draft quote.
- [ ] Customer page shows the green **−£N** → **Approve the revised job** → **no card step**
      → "Approved. Only the new total…".
- [ ] Complete → Stripe: base captured for the **lower** figure, the rest **released**.
      Timeline `payment_captured` for the lower amount.

### 8.4 Declined → end the job with a fee
- [ ] New job in progress → send any revision → customer **Decline** → mechanic emailed +
      texted; the mechanic's panel becomes **"The customer declined the revised job"** with
      three radio options priced live: **on-site diagnostic (£59.99)** / **cancellation fee
      (£50)** / **no charge**, a note, "Send a different revision", and the reminder that
      carrying on with the original job needs no action.
- [ ] Pick the diagnostic → **Charge £59.99 and end the job** → confirm dialog → toast.
- [ ] Stripe: base intent **captured for £59.99**, the rest released. Supabase: booking
      `cancelled` with `cancellation_reason` = the revision's reason; `cancelled` event with
      `outcome: customer_declined_revision`, `fee_kind: diagnostic`, `fee_pence: 5999`;
      `payment_captured` `kind: on_site_diagnostic`; `mechanic_ledger` an **earning and a
      payout of £59.99 minus commission**; `payout_transferred` event. Customer email + SMS:
      the reason and the fee line. Admin job page: **Revised job** card with the diff and
      the status; timeline labels the revision events.
- [ ] Repeat with **no charge** on another job → hold cancelled in Stripe, nothing captured,
      no ledger rows, customer told "nothing has been charged".
- [ ] Repeat with **cancellation fee** → £50 captured and paid out the same way.

### 8.5 Withdraw and expiry
- [ ] Send a revision → mechanic **Withdraw** → `withdrawn`, draft hold quote `withdrawn`,
      customer banner gone.
- [ ] Send a revision → set `expires_at` to yesterday → `curl /api/cron/expire-quotes` →
      `expired`, mechanic emailed, the end-the-job panel appears on the mechanic's page.

### 8.6 The cancellation-fee payout fix (pre-existing gap)
- [ ] Customer cancels a job **while the mechanic is en route** → £50 captured (as before) —
      and **now** a `payout_transferred` event and ledger earning + payout for £50 minus
      commission, and a Stripe transfer to the mechanic. (Before this batch the fee was
      captured and never paid out.)

### 8.7 Priced at the booking's snapshot
- [ ] Change the **hourly rate** on `/admin/pricing` (e.g. £60 → £80), then revise a job
      booked at £60 → the preview's hours price at **£60**, not £80. Put the rate back.

---

## 9. Task 38 — running late

### 9.1 Can't finish today
- [ ] Mechanic with a job in progress and **two later confirmed jobs today** → the job page
      shows **"Can't finish today?"** with three steps and two buttons: **Trim today's job**
      (jumps to Change what's being done) and **Move my later jobs (2)**.
- [ ] Trim: revise the job down to what's done (§8.3) → customer approves → **Complete** →
      the job page's Extra work card now shows **"Send a follow-on quote for the rest"** with
      the item count → **Quote the rest of the work** → the builder opens as a **return
      visit**, titled "The rest of the work from your visit", **pre-filled with the removed
      lines at their original hours** (and removed parts at their price) → Send.
- [ ] Customer books it from the quote (§5) → the same mechanic is offered it first. Once a
      follow-on quote exists the offer no longer shows.

### 9.2 Running late?
- [ ] `/mechanic/jobs` → below **Your day**, a collapsed **Running late?** card naming how
      many later jobs today it can move (it is absent when there are none). Open it.
- [ ] **Push everything by 2 h** → every row's new time fills (from the booked start, or from
      now if that has passed, rounded to the quarter hour). Edit one row by hand; untick
      another.
- [ ] **Propose to N customers** → toast; each ticked customer gets the existing
      `mechanic_proposed_time` email/SMS; their dashboard shows the usual reschedule banner.
      One accepts → the slot moves and the window clears; one declines → unchanged; the
      mechanic is emailed each outcome.
- [ ] A row for a job already **en route** → reported as failed by name; the others still
      go through. Flexible (several-days) bookings are not listed.

---

## 10. Regression — the things that must not have changed

- [ ] A plain single-repair booking, start to finish, with no products, quotes or revisions:
      **identical figures** to before (book time × £60, 1-hour minimum once), one capture,
      one transfer.
- [ ] A booking made **before** this batch (no `booking_repairs`, no snapshots) still renders
      on every surface: dashboard card, mechanic offer/job page, admin job page, receipt.
- [ ] Mechanic offer → accept → start journey → arrive → complete, unchanged apart from §7.
- [ ] Customer cancel / reschedule / dispute flows unchanged (apart from §8.6's payout).
- [ ] `/admin/services` no longer 404s (it was free since Task 17); the rest of the admin
      sidebar unchanged.
- [ ] `npm run test` → 332 passing; `npm run build` → compiles.

---

## 11. Stop and report if you see any of these

- A price on the customer's approval page that differs from the mechanic's preview by a penny.
- A revision or quote approving without `confirm` succeeding (a lost confirm must leave it open).
- `total_pence` on a booking that isn't `after + approved extras` after a revision is applied.
- A second transfer to a mechanic that is larger than the charge it is sourced from (Stripe
  will refuse it — look for a "Payout transfer failed" note in the timeline).
- A `job_quotes` row in `draft` that is not the hold of a `sent` revision.
- Any customer-facing sentence that mentions a "reduction" or a "signature".
- The Terms or the policy page showing a fee that disagrees with `/admin/pricing`.

---

## 12. Known placeholders (intentional — don't report as bugs)

- **Interim / Full / Major service** are seeded **inactive** with placeholder prices until
  Gareth supplies them.
- Inspection grades are **Pass / Advisory / Fail / Not checked** (Gareth's sheet), not the
  email's good / fair / poor / N/A — flagged for him.
- The on-site diagnostic fee defaults to **£59.99** and is **not** credited against a later
  follow-on booking.
- A job can be revised **once**; further changes are "complete, then quote the rest".
- Revisions are only offered once the job is **in progress**, not on the phone beforehand.
- The mechanic price-reduction button is gone on purpose and is not coming back.
