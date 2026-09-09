# Mobile app brief — the backend changes of 2026-09-08/09 (Tasks 30–37)

Hand this whole file to a Claude session working in `bmt-customer-app`. It is written to be
pasted as a prompt: it says what changed in the backend, what the app must do, and what it
must not assume.

---

You are working in `bmt-customer-app`, the React Native / Expo customer app for Book My Tech.
Its backend is the separate Next.js repo (`bookmytech`), which has just shipped eight tasks in
one batch. **None of it is deployed yet and none of the migrations are applied** — build
against the contracts below, and expect to test once the backend team says the migrations are
in.

Read the app's own `AGENTS.md` / `CLAUDE.md` first and follow its conventions. Everything below
is additive: a build shipped before this batch keeps working, so nothing here is a forced
migration of existing screens — but several screens will now show a customer something that is
incomplete or slightly wrong if you don't update them.

## Step 0 — regenerate types

Migrations `0059`–`0064` land together. Once the backend confirms they are applied:

```
npm run db:types
```

New columns and tables you will see:

| Table | What's new |
|---|---|
| `bookings` | `mileage`, `engine_oil_litres`, `engine_oil_price_per_litre_pence`, `engine_oil_source`, `discount_pence`, `promo_code`, `source_quote_id` |
| `booking_repairs` | `kind` (`'job'` \| `'product'`) |
| `job_quotes`, `job_quote_lines`, `booking_faults` | new — customer-readable under RLS |
| `job_revisions` | new — customer-readable under RLS (§3b) |
| `checklists`, `checklist_items`, `booking_checklist_results` | new — customer-readable under RLS |
| `catalogue_products`, `promo_codes`, `promo_redemptions`, `promo_code_sends`, the repair-catalogue overlay tables | new but **admin-only** — the app cannot and should not read them |

`job_quotes` and `job_revisions` have been added to the `supabase_realtime` publication
(alongside `bookings`, `booking_events`, `mechanic_locations`, `job_offers`).

---

## 1. The repair catalogue has a new top level — check this first

**This is the one change that can quietly leave your app on the old experience.**

`GET /api/mobile/v1/repairs/tree?reg=…` **with no `node` parameter** used to return HaynesPro's
~43 root groups. It now returns **four** nodes:

```jsonc
{ "ok": true, "vehicle": { … }, "nodes": [
  { "id": "root",           "description": "Repairs",                  "kind": "group", "summary": "Brakes, clutch, suspension and every other repair…" },
  { "id": "c:diagnostics",  "description": "Diagnostics",              "kind": "group", "productCategory": "diagnostics", "summary": "Warning lights, won't start…" },
  { "id": "c:servicing",    "description": "Servicing",                "kind": "group", "productCategory": "servicing",   "summary": "Interim, full and major services…" },
  { "id": "c:inspection",   "description": "Pre-purchase inspection",  "kind": "group", "productCategory": "inspection",  "summary": "Bronze, Silver or Gold check…" }
]}
```

- Drilling into `"root"` gives exactly the old root list, so **an app that treats ids as opaque
  keeps working**.
- **Grep your repairs screen for a hardcoded `node: "root"` / `?node=root` on the first fetch.**
  If the first screen asks for `root` explicitly it will never show the three new categories.
  The fix is to omit `node` on the first call.
- A category with no live products is omitted, so today you may see fewer than four while the
  backend's servicing products are still switched off.

### `CatalogueNode` — new optional fields (additive)

```ts
productId?: string                 // present on a bookable product
productCategory?: "diagnostics" | "servicing" | "inspection"
summary?: string | null            // one line under the name
fixedPrice?: true                  // price is a set figure, not hours × rate
durationHours?: number             // how long the visit is blocked out for
oil?: {                            // servicing only; already inside pricePence
  litres: number; pencePerLitre: number; pence: number;
  source: "haynespro" | "default"; label: string | null;
} | null
```

A product is `kind: "repair"` with a real `pricePence`, so it books through the existing path
with no changes. What to add:

