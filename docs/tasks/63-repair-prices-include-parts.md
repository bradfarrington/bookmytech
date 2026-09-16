# Task 63: Show the real price when a customer picks a repair

**Status:** ✅ Complete (2026-09-16). Browse rows now show labour **plus the parts that job needs on that car**, and fall back to the old "£60 + parts" only when a part genuinely has no price. Search results are unchanged — see "Deliberately out of scope".

## The problem

Step 2 of the funnel (`/book/repairs`) priced a repair on **labour alone** and
wrote "+ parts" after it. "£1614 + parts" is not a price: the customer cannot
tell whether the parts are £20 or £400, so the number they were choosing
between was not the number they would pay one click later.

Everything needed to fix it already existed. Parts went into the quote in Task
43: `quoteRepairsResult` prices each job's TecDoc part groups through
`lib/parts/quote-parts.ts`, and a quote's total is simply labour + parts (no
mark-up, no VAT line — `lib/pricing/calculate.ts`). The browse list just never
asked.

## What shipped

- **`lib/catalogue/level-parts.ts`** (new) — prices a whole level's bookable
  rows in **one** `quoteJobParts` call: the same function the quote uses, so a
  row's figure is the figure the price step charges rather than a second
  estimate that can drift. `foldLevelParts` folds the result back per row and
  is unit-tested.
  - A row whose jobs name no part group is never asked about.
  - A row with a part group that has **no usable price** is left unpriced and
    falls back to "+ parts". A quote for that job would refuse the booking
    outright (`PARTS_UNAVAILABLE_MESSAGE`); showing labour as though it were
    the whole price would be worse than saying we don't know yet.
  - The whole pass is bounded by `LEVEL_PARTS_BUDGET_MS` (4.5s). Past that the
    level renders as it did before. The abandoned work still finishes and still
    writes the 12-hour price cache, so the next level has it.
- **`lib/haynespro/catalogue.ts`**
  - `CatalogueNode` gains **additive, optional** `partsPence` and `totalPence`.
    `totalPence = pricePence + partsPence` and equals the `breakdown.totalPence`
    of a one-item quote for that id. They are **absent, not zero**, when the
    parts couldn't be priced; `partsPence: 0` means the job's part groups are
    all switched off and labour really is the whole price.
  - `getRepairCatalogueLevel` takes `{ priceParts }`. Opt-in, because pricing a
    level costs a supplier lookup per part group the first time a registration
    is seen.
  - `hoursForNodes` became `fetchNodes`, which keeps the HaynesPro nodes as well
    as their hours — the part groups live on the node, so moved-in leaves and
    the jobs inside a combined repair could not be priced without them.
  - Rows are expanded through `expandCatalogueItems`, so a **combined repair**
    is priced as the sum of every job it books, exactly as its quote is.
- **`lib/catalogue/overlay.ts`** — `composeLevel` takes `nodeGenarts` beside
  `nodeHours`, so a **moved-in leaf** and a **combined repair's option** carry
  their part groups. They never did: both are known to the level by id only, and
  the ids were resolved to hours alone. Since both clients decide whether to
  write "+ parts" from `genartIds`, those rows printed a bare labour figure that
  looked like a total. It predates this task — the same rows printed the same
  figure before — but it is the fallback the feature leans on. A combined repair
  gets every group its jobs use between them; the search path fills them the
  same way, so a hit says "+ parts" for the same rows a browsed one does.
- **`_components/repair-rows.tsx`** — the button shows the total; the caption
  reads "· parts included" when there are parts in it. Unchanged where there is
  no total: "+ parts" still follows the labour figure.
- **`_components/repair-browser.tsx`** — passes `priceParts: true`, and the
  footnote now says repairs are priced on book time "plus the parts that job
  needs".

## Verified live (2026-09-16, S28BSW — Ford Ranger 3.0 TDCi)

| | |
|---|---|
| Browse row | "Renew the engine · Estimated 13.9 hours on your car · parts included" → **£881.26** |
| Price step for the same id | **£881.26** = £834 labour + £47.26 antifreeze (NAPA) |
| A row AAG can't price | "Renew the engine block · £1614 + parts" — unchanged |
| Warm level render | 0.3–0.6s |

## Deliberately out of scope

- **Search results** (`repair-search.tsx` / `searchRepairsAction`) still show
  "+ parts". A search can return up to 50 hits from across the tree, which is a
  far bigger fan-out of supplier calls than one level; Brad chose browse-only
  (2026-09-16). The rows share a component, so turning it on later is passing
  the priced nodes through.
- **Pricing by default on the mobile tree endpoint.** It is opt-in per request
  instead — see below.

## The mobile app

- **No schema migration.** Nothing to regenerate with `npm run db:types`.
- **`GET /api/mobile/v1/repairs/tree` takes `parts=1`** (also `parts=true`).
  With it, bookable rows carry the additive `partsPence` / `totalPence`.
  Without it the response is byte-for-byte what it was, and costs what it
  always did.

  A **parameter, not a flag**, on purpose: pricing a level costs a supplier
  lookup per part group the first time a registration is seen, and a build that
  cannot render the total should not wait for it. Every build already on a phone
  is such a build, and they cannot be updated. Opting in per request means only
  the builds that use the number pay for it.

- **What the app must do:**
  1. Send `parts=1` on the tree request.
  2. Render `totalPence` when it is present.
  3. **Keep the "£X + parts" rendering for when it is absent.** The fields are
     deliberately absent — not zero — when a part group has no usable price. A
     quote for that job refuses the booking (`PARTS_UNAVAILABLE_MESSAGE`), so
     labour alone is not what the customer would pay. `partsPence: 0` is
     different: the job's part groups are all switched off and labour really is
     the whole price.
- An app that hasn't done this shows "+ parts" where the website shows a total.
  That is a difference in **detail, not in price** — both derive from the same
  quote, and the app's price step was already correct.

**Verified live (2026-09-16, S28BSW, node `1A00007000G`):** without the
parameter, "Renew the engine" returns `pricePence: 83400` and no parts fields;
with `parts=1` it returns `partsPence: 4726, totalPence: 88126`, matching the
website and the price step. The four rows on that level whose parts AAG can't
price carry neither field in both responses.

## Acceptance criteria

- [x] A repair row shows labour + parts as one figure, equal to what the price
      step charges for that job on its own.
- [x] A combined repair's option is priced across every job it books.
- [x] A row whose parts can't be priced keeps "£X + parts" rather than showing
      a total that is short — including moved-in leaves and combined repairs,
      which never carried the part groups that rule reads. *(Unit-tested.)*
- [x] A supplier that is down, slow or unconfigured leaves the level exactly as
      it read before. *(Bounded by `LEVEL_PARTS_BUDGET_MS`; unit-tested fold.)*
- [x] The mobile tree response is unchanged without `parts=1`, and carries the
      additive fields with it. *(Both arms checked live.)*
- [x] `tsc`, eslint on changed files, `npm test` (595 passing).
- [x] Verified end to end against live HaynesPro and AAG.

## Follow-ups

- Prices in **search results**, once the supplier-call volume is understood.
- The app sends `parts=1` and renders `totalPence`. **App repo.**
