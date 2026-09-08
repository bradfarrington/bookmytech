# Task 32 — Service checklists and pre-purchase inspection reports

**Status:** ✅ Complete (2026-09-08) — on branch `task-32-checklists` (stacked on Tasks 30–31). **Migration `0061` must be applied after `0060`** (new `checklists`, `checklist_items`, `booking_checklist_results`; `catalogue_products.checklist_id` / `checklist_tier`; the seed). `tsc` clean, 298 unit tests (7 new), lint unchanged from baseline (the one error, a pre-existing `Date.now()` in `past-jobs.tsx`'s dispute-window check, predates this task), production build compiles. **Not exercised in a browser** — the tables don't exist until `0061` is applied; the manual script is under "How to verify". Deviations from the plan: none.

## Why this exists

Two of the twelve items in Gareth's change list (2026-09-08):

- "Pre-purchase inspections … want a drop-down box to select (good, fair, poor, na) — please
  refer to the other file for instruction on what to put in the drop-down boxes." His sheet
  has ~170 items in 10 sections with Bronze / Silver / Gold columns and grades them **Pass /
  Advisory / Fail / Not Checked**.
- "Service — I will supply a checklist for each service, and if we can have a checkbox with
  checked and n/a and a box so mechanics can leave comments about each thing that was
  checked." He supplied Interim (46), Full (56) and Major (66).

Nothing like it existed: completion wrote only `status` + `completed_at`, and the five-step
in-progress checklist from the original brief was deferred in Task 06. On an inspection the
report **is** the product the customer paid for.

## Owner decisions

- **Mileage is required** before a servicing / inspection job can complete (Brad, 2026-09-08 —
  Task 30 shipped the field; this task makes it mandatory where a service record needs it).
- **The inspection's grading scale is the sheet's** (Pass / Advisory / Fail / Not Checked), not
  the email's (good / fair / poor / na). Flagged to Gareth in the HANDOFF questions.

## What shipped

### Schema — `0061_checklists.sql`

- **`checklists`** (`key` unique, `name`, `kind` = `service` | `inspection`) — the kind decides
  the answer scale.
- **`checklist_items`** (`checklist_id`, `section`, `label`, `position`, `tiers text[]` null =
  every tier else the Bronze/Silver/Gold subset, `is_active` — soft removal so old reports keep
  their items). Unique on (checklist, section, label).
- **`booking_checklist_results`** — one row per (booking, item): `result` (`checked` / `na` on a
  service; `pass` / `advisory` / `fail` / `not_checked` on an inspection), `comment`, `updated_by`.
- **`catalogue_products.checklist_id` + `checklist_tier`** — a product carries a checklist; the
  seeded services and Bronze / Silver / Gold inspections are linked by name.
- **RLS**: `checklists` + `checklist_items` readable by any signed-in user (catalogue data, no
  PII); results readable by the booking's customer (id or guest email — the `0055` policy body),
  the assigned mechanic, and admins. No write policies: the mechanic's action writes through
  the service-role client.
- **Seed — generated from Gareth's documents** (`docs/checklists/`, generator in
  `scripts/generate-checklist-seed.mjs`) and matching his counts exactly: Interim 46 / Full 56 /
  Major 66 items (one section each — his lists count their headings as checks, so every line is
  an item); the inspection 173 items in 10 sections, **Bronze 64 · Silver 116 · Gold 173** — the
  same numbers as his price row. Spelling fixed ("Replaceoil", "tire", "windshield"), wording his.

### Logic — `lib/checklists/checklists.ts` (pure, tested) + `load.ts`

- `checklistsForBooking(productIds, links)` — one checklist per product that has one; the same
  checklist twice collapses to the higher tier. `itemsForTier` (active + tier filter, in order),
  `groupBySection`, `checklistProgress` (answered / unanswered / pass / advisory / fail / …),
  `unfinishedMessage` ("Finish the Gold inspection first — 3 items still need an answer."),
  `isValidResult` per kind, `resultLabel`.
