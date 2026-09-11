# Task 42 — Live supplier parts catalogue at `/admin/parts`, with LKQ vs AAG comparison

**Status:** ✅ Complete (2026-09-11) — `/admin/parts` is now a supplier-fed parts catalogue: pick a vehicle, add part types from LKQ's full 2,277-component list, and browse the results in list or card view, filtered by brand and supplier, with each supplier's own part number and price in its own column. **The hand-maintained catalogue was removed entirely** (owner decision, same day: "we're not going to be using it — it is all going to come through the suppliers' parts catalogue"). **No migration. No `app/api/mobile/**` change. Nothing orders.** Deviations from the plan: the fitment helpers were split into `lib/lkq/fitment.ts` (the production build caught `lib/parts/supplier-offer.ts` dragging the service-role Supabase client into the browser bundle via `lib/lkq/ads.ts`), and an extra fixture (`ecp-getprice-000027-fleet.xml`) was captured so the ADS↔ECP join is tested against real data from both APIs at once.

Task 41 proved the chain works from a terminal. This puts it in front of Gareth.

## Owner decisions consumed (2026-09-11)

1. **Live lookup is the main view**; the manual catalogue survives behind a tab. Nothing dropped, no migration — `booking_parts.part_id` still references `parts` on historical bookings.
2. **Two-column comparison built now**, AAG rendering "not connected" until its IP allowlist lands (Task 40). The day it does, the column populates with no UI change.
3. **The "block a booking when a repair needs parts but none link" rule is a separate task** — it changes booking-creation semantics and affects the mobile app.
4. **Parts pass through at supplier cost — no BMT mark-up.**
5. **Commission is charged on the whole booking total, parts included** (Gareth, later the same day). This is already what the engine does, so no code changed. See `docs/06-lkq-parts-api.md` §8 Q7–Q8 — Q8 is a new question this decision raises.

## What shipped

### `lib/lkq/` — the app client, in the `lib/aag/` shape
Never throws · unconfigured → `null` · health in `platform_settings` · service-role Supabase imported dynamically so the pure half stays unit-testable.

- `xml.ts` — SOAP 1.1 envelope, the escaped-string `<value>` facade, a dependency-free total parser (`parseXml` never throws, refuses >2 MB), `textAt`, fault extraction. Carries the two namespace traps as comments.
- `types.ts` — transcribed from verified behaviour, plus `LKQ_ERROR_CODES`, `LKQ_QUALITY`, and the auth/session code sets.
- `price.ts` — `parseMoneyPence`, `parseStock` (blank → `null`, **never 0**), `flattenPart` (real nesting), **`isNotFound`**, `priceLadder`, `cheapestVariant`/`dearestVariant`, `splitParts`.
- `config.ts` — **independent** ECP and ADS gates, `missingLkqEnv()`, `adsMonthlyCallCap()`.
- `session.ts` — the 20-minute token, shared via `platform_settings` with a 15-minute staleness margin and a credentials fingerprint, mirroring `lib/haynespro/client.ts`'s VRID handling.
- `ecp.ts` — `getLkqPrices` (batched, one retry on a stale session, reading the stored token before minting), `helloFromLkq`.
- `ads.ts` / `ads-cache.ts` / `fitment.ts` — metered REST client, `ApiKey` header **and** body token, cache-before-network, a monthly credit budget, and pure fitment helpers.
- `components.ts` / `mapping.ts` / `vehicle.ts` — the 2,277-component list as a build-time fixture, the curated GenArt↔component bridge, and the attribute **multimap**.

### `lib/parts/supplier-offer.ts` — the normalisation layer
Both suppliers map into one `SupplierOffer` shape so the two columns are genuinely comparable rather than merely adjacent. `lkqOffers` joins ADS fitment to the ECP ladder on the 8-digit catalogue number.

### UI
- `/admin/parts` — live lookup: status strip (three independent halves + credit meter), reg + part form, two-column comparison with collapsible per-part ladders.
- `/admin/parts/manual` — the existing catalogue, moved verbatim.
- `_components/parts-tabs.tsx`, `supplier-status-strip.tsx`, `live-lookup-form.tsx`, `supplier-panel-card.tsx`.
- `app/actions/lkq.ts` — admin-gated, read-only, both suppliers in parallel.
- `lib/auth/require-admin.ts` — the gate extracted from `app/actions/aag.ts`, now shared.

### Fixes made along the way
- **`/admin/pricing` was selecting every `platform_settings` row unfiltered.** With supplier caches now living there, that would have pulled megabytes on every page load. Narrowed to the keys it consumes — behaviour-preserving.
- Back-links on `new` / `edit` / `import` / `part-form`, the `revalidatePath` and both redirects in `app/actions/parts.ts` now point at `/admin/parts/manual`.
- Breadcrumbs added for `/admin/parts/manual` and the previously-missing `/admin/parts/aag-check`.

## Money rules enforced in code, not convention

- **`isNotFound` is applied inside `getLkqPrices`**, so a £0.00 phantom cannot reach a caller by omission — unknown parts come back in `notFound` and the UI names them.
- **Cost and surcharge are never summed** and render in separate columns; whether `ShowPrice` already includes the surcharge is still unverified (§8 Q1).
- **Blank stock renders "—", never "0"**; an unpublished RRP is `null`, never £0.00.
- No mark-up is applied anywhere.

## Acceptance criteria

