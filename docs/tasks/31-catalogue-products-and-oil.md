# Task 31 — Four top-level categories; fixed-price diagnostics, servicing and inspections; engine oil from HaynesPro

**Status:** ✅ Complete (2026-09-08) — on branch `task-31-catalogue-products` (stacked on Task 30). **Migration `0060` must be applied before this code is deployed** (see "Deploy order"). `tsc` clean, 291 unit tests (29 new), lint clean on every touched file, production build compiles. **Not exercised end-to-end in a browser with products** — the table doesn't exist until `0060` is applied. What WAS verified in a real browser (dev server + Playwright, live HaynesPro, `S28BSW`) is the fail-open path: the top level renders one "Repairs" card with its blurb, the stepper reads "What you need", Repairs drills to HaynesPro's root (29 groups, crumbs "Start / Repairs"), and search → the combined-repair price page still prices £114 with no console errors. The products script under "How to verify" is still to be run. Deviations from the plan: none.

## Why this exists

Four of the twelve items in Gareth's change list (2026-09-08):

- "Can we separate the categories: repairs, diagnostics, servicing, pre-purchase inspection."
- "Diagnostic category (Diagnostic inspection £59.99, Car won't start inspection £59.99,
  plug-in diagnostic £59.99) — use these set prices."
- "Pre-purchase inspections set prices listed as Bronze, Silver, Gold packages" — his sheet
  prices them £72.99 (64 checks) / £92.99 (116) / £139.99 (173).
- "Oil will be pulled from parts when we get them, or if we can do it as £15.00 per litre and
  get HaynesPro to work out each car and what litres go in — this data can be pulled from
  adjustments and specifications."

Task 17 removed the packaged-services catalogue on the owner's instruction ("we are using the
repairs from HaynesPro for the services now"). This task does **not** bring it back: HaynesPro
stays the source of every repair and every repair time. What it adds is a small
**products** table for the things HaynesPro can't price — a diagnostic visit, an inspection, a
service — and a top level to the catalogue that puts them beside Repairs.

## Owner decisions (Brad, 2026-09-08)

- **Servicing = an admin-set fixed price + engine oil** at £/litre × the manufacturer's capacity.
  Gareth hasn't given the service prices yet, so the three services are seeded with placeholder
  prices and **switched off** until he does.
- Diagnostic and inspection prices as Gareth listed them.

## What shipped

### Schema — `0060_catalogue_products.sql`