- `loadBookingChecklists(db, bookingId, productIds)` — three reads (product links, checklists +
  items, this booking's results) into `LoadedChecklist[]` with sections and progress. Used by
  the mechanic's panel, the completion gate, the customer's report and the admin card, so the
  four can't disagree. Fails open to none before `0061`.

### Mechanic — `app/actions/job-checklist.ts` + `jobs/[id]/_components/checklist-panel.tsx`

- `saveChecklistResult({ bookingId, itemId, result?, comment? })`: `requireMechanic()` +
  `ownedBooking()` → status must be `in_progress` → the item must belong to one of this
  booking's checklists and the answer to its kind → service-role upsert on (booking, item).
  One tap = one save, so a stale form can't lose the rest.
- The panel sits above Job photos: per checklist a progress bar and "32 of 56 done" (+ advisory
  / fail counts on an inspection); sections as `<details>` (open while unfinished); per item the
  answer chips (Checked / N/A or Pass / Advisory / Fail / Not checked, toned) and an "Add a
  note" textarea that saves on blur. Optimistic with revert + toast on failure. Read-only
  before `in_progress` (with a hint) and after completion. The Mileage card shows "required to
  complete" when a checklist exists.

### Completion gate — `completeAndCharge`

Before anything touches Stripe: every checklist must be fully answered
(`unfinishedMessage`), and `mileage` must be set ("Enter the vehicle's mileage before
completing the job."). The `status_changed` payload gains `checklists: [{ key, tier, answered,
total, advisories, fails }]`.

### Customer — `/dashboard/bookings/[id]/report`

Signed-in (proxy gates `/dashboard/*`; the email link goes via `/login?next=`); ownership proved
the way the dashboard does (`customer_id` or guest email), then read through the service-role
client so the mechanic's job photos (`booking_media` has no customer policy) can be shown.
Header with vehicle, mileage, mechanic and date; on an inspection a Pass / Advisory / Fail /
Not checked strip; every section and item with its result pill and the mechanic's note; the
photos; "Book a repair" when anything is advisory or failed; print / save-as-PDF. `notFound()`
for a booking with no checklist. Past-jobs cards show **View report** (dashboard computes
`hasReport` from the products' `checklist_id`). The `job_complete` email gains a "View your
report" button (`report_url` variable, `report_link` custom block; empty on a plain repair).

### Admin

- `/admin/jobs/[id]` — a card per checklist: answered count, advisory / fail counts, every item
  with its result and note.
- `/admin/services/checklists` (linked from the Services page) — the four lists with item and
  tier counts; `/admin/services/checklists/[id]` — the editor: rename the checklist, rename
  sections and items inline, add items to a section, add a section, move items up / down within
  their section, Bronze / Silver / Gold tier chips on an inspection, switch items off (and back
  on). Actions in `app/actions/checklists.ts`.
- The product form gains a Checklist select and, for the inspection, a Tier select.

## Deploy order

`0060` then `0061`, then the code. Everything reads fail-open (no tables → no checklists, no
gate, no report), and the only unconditional column reference is the product form's
`checklist_id` / `checklist_tier` write, which is admin-only.

## How to verify

1. Apply `0061`. `/admin/services/checklists` → four lists: "Interim service checklist · 46
   items", "Full … 56", "Major … 66", "Pre-purchase inspection · 173 items in 10 sections ·
   Bronze 64 · Silver 116 · Gold 173". Open the inspection: sections, tier chips; rename an
   item, add one, move it, switch one off → the list count drops by one.
2. `/admin/services` → edit "Gold pre-purchase inspection": Checklist = Pre-purchase
   inspection, Tier = Gold (seeded). Edit "Full service" (activate it): Checklist = Full service
   checklist.
3. As a customer, book a Gold inspection (test card). As the mechanic: accept → the job page
   shows the Checklist card read-only with the hint; on the way → begin work → chips enabled;
   answer some, leave three, add a note → "Complete job" → refused with "Finish the Pre-purchase
   inspection · Gold first — 3 items still need an answer."; answer the rest, leave mileage
   blank → refused with the mileage sentence; enter mileage → completes and charges.
4. `booking_events.status_changed` payload has `checklists: [{ key: "pre_purchase_inspection",
   tier: "gold", answered: 173, total: 173, … }]` and `mileage`.
5. Customer: the receipt email has "View your report"; the dashboard's past-jobs card has
   "View report"; `/dashboard/bookings/<id>/report` renders the header, the four-count strip,
   ten sections with pills and notes, the photos, and "Book a repair" if anything failed. Another
   customer's session → 404. Print preview is clean.
6. Book a Bronze inspection → the mechanic sees 64 items, not 173.
7. `/admin/jobs/<id>` shows the checklist card with the answers.
8. Regression: a plain repair has no checklist card, no gate, no report link; a service with
   `checklist_id` null completes as before.

## Acceptance criteria

- [x] The three service checklists and the inspection seeded from Gareth's documents, counts matching
- [x] Mechanic answers Checked / N/A (+ comment) on a service, Pass / Advisory / Fail / Not checked on an inspection
- [x] Bronze / Silver / Gold show only their items
- [x] Completion refused until every item is answered and the mileage is recorded
- [x] Customer can see the finished report (web page + email button); admin sees it on the job
- [x] Admin can edit checklists and link products to them
- [x] Unit tests for the pure logic
- [ ] Exercised end-to-end in a browser once `0061` is applied — script above

## Follow-ups / open questions for Gareth

- Confirm the inspection scale (Pass / Advisory / Fail / Not Checked) and whether the service
  lists want sections (the editor can do it).
- Should a failed / advisory item feed straight into a quote (Task 33 — "Quote this" from the
  report)? Natural next step.
- A PDF attachment on the receipt email (today: a link to the web report, printable).

## Mobile app (per AGENTS.md)

1. **Migration `0061`** → `npm run db:types`.
2. New customer-readable tables under RLS: `booking_checklist_results` (own bookings),
   `checklist_items`, `checklists` (any signed-in user). The app can render the report itself by
   nesting them, or link to the web report at `/dashboard/bookings/{id}/report` (signed-in).
   No endpoint was added; say if one is wanted.
3. `catalogue_products` gains `checklist_id` / `checklist_tier` (admin-only; the app never
   reads it).
4. `booking_events.status_changed` payloads on completion may carry `checklists[]`.
5. No request / response shape changed.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