- [x] `/admin/parts` leads with the live lookup; the manual catalogue is intact at `/admin/parts/manual` with add/edit/import/delete unchanged.
- [x] LKQ column renders the brand/quality ladder with fitment, quantity-of-fit and five-level stock.
- [x] AAG column renders a clear "not connected" state and will populate unchanged once allowlisted.
- [x] Both supplier legs run in parallel and neither can take the page down.
- [x] Credit conservation: cache-before-network, a monthly cap, and a visible meter. The component list is a build-time fixture, never fetched.
- [x] Admin gate is explicit on every server action.
- [x] `isNotFound` enforced at the boundary; tested against the real captured not-found reply.
- [x] 443 tests pass (44 new), `tsc --noEmit` clean, eslint clean, production build compiles.
- [x] No migration; no `app/api/mobile/**` change; nothing orders.
- [ ] Exercised in a browser by a signed-in admin — **owner step.** Both routes were confirmed to resolve and redirect to auth; the data path is proven by fixtures captured from both live APIs.

## Mobile app impact

**None.** No schema change, no change to any response shape under `app/api/mobile/**`, no change to booking statuses, displayed pricing or auth. A phone running last month's build is unaffected. **No work is required in `bmt-customer-app`.**

This stops being true the moment supplier costs feed a customer-facing quote — that is a pricing change under the AGENTS.md rules and must be flagged when it lands.

## How to verify

```bash
npm test && npx tsc --noEmit && npm run build
npm run dev     # then sign in as an admin
```

1. `/admin/parts` — all three status halves read "Connected"; the credit meter shows usage.
2. Look up `NV57XGP` + **Brake discs** → LKQ fills with ~58 variants across 14 catalogue parts; AAG shows "Not connected". First run says "Live", a repeat says "Cached".
3. Blank `LKQ_ECP_PASSWORD` → the pricing half reports an auth failure while the catalogue half still works; the page does not error.
4. `/admin/parts/manual` → the old catalogue, unchanged.

CLI cross-check that the UI agrees with the raw API:
```bash
node scripts/probe-lkq-price.mjs --part 10459026,000000000
```

## Follow-ups

1. **Settle the surcharge question** (§8 Q1) — it affects money.
2. **Answer §8 Q8** — who keeps the difference when a mechanic fits a cheaper variant than the one quoted.
3. `TecDocReferences` may replace the curated mapping (§8 Q2) — costs a credit to test.
4. A real `lkq_ads_cache` table if this graduates beyond an admin tool; `platform_settings` is a deliberate compromise for "no migration".
5. Fix `scripts/probe-ads-parts.mjs`'s numeric component guard — 967 of the 2,277 component numbers are not numeric.


---

## Revision, 2026-09-11 (same day, after first review)

Brad reviewed the first cut and asked for three changes. All shipped.

### 1. The eight curated categories are gone

They were never LKQ's — they were my hand-paired list of the only product groups where an AAG GenArt and an LKQ component number were both known, and they read as if they were the catalogue. **The picker now searches all 2,277 LKQ components.** The GenArt mapping survives as internal plumbing (`genartForComponent`) so AAG can still be asked wherever a pairing exists; it is no longer a user-facing gate.

### 2. Part images

`imageUrl` had been carried through the data layer and never rendered — a real gap. Every ADS part has an `ImagePath` (a genuine 600×600 TecDoc JPEG, publicly served, verified loadable). Both views now show it. Served with a plain `<img>` straight from the supplier's image store: `next/image` would need a `remotePatterns` entry for a host only this page touches, and would route supplier artwork through our optimiser for no benefit.

### 3. List and card views, filterable

`_components/catalogue-browser.tsx` — a view toggle, a brand filter, a supplier filter, a sort and a search box. `lib/parts/compare-rows.ts` merges the two suppliers into one row per part.

**The merge is the risky part and is deliberately conservative.** LKQ and AAG number the same physical part differently (LKQ's `10459124A` vs AAG's own id), so a row carries **one column per supplier**, each showing that supplier's own part number beside its own price; a dash means that supplier doesn't offer it. Two offers merge *only* when brand **and** size signature agree, and only when exactly one candidate is unclaimed. A 302 mm Pagid disc and a 278 mm Pagid disc stay as separate rows — an unmatched row is honest, a wrongly-merged one quietly compares two different parts. 17 tests cover exactly that.

### The manual catalogue was removed

`parts/manual`, `parts/new`, `parts/[id]/edit`, `parts/import`, `_components/parts-table.tsx`, `_components/part-form.tsx`, `_components/csv-import.tsx`, `_components/parts-tabs.tsx` and `app/actions/parts.ts` are all deleted. Only `/admin/parts` and `/admin/parts/aag-check` remain.

**The `parts` TABLE stays** — `booking_parts.part_id` and `job_quote_lines.part_id` reference it on historical bookings, and dropping it would break them.

**⚠️ Consequence to be aware of:** `listQuoteParts()` (`lib/quotes/mechanic.ts:300`) and the job-revision flow (`lib/revisions/mechanic.ts`) still read `parts` to populate the **mechanic's on-site quote part picker**. With the admin UI gone, that list is frozen at whatever migration `0021` seeded and **nobody can add, reprice or deactivate a catalogue part**. The picker is a `Combobox` with `allowCustom`, so a mechanic can still type a part as free text and it degrades rather than breaks. **Follow-up: point that picker at the supplier catalogue instead**, which is the stated direction.

### Revised acceptance criteria

- [x] No curated categories; the picker searches all 2,277 components.
- [x] List and card views with a toggle.
- [x] Filter by brand and by supplier; also sort and free-text search.
- [x] Each row carries SKU, brand, name, and a price column per supplier.
- [x] Part images rendered in both views.
- [x] Manual catalogue removed; `parts` table and its FK references intact.
- [x] 460 tests pass (17 new on the merge), typecheck and lint clean, build compiles; only `/admin/parts` and `/admin/parts/aag-check` remain in the route manifest.
- [ ] Exercised in a browser by a signed-in admin — **owner step.**