- **`catalogue_products`** — `category` (`diagnostics` | `servicing` | `inspection`), `name`,
  `summary` (one line under the name), `description` (what's included, one item per line),
  `price_pence` **or** `labour_hours` (fixed wins), `duration_hours` (how long the visit is
  blocked out for), `includes_engine_oil`, `display_order`, `is_active`. Unique on
  (category, lower(name)). Admin SELECT RLS; read server-side via service role
  (`lib/catalogue/load-products.ts`, fail-open to "no products"), written by admin actions only.
- **`booking_repairs.kind`** — `job` (default) | `product`.
- **`bookings.engine_oil_litres` / `engine_oil_price_per_litre_pence` / `engine_oil_source`** —
  the oil line's snapshot; the money itself is `parts_price_pence`, which already flows through
  `computePrice`, `lib/earnings.ts` and the admin Split card.
- **`platform_settings`**: `engine_oil_price_per_litre_pence = 1500`, `engine_oil_default_litres = 5`.
- **Seed**: three diagnostics at £59.99 (1 h visit); Bronze £72.99 / Silver £92.99 / Gold £139.99
  (1 / 1.5 / 2 h visits — placeholders); Interim £99 / Full £149 / Major £199 **inactive** with
  `includes_engine_oil = true` (1.5 / 2.5 / 3 h). Idempotent.

### Ids and the top of the catalogue — `lib/catalogue/products.ts` (pure, tested)

- A product is **`p:<uuid>`**; the three category nodes are **`c:diagnostics`**, **`c:servicing`**,
  **`c:inspection`**; **"Repairs" is HaynesPro's own root, id `root`** — drilling into it is the
  catalogue exactly as it was, so the overlay (Task 26), the hides (Task 23), the admin tree, the
  search walk and the breadcrumbs are untouched.
- `getRepairCatalogueLevel(reg, nodeId)`: **no `nodeId` → the new top level** (`composeTopLevel`:
  Repairs, then each category with at least one active product); `"root"` → HaynesPro's groups
  as before; a `c:` id → that category's products priced for this vehicle. The top level still
  asks HaynesPro for the root (a memo hit one click later) so the "no repair data" outage signal
  fires at the entry screen as it always did.
- A product node is `kind: "repair"` with `pricePence` (+ oil when included) and `billedHours` =
  its labour hours or its visit length — so a client that knows nothing of products still shows
  and books it — plus the ADDITIVE `productId`, `productCategory`, `summary`, `fixedPrice`,
  `durationHours`, `oil`.
- Search (`searchRepairCatalogue`) matches products by name or summary, like combined repairs.

### Pricing — `buildRepairsQuote` (`lib/haynespro/repair-booking.ts`, pure, tested)

1. HaynesPro jobs exactly as before → `jobHours` (sum, or HaynesPro-combined).
2. `combinedRawHours = jobHours + Σ labour_hours of hourly products`; `billedHours` =
   `billableHours(combinedRawHours)` **only when there is hourly work** — a lone £59.99 diagnostic
   is £59.99, not 1 h × rate. The 1-hour minimum still applies once per visit.
3. `labourPence = billedHours × rate`; `fixedPence = Σ price_pence`; `oilPence` = the oil line
   when any product includes oil.
4. `visitHours = billedHours + Σ duration_hours of fixed products` → `bookings.service_duration_hours`
   (arrival-window clash detection, the mechanic's day view).
5. `computePrice({ durationHours: visitHours, overridePricePence: labourPence + fixedPence, partsPence: oilPence })`
   — the never-before-used `overridePricePence` hook. Commission stays on the whole total.
   **No products → bit-for-bit the pre-Task-31 figures** (tested).
6. Lines keep the customer's order; a product line is `{ nodeId: "p:…", kind: "product", productId,
   linePence: its price }`; `bookings.repair_node_id` is the first line as chosen (may be `p:…`).
   `RepairsQuote` gains `products`, `labourPence`, `fixedPence`, `oil`, `visitHours`.
- `quoteRepairs` partitions `p:` ids from catalogue ids, resolves products (`resolveProducts`,
  all-or-nothing like the overlay), skips the HaynesPro node lookups when there are no jobs, and
  asks for the oil line only when a product includes it. `expandCatalogueItems` refuses `p:`/`c:`.

### Engine oil — `lib/haynespro/oil-capacity.ts` + `engine-oil.ts`

- **Real payloads first.** `scripts/probe-oil-capacity.mjs` prints `getLubricantCapacitiesV4`
  for a car type and `--save`s it as a fixture. Six captured in `lib/haynespro/__fixtures__/`:
  Golf VII 1.0 TSI (petrol, 4.0 l), Leon 2.0 TDI (4.6 l), Ranger 3.0 TDCI (7.9 / 8.9 l by dipstick
  colour), Prius (hybrid, 3.7 l), Leaf and Model 3 (EVs, no engine oil — their reduction-gearbox /
  drive-unit oil must not be mistaken for it).
- **The shape**: one "Capacities" row whose children are a flat list of heading rows (no value)
  and value rows; the engine-oil row is consistently **"Engine sump, including filter"**, unit "(l)".
- `parseEngineOilCapacity(rows)` walks the tree, keeps rows named sump / engine oil and not
  gearbox / transmission / differential / drive unit / …, prefers a with-filter figure, and among
  equals takes the **largest** (the Ranger charges 8.9 l and the receipt says "Red dipstick
  O-ring"). `parseLitres` handles "4,3", ranges (larger figure), "approx.", ml and US quarts.
- `engineOilForVehicle(carTypeId)`: **a pure EV (HaynesPro `ELECTRICAL`) gets no oil line**;
  otherwise the parsed litres, else the admin's default litres (`source: "default"`). Both reads
  are memoised in `tree.ts`. Litres are charged to 0.1 l exactly as HaynesPro states them.
- `/admin/pricing` → new "Engine oil" panel: price per litre and the default quantity
  (`app/actions/pricing.ts` `SETTING_KEYS`; `lib/pricing/calculate.ts` readers).

### Admin — `/admin/services` ("Services" in the Commercial sidebar group)

Grouped by category with reorder arrows, a live/hidden switch, edit and delete; `new/` and
`[id]/edit/` share `_components/product-form.tsx` (custom `Select` for category and
"Fixed price / By the hour", `Switch` for oil and live). Actions in
`app/actions/catalogue-products.ts` — `createProduct`, `updateProduct`, `setProductActive`,
`reorderProduct`, `deleteProduct` (refused while any booking references the product).

### Customer surfaces

- `/book/repairs` top level: Repairs / Diagnostics / Servicing / Pre-purchase inspection as
  cards with blurbs (`repair-rows.tsx` renders a group with a `summary` that way); a product row
  shows its summary, "Fixed price · about 1 hour" (or "Estimated N hours at our hourly rate")
  and "includes engine oil, 4.3 L × £15". Root crumb "All repairs" → "Start"; stepper step 2
  "Repairs" → "What you need".
- `/book/match`: a single product shows its "what's included" bullets; a servicing product
  shows the **Engine oil · 4.3 L × £15.00 — £64.50** row with "the manufacturer's stated
  capacity" or "estimated — your mechanic adjusts it"; product lines read "Fixed price · £59.99";
  a products-only booking says "Allow about N hours at your door" instead of book time.
- Copy: landing preview reordered to Diagnostics / Servicing / Pre-purchase inspection / Brakes /
  Battery / Clutch under "Repairs, servicing and inspections — priced for your exact car."; the
  FAQ and help page no longer promise a £45 diagnostic fee "refunded against the work" (nothing
  ever implemented that) — they now say a diagnostic is a set price from £59.99 and the mechanic
  quotes for the repair.
- Mechanic offer / job page and admin job detail label a product line "Fixed price" instead of
  hours (`repairLinesFor` gained `product`).

### Deploy order

`0060` before the code. The catalogue, the quote and the admin page all fail open without the
table (no products, top level = Repairs only, `/admin/services` empty with an error banner), but
`createBooking` names `booking_repairs.kind` and the `engine_oil_*` columns whenever a product
or an oil line is in the booking — which can't happen before the table exists, so the order is
safe either way; it just isn't useful until the migration is in.

## How to verify

1. Apply `0060` (idempotent). `/admin/services` → nine seeded rows; the three services are off.
   `/admin/pricing` → "Engine oil" panel shows £15.00 / 5 L.
2. Activate "Full service" (leave the placeholder £149). `/book/repairs?reg=<Golf reg>` → four
   cards: Repairs · Diagnostics · Servicing · Pre-purchase inspection. Repairs → the tree exactly
   as before (crumb "Start / Repairs"). Diagnostics → three £59.99 rows. Servicing → "Full
   service · Fixed price · about 2.5 hours · includes engine oil, 4 L × £15.00" priced £209.
   Pre-purchase inspection → Bronze £72.99, Silver £92.99, Gold £139.99.
3. Book "Plug-in diagnostic" alone → price page £59.99 with the included bullets, "Allow about
   1 hour", no book-time line → pay with the test card. DB: `repair_node_id = 'p:…'`,
   `base_price_pence = 5999`, `parts_price_pence = 0`, `service_duration_hours = 1`, no
   `booking_repairs` rows, `platform_fee_pence = 900`.
4. Book Full service + "Renew the front brake pads" → price page lists both (the service "Fixed
   price · £149.00", the pads with hours), the oil row, total = 14900 + 6000 (1 h min on 0.8 h)
   + oil. DB: two `booking_repairs` rows (`kind` product / job), `engine_oil_litres = 4.0`,
   `engine_oil_source = 'haynespro'`, `parts_price_pence = 6000`.
5. On an EV reg: Servicing shows no oil caption and the service is its bare price.
6. Search "won't start" → the diagnostic; "service" → the three services (when active).
7. Mechanic offer and job page show the product line as "Fixed price"; admin job detail too.
8. Mobile: `GET /api/mobile/v1/repairs/tree?reg=…` (no node) → four groups; `?node=root` → the
   old root; `?node=c:diagnostics` → three product nodes with `productId`; `POST /quote` with
   `repairNodeIds: ["p:…"]` → `fixedPence`, `oil: null`; a servicing id → `oil` populated and
   `partsPence = oil.pence`.
9. Regression: a booking with no products prices identically (unit-tested; spot-check one).

## Acceptance criteria

- [x] The catalogue's top level is Repairs / Diagnostics / Servicing / Pre-purchase inspection
- [x] Three diagnostics at £59.99, three inspections at Gareth's prices, seeded and editable
- [x] Servicing products exist (inactive until priced) and add engine oil at £/litre × capacity
- [x] Engine-oil capacity parsed from HaynesPro's live payload, with fixtures and an EV rule
- [x] Products are booked through the same quote → hold → booking path as repairs, mixed or alone
- [x] Admin CRUD for products; oil price and default litres on /admin/pricing
- [x] A booking with no products prices exactly as before (tested)
- [x] Mobile contract additive only
- [ ] Exercised end-to-end in a browser once `0060` is applied — script above

## Follow-ups / open questions for Gareth

- **Service prices** for Interim / Full / Major — the rows are inactive until given.
- **Commission on oil**: today's rule takes 15% of the whole total, so the mechanic nets £12.75 of
  every £15 litre. Pass oil through at cost instead? One-line change in `buildRepairsQuote`.
- **Rounding**: litres are charged exactly (4.3 l = £64.50). Round up to the next 0.5 l for the
  pack the mechanic buys? A one-line change behind a setting.
- **Diagnostic fee credited against a repair** — the old FAQ promised it; nothing implements it.
  If he wants it, Task 33's quote flow is the place (a `now` quote could deduct the diagnostic).
- The inspection **visit durations** (1 / 1.5 / 2 h) are guesses; editable per product.
- HaynesPro `getMaintenanceSystemsV7` service times are on the licence and unwired — a later
  option to derive a service's labour per vehicle instead of one fixed price.

## Mobile app (per AGENTS.md)

1. **Migration `0060`** → `npm run db:types` (`catalogue_products` — admin-only, the app never
   reads it; `booking_repairs.kind`; `bookings.engine_oil_*`).
2. **`GET /repairs/tree` with no `node`** now returns the four top-level groups (ids `root`,
   `c:diagnostics`, `c:servicing`, `c:inspection`) instead of HaynesPro's ~43 groups. An old build
   drills by opaque id and keeps working — it just sees "Repairs" as one more group. **Check the
   app doesn't send `node=root` explicitly for its first screen**; if it does it never sees the
   categories (not broken, just unimproved).
3. `CatalogueNode` gains optional `productId`, `productCategory`, `summary`, `fixedPrice`,
   `durationHours`, `oil`. Show `summary` under a name where present; label `fixedPrice` items
   "Fixed price"; show the `oil` caption on servicing. Search hits may be products.
4. `POST /quote`: `partsPence` is non-zero on a servicing product (existing field, existing
   meaning); additive `oil`, `products[]`, `labourPence`, `fixedPence`, `visitHours`; `lines[]`
   gain `kind` / `productId`; `nodeId` may be `p:…`. Display: show the oil line when `oil` is set.
5. `POST /checkout/prepare` and `POST /bookings` accept `p:` ids in `repairNodeIds` unchanged.
6. `bookings.repair_node_id` may be `p:…`; `booking_repairs` rows may have `kind = 'product'`
   (hours 0 on a fixed product — render "Fixed price", not "0 h"). "Book again" with a `p:` id
   re-quotes fine.
7. Pricing display changes for servicing (an oil line) — per AGENTS.md this is an always-report item.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