- Render `summary` under a name where present (it is what makes the four cards readable).
- On a product, prefer **"Fixed price · about N hours"** (`fixedPrice` + `durationHours`) over
  "Estimated N hours", which reads oddly for a diagnostic.
- On a servicing product, show the oil line: *"Includes engine oil · 4.3 L × £15.00"*.
- `GET /repairs/search` hits may now include products too.

---

## 2. `POST /quote` — new fields (additive on both shapes)

Both the single (`repairNodeId`) and list (`repairNodeIds`) responses gain:

```jsonc
"oil": { "litres": 4.3, "pencePerLitre": 1500, "pence": 6450, "source": "haynespro", "label": "Engine sump, including filter" } | null,
"products": [ { "id": "p:…", "name": "Full service", "pricePence": 14900, "labourHours": null, "durationHours": 2.5, "category": "servicing" } ],
"labourPence": 6000,
"fixedPence": 14900,
"visitHours": 2.5
```

and each entry of `lines[]` may carry `kind: "product"` and `productId`.

Two things to know:

- **`partsPence` is no longer always 0.** On a servicing product it is the engine-oil charge.
  If you show a "parts" line anywhere, it will start appearing — label it **Engine oil** when
  `oil` is set.
- `nodeId` may be `"p:<uuid>"` (a product) or, on a booking made from a follow-on quote,
  `"q:<uuid>"`. **Ids are opaque.** Do not parse them; do hide "Book again" for a `q:` id,
  because there is no catalogue entry to re-quote from.

Engine oil, for context: a service's price includes oil at £15/litre × the manufacturer's
stated capacity for that exact car, read live from HaynesPro. A pure EV gets no oil line.

---

## 3. Quotes for extra work — the biggest new feature

A mechanic on a job can now note **faults** and send the customer a **quote**, either for extra
work on the current visit or for a return visit. The customer T&Cs require the customer to see
every line and the total and approve it before the work is done — so this needs a real screen,
not a banner.

### Reading

Three new tables are readable under the customer's own RLS (own bookings only):
`booking_faults`, `job_quotes`, `job_quote_lines`. You can nest them on your existing booking
select, or use the endpoint below. `job_quotes` is on Realtime — subscribe on the booking
screen the way you already do for `booking_events`, so a quote arriving refreshes the screen.

`GET /api/mobile/v1/bookings/:id/quotes` → `{ ok: true, quotes: QuoteView[] }`

```ts
interface QuoteView {
  id: string; bookingId: string; mechanicId: string;
  kind: "now" | "follow_on";
  status: "draft" | "sent" | "approved" | "declined" | "withdrawn" | "expired";
  title: string | null; note: string | null;
  hourlyRatePence: number; commissionRate: number;
  labourPence: number; partsPence: number; totalPence: number;
  platformFeePence: number; mechanicPayoutPence: number;
  stripePaymentIntentId: string | null; stripeChargeId: string | null;
  sentAt: string | null; respondedAt: string | null; expiresAt: string | null;
  capturedAt: string | null; followOnBookingId: string | null; createdAt: string;
  lines: Array<{
    id: string; position: number;
    kind: "labour" | "part" | "other";
    description: string; hours: number | null; quantity: number;
    unitPence: number; linePence: number;
    nodeId: string | null; partId: string | null; faultId: string | null;
  }>;
}
```

**The one waiting on the customer is `status === "sent"` and not past `expiresAt`** (7 days).
Every quote raises the price, so `totalPence` is always positive.

### Answering

`POST /api/mobile/v1/bookings/:id/quotes/:quoteId/respond` with `{ "decision": "approve" | "decline" }`:

| Response | Meaning | What the app does |
|---|---|---|
| `{ ok: true, outcome: "declined" }` | Done | Show it, tell them the mechanic was notified |
| `{ ok: true, outcome: "pay", clientSecret, paymentIntentId, amountPence }` | Extra work on this visit | Open PaymentSheet on `clientSecret`, **then** call `confirm` (below) |
| `{ ok: true, outcome: "book", quoteId }` | A return visit | Send them into your booking flow with this `quoteId` (§4) |
| `{ ok: true, outcome: "approved" }` | Already approved | No-op |
| `{ ok: false, error }` | Expired, withdrawn, not theirs… | Show `error` verbatim |

