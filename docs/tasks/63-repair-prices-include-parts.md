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
- **The mobile tree endpoint** (`GET /api/mobile/v1/repairs/tree`) does not pass
  `priceParts`, so its response is byte-for-byte what it was. See below.

## The mobile app

- **No schema migration. No response-shape change.** The route is untouched, so
  a phone on last month's build is unaffected.
- `partsPence` / `totalPence` are additive optional fields on `CatalogueNode`.
  When the app is ready to render a total instead of "+ parts", flipping
  `priceParts: true` in `app/api/mobile/v1/repairs/tree/route.ts` is the whole
  server-side change — worth doing *with* an app release rather than before
  one, since it adds supplier latency to that endpoint.
- Until then the app shows "+ parts" where the website shows a total. That is a
  difference in **detail, not in price**: both derive from the same quote.

## Acceptance criteria

- [x] A repair row shows labour + parts as one figure, equal to what the price
      step charges for that job on its own.
- [x] A combined repair's option is priced across every job it books.
- [x] A row whose parts can't be priced keeps "£X + parts" rather than showing
      a total that is short.
- [x] A supplier that is down, slow or unconfigured leaves the level exactly as
      it read before. *(Bounded by `LEVEL_PARTS_BUDGET_MS`; unit-tested fold.)*
- [x] The mobile tree response is unchanged.
- [x] `tsc`, eslint on changed files, `npm test` (592 passing).
- [x] Verified end to end against live HaynesPro and AAG.

## Follow-ups

- Prices in **search results**, once the supplier-call volume is understood.
- Flip `priceParts` on the mobile tree route when the app renders totals.
