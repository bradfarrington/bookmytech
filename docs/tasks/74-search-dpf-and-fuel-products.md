# Task 74: Repair search that finds things, DPF services, products for one fuel

**Status:** 🟡 **Built 2026-11-13, not verified in a browser.** Typecheck clean, 707 unit tests pass (new ones for search terms, the vocabulary, fuels and info sheets), lint clean on every touched file. The search walk was replayed against the real HaynesPro trees of three cars (see "How the search was checked"). **Migration `0088` is written, not applied.** Until it is, nothing is filtered by fuel, the DPF services and the diesel Major service don't exist, and the admin can't set a fuel or an info sheet (it says why). Search works without it.

## Why (Brad, 2026-11-13)

1. "The search bar doesn't search like how it should." His screen recording, BMW 3 Series 316d: **"pads" found only the two combined "Pads and Discs" repairs** and said "Not every repair was checked", while browsing showed "Renew the front brake pads", "Renew all the brake pads" and more.
2. "I can't find DPF replacement or regen." Add **DPF chemical clean and regeneration £139.99** and **DPF forced regeneration £89.99**.
3. His DPF document: put it in the T&Cs, and **show it as an info sheet when a customer books** so they know the process (and that the fee applies whether or not the filter clears).
4. The Major service says "spark plugs" on a diesel. "Major for petrol yes, major for diesel no. Glow plugs are a separate cost." He thought it was HaynesPro copy; it's the admin's product summary.

## 1. Search

### The cause

HaynesPro has no keyword search, so `runSearch` (`lib/haynespro/catalogue.ts`) walks the tree within 40 upstream calls, best-first by how many query words a **group's own name** contains. On the BMW, "Renew the front brake pads" sits under **"Brake pad"** (singular) under **"Brakes (Mechanical)"**. Neither contains "pads", so every group scored 0, the walk opened groups in list order and ran out of budget before reaching the brakes. "dpf" was worse: HaynesPro only ever says "diesel particulate filter", so it could never match at all.

### The fix

- **`lib/haynespro/search-terms.ts`** (pure, tested): a query becomes **terms**. Words match on a crude stem ("pads" = "pad", "brakes" = "brake"). Only the word still being typed matches as a prefix ("brak"), so "con" no longer matches "control". Stop words are dropped ("change **my** brake pads"). **Synonyms** map customer words to HaynesPro's: dpf → particulate, water pump → coolant pump, fan/aux belt → ancillary drive belt, cambelt → timing belt, tie rod → track rod, drop links → stabiliser link, handbrake → parking brake, aircon → air conditioning, and more (every target checked against the reference trees). **Verbs** (replace/change/new, check, fix/repair) are weak: a job with the verb ranks first, one without still matches.
- **`lib/haynespro/search-vocabulary.json`** (65 KB, generated): for each of HaynesPro's 410 group ids, every word used beneath it. **Group ids are one taxonomy across vehicles** (`1M01500000G` is "Brake pad" on the BMW diesel and the Golf petrol alike), so the vocabulary from four reference cars steers the walk on any car. Built by **`scripts/build-search-vocabulary.mjs`** from a BMW 316d, Golf VII 1.4 TSI, Ranger 2.0 EcoBlue and Yaris hybrid (~1,500 probe calls under the `bmtprobe` prefix). Re-run it if HaynesPro's tree changes noticeably.
- **The walk** now orders groups by vocabulary affinity, and a group is only "promising" if its vocabulary holds **every** term a job must match. Batches open only promising groups. When none remain, it stops if anything was found. If nothing was found, it carries on into the rest as before, for a job the reference cars lack. `truncated` now means "a group that could still hold a match was left unopened".
- The admin's combined-repair job search, the mechanic's revise-job search and the quote tool's search all share this walk, so they improve too.

### How the search was checked

The real trees of three cars, crawled once, were replayed through `searchJobsForCarType` with HaynesPro mocked:

| Query | BMW 316d (diesel) | Golf 1.4 TSI (petrol) | Ranger 2.0 (diesel) |
|---|---|---|---|
| pads | 36 jobs, 9 calls | 26 jobs, 10 calls | 8 jobs, 9 calls |
| dpf | 5 jobs, 6 calls | none (petrol) | 5 jobs, 6 calls |
| change my brake pads | 36 jobs, 8 calls | 22 jobs, 8 calls | 8 jobs, 8 calls |
| cambelt | none (timing chain) | 12 jobs, 5 calls | 7 jobs, 5 calls |
| adblue | none | none | 5 jobs, 3 calls |