`POST /api/mobile/v1/bookings/:id/quotes/:quoteId/confirm` with `{ "paymentIntentId" }` →
`{ ok: true }` or `{ ok: false, error }`.

**The quote is not approved until `confirm` succeeds.** The backend re-reads the intent from
Stripe and requires its metadata to name this quote and this caller, `requires_capture`, and
the exact amount — so a lost `confirm` call leaves the quote unapproved and the hold
uncaptured. Retry it; it is idempotent.

The hold is a **second manual-capture PaymentIntent**, exactly like the booking's own: nothing
is taken now, and it is captured alongside the base hold when the mechanic completes the job.
The original hold could not simply be increased, which is why a card is collected again.

### The screen

- On a booking, list `booking_faults` ("Advisory" / "Urgent" + the mechanic's description).
- A **"Quote waiting"** card when a `sent` quote exists → a screen showing every line
  (labour with its hours, parts with quantity), the total, the mechanic's note, then
  **Approve** / **Decline**. The line list above the button is a contractual requirement, not
  a nicety.
- Copy for approving `now`: *"Approving authorises £X on your card now — nothing is charged
  until the job is complete, and the work only goes ahead once you've approved."*
- A push arrives as **"Your mechanic has sent a quote"** carrying `bookingId` only, so the
  deep link lands on the booking screen; the quote card takes it from there.

---

## 3b. The mechanic revised the job on site — the second big feature

Distinct from a quote. A mechanic arrives, finds **the repair that was booked isn't what the
car needs**, and proposes a different job — repairs swapped, parts kept, dropped or added —
at its new price, which can be **higher or lower**. The customer must approve it either way
(the work changed, not just the price). If they decline, the mechanic may end the job and
charge an on-site diagnostic fee or the cancellation fee.

### Reading

`job_revisions` is readable under the customer's own RLS and is on Realtime — subscribe on the
booking screen like `job_quotes`.

`GET /api/mobile/v1/bookings/:id/revisions` → `{ ok: true, revisions: RevisionView[] }`

```ts
interface RevisionView {
  id: string; bookingId: string; mechanicId: string;
  status: "sent" | "approved" | "declined" | "withdrawn" | "expired";
  reason: string;            // why the booked repair isn't right — show it prominently
  note: string | null;
  before: JobSheet;          // as booked
  after: JobSheet;           // as revised
  differencePence: number;   // after.totalPence − before.totalPence, SIGNED
  holdQuoteId: string | null;
  sentAt: string | null; respondedAt: string | null; expiresAt: string | null; createdAt: string;
}
interface JobSheet {
  repairIds: string[];
  lines: Array<{ nodeId: string; description: string; rawHours: number; chargedHours: number;
                 linePence: number; kind: "job" | "product"; productId: string | null;
                 itemId: string | null; itemLabel: string | null }>;
  parts: Array<{ id: string | null; partId: string | null; name: string; quantity: number;
                 unitPence: number; linePence: number; sourcing: "self" | "bmt" }>;
  repairDescription: string; serviceDurationHours: number;
  oil: { litres: number; pencePerLitre: number; pence: number } | null;
  totalPence: number; basePricePence: number; partsPricePence: number;
  platformFeePence: number; mechanicPayoutPence: number;
}
```

**The one waiting on the customer is `status === "sent"` and not past `expiresAt`** (24 h).
Render the diff yourself: lines in `before` but not `after` (by `nodeId`) were removed, the
reverse were added; the same for parts (by `id` for existing ones, otherwise treat as added).

### Answering

`POST /api/mobile/v1/bookings/:id/revisions/:revisionId/respond` with `{ "decision": "approve" | "decline" }`:

| Response | Meaning | What the app does |
|---|---|---|
| `{ ok: true, outcome: "declined" }` | Done | Tell them the mechanic was notified and will be in touch about ending the visit |
| `{ ok: true, outcome: "pay", clientSecret, paymentIntentId, amountPence }` | Dearer job | PaymentSheet on `clientSecret` for **`amountPence` = the difference only**, then `confirm` |
| `{ ok: true, outcome: "approved" }` | Same price or cheaper — applied at once | Refresh the booking |
| `{ ok: false, error }` | Expired, withdrawn, not theirs… | Show `error` verbatim |

`POST /api/mobile/v1/bookings/:id/revisions/:revisionId/confirm` with `{ "paymentIntentId" }` →
`{ ok: true }` or `{ ok: false, error }`. Same rule as quotes: **not approved until `confirm`
succeeds**; retry it, it is idempotent.

### The screen

- A **"Your mechanic has revised the job"** card (amber, not blue — it is a different thing
  from a quote) → a screen with the mechanic's `reason` first, then **No longer needed**
  (struck through) / **Instead** / **Still on the job**, the was → now totals with the signed
  difference, then **Approve** / **Decline**.
- Copy for a dearer job: *"Approving authorises £X — the difference — on your card now. Your
  original pre-authorisation still covers the rest, and the new total is charged when the job
  is complete."* For a cheaper one: *"Only the new total is charged when the job is complete;
  the rest of your pre-authorisation is released."*
- Under the buttons: *"If you decline, your mechanic may charge the on-site diagnostic or
  cancellation fee for the visit. You're never charged for the revised work itself unless you
  approve it."*
- Push arrives as **"Your mechanic has revised the job"** carrying `bookingId`.

### After approval — the booking row changes in place

`repair_node_id`, `repair_description`, `service_duration_hours`, `engine_oil_*` and
**`total_pence`** all change, and `booking_repairs` / `booking_parts` rows are **replaced**.
Re-read them on the Realtime UPDATE. "Book again" should carry the *new* job.

### After a decline — the booking may end

The mechanic can end the job: `status` becomes **`cancelled`** (an existing value, no new
label), the `cancelled` event carries `outcome: "customer_declined_revision"`, `fee_kind`
(`"diagnostic"` | `"cancellation"` | `"none"`) and `fee_pence`, and a `payment_captured` event
carries `kind: "on_site_diagnostic"` or `"on_site_cancellation"`. Show the fee on the cancelled
booking if you show fees anywhere.

---

## 4. Booking a return visit from a follow-on quote

Approving a `follow_on` quote takes no money. It hands you a `quoteId`, and the ordinary
booking flow does the rest — priced from the quote, not the catalogue.

- `POST /checkout/prepare` accepts **`quoteId`**. With it, `vehicleReg` and the repair ids may
  be omitted: the server takes the vehicle from the job the quote was raised on.
- `POST /bookings` accepts the same **`quoteId`**, likewise without vehicle or repair fields.
- The new booking is priced at the **quote's own snapshot** (what the customer approved), gets
  `source_quote_id`, and offers the job to the quoting mechanic first.
- Its `repair_node_id` may be `"q:<uuid>"`; `booking_parts` rows now exist for the quote's
  parts (readable under the customer policy, first time that table has had rows).

Flow: `respond` → `outcome: "book"` → your slot screen → `prepare` with `quoteId` →
PaymentSheet → `POST /bookings` with `quoteId`.

---

## 5. Discount codes

`POST /checkout/prepare` and `POST /bookings` both accept **`promoCode`** (a string the
customer typed).

- `prepare`'s success arms gain **`discountPence`** and **`promoCode`**. The hold is
  `total − discount − credit`.
- An invalid code is `{ ok: false, error }` with a sentence written for the customer — show it
  verbatim next to the field and let them try again. It is not a failed request.
- `POST /bookings` may return a new failure arm:
  `{ ok: false, code: "promo_unavailable", error }`. **Nothing was written and the hold is
  untouched** — the code ran out between the hold and the booking. Recover exactly as you do
  for `code: "slot_passed"`: release the hold and re-prepare, without the code.
- On the booking row, `discount_pence` and `promo_code` record what was applied.
  **`total_pence` stays the pre-discount figure**, so render the discount as its own line
  rather than adjusting the total.

Add a "Have a discount code?" field at the payment step. Codes need an account — a signed-out
customer gets "Sign in to use a discount code."

---

## 6. Service and inspection reports

A booking whose product carries a checklist (the three services and Bronze/Silver/Gold
inspections) now has a report: every item the mechanic ticked, with their notes.

Readable under RLS: `booking_checklist_results` (own bookings), `checklist_items` and
`checklists` (any signed-in user). Result values are `checked` / `na` on a service and
`pass` / `advisory` / `fail` / `not_checked` on an inspection.

**No endpoint was added.** Either render it in-app from those tables, or link out to the web
report at `/dashboard/bookings/{id}/report` (signed-in, printable). Say which you want if an
endpoint would be better — the backend has the loader ready (`lib/checklists/load.ts`).

The `job_complete` receipt email already links to the web report.

---

## 7. Smaller things

- **`bookings.mileage`** — the odometer reading the mechanic records on the job. Show it on a
  completed booking when set ("Mileage recorded: 62,410 miles").
- **`booking_repairs.kind`** — `'product'` lines are fixed-price with 0 hours. Render
  **"Fixed price"**, never "0 h".
- **`bookings.total_pence` can now rise or fall while `in_progress`** — up when the customer
  approves extra work (§3) or a dearer revised job, down when they approve a cheaper one (§3b).
  It is **not** a reschedule; `reschedule_status` stays null. Treat the Realtime UPDATE as a
  display refresh.
- **New `booking_events.event_type` values**: `fault_added`, `quote_sent`, `quote_approved`,
  `quote_declined`, `quote_withdrawn`, `quote_expired`, `revision_sent`, `revision_approved`,
  `revision_declined`, `revision_withdrawn`, `revision_expired`. Make sure your history renderer
  has a safe fallback for unknown types (it did for `arrival_window_set`).
- `payment_captured` payloads may now carry `quote_id` and `discount_pence`;
  `payout_transferred` may carry `source_charge`; the completion `status_changed` payload
  carries `mileage`, `checklists[]`, `mechanic_confirmed` and `charge_pence`.
- **Mechanics can now propose new times for several jobs at once** ("Running late?", Task
  38). Nothing new for the app: each one is the existing `reschedule_status = 'proposed'` +
  `reschedule_proposed_at` + `reschedule_note` on the booking, the `reschedule_proposed` event,
  and the existing `reschedule-response` endpoint. Expect them to arrive in bursts.
- **The customer signature is gone.** It was never visible to the app (`booking_media` has no
  customer RLS policy), so there is nothing to change — but if any copy in the app says the
  customer will be asked to sign off at the end, remove it. Completion is now the mechanic's
  own confirmation.

---

## What to do, in order

1. Regenerate types once the migrations are applied.
2. **Check the repairs screen doesn't pin `node=root`** — the single highest-value fix.
3. Product nodes: `summary`, "Fixed price", the oil line, and the oil/discount lines in the
   price breakdown.
4. Quotes: the booking screen's faults list and "Quote waiting" card, the approval screen, the
   PaymentSheet + `confirm` handshake, and the Realtime subscription on `job_quotes`.
5. Revised jobs (§3b): the amber "revised the job" card, the diff screen, the PaymentSheet +
   `confirm` handshake for the difference, the Realtime subscription on `job_revisions`, and
   re-reading the booking's lines/parts/total after approval.
6. Follow-on booking with `quoteId`.
7. The discount-code field and `promo_unavailable` recovery.
8. Reports, mileage, `kind: 'product'`, the new event labels, the `cancelled` outcome/fee.

If any response shape here disagrees with what the API actually returns, trust the API and tell
the backend team — these are contracts, and a mismatch is their bug to fix, not something to
work around in the app.