Before: "pads" on the BMW found **no** HaynesPro jobs in 40 calls. A query that matches nothing still spends the 40-call fallback, as before.

## 2. Products for one fuel

- **`catalogue_products.fuel_types text[]`** (`0088`): null = every vehicle. The catalogue gets the car's fuel from HaynesPro's type node (`lib/haynespro/fuel.ts`, memoised; **a hybrid is petrol**, an unknown fuel sees every product) and lists only what fits (`productsForFuel`).
- Two products may now **share a name** in a category when their fuels differ (the unique index includes the fuels). The customer only ever sees the one for their car.
- **Swap, not refuse:** `resolveProducts` swaps a product that doesn't fit the car's fuel for the live one of the same name and category that does, so a homepage card, an old link or an older app build carrying the petrol Major service onto a diesel still prices. With no such twin (a DPF clean on a petrol) it's refused like a switched-off product. The quote's ids follow the swap.
- **Homepage:** one card per name ("Major service", at the lowest of its prices).
- **Admin** (`/admin/services`): "Offered for: Every vehicle / Petrol (incl. hybrids) / Diesel / Electric", and a fuel pill in the list.
- **Data in `0088`:** the existing Major service becomes **petrol-only** ("Spark plugs replaced"), and a **diesel copy** is added with the same price, visit length and checklist, minus spark plugs. Its checklist already says "Replace Spark Plugs (petrol Only)". **EVs no longer see a Major service.** Glow plugs stay a HaynesPro repair (group "Glow plug").

## 3. DPF services and info sheets

- **`catalogue_products.info_sheet`** (`0088`): plain text. `## ` lines are headings, `- ` lines are bullets, and blank lines separate paragraphs (`parseInfoSheet`). Shown:
  - on the **price page** under the price, as "Please read before you book", for every product in the basket that has one (`book/match/_components/product-info-sheets.tsx`);
  - in the **booking confirmation email** (new `info_sheets` custom block on `booking_confirmed`; admin text overrides don't hide it);
  - to the **customer app** as blocks on `POST /quote` `products[].infoSheet` (additive).
- **Seeded in `0088`** (diesel only, under Servicing, live): **DPF chemical clean and regeneration £139.99** (2 h visit) and **DPF forced regeneration £89.99** (1 h visit). Visit lengths are placeholders. Both carry Brad's document as the info sheet. The forced-regeneration one leaves out the chemical-soak step. The Servicing blurb now mentions DPF cleaning for diesels.
- **Terms** (`/terms`): new **§16 "DPF Cleaning and Regeneration"** (fee applies whether or not the filter clears; no guarantee; further work quoted through the platform; excluded from the warranty), plus "DPF cleaning and regeneration services" in the warranty exclusions. Last updated → 13 November 2026. **From §16 on, the page is one section ahead of `customer-terms.odt`** (see `docs/legal/README.md`). Brad's document is filed as `docs/legal/dpf-info-sheet.odt`.

## Deploy order

Either. Before `0088`:
- `loadCatalogueProducts` asks for the new columns, and on failure retries without them, so products don't disappear.
- The admin list and edit pages select `*`.
- Product saves go through when fuel and info sheet are blank, and otherwise say "can't be saved until migration 0088 is applied".

## Acceptance

- [x] "pads", "dpf", "water pump", "fan belt", "cambelt" find the right jobs on the reference cars (replay above, unit tests).
- [x] No "Not every repair was checked" for ordinary searches.
- [x] DPF chemical clean £139.99 and forced regeneration £89.99, diesel only. *(In `0088`, not applied.)*
- [x] A diesel's Major service doesn't mention spark plugs; a petrol's does. *(In `0088`, not applied.)*
- [x] DPF info sheet before booking and in the confirmation email.
- [x] DPF section and warranty exclusion in the terms.
- [ ] Checked in a browser after `0088`: diesel reg → Servicing shows a Major service without spark plugs and both DPF services; petrol reg shows neither DPF service; the DPF price page shows the sheet; the confirmation email shows it. *(Needs `0088` applied.)*

## App work

- **Customer app:** `docs/app-prompts/2026-11-13-customer-app-dpf-info-sheets.md`. Show `products[].infoSheet` before checkout, and run `npm run db:types` after `0088`.
- **Mechanic app:** `npm run db:types` after `0088` only.
- Search, fuel filtering and the product swap are server-side; old builds benefit with no change.
