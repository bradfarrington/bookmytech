# Task 81: Hide repairs for parts a car doesn't have; hide switched-off repairs in the admin

**Status:** ✅ Complete (2026-11-18). No migration, no API shape change.

## 1. Repairs for parts the car doesn't have

Brad: "if that vehicle doesn't have rear discs - shouldn't the repair not show?" HaynesPro lists a model's repairs for every version of it. FN60KYP (Fiesta Mk VI 1.4, rear drums) offered "Renew the Rear Brake Pads and Discs" and "Renew the rear brake pads", which could only go to a quote.

`lib/parts/brake-layout.ts` reads discs or drums per axle from NAPA's answers, and only with evidence both ways, so a gap in NAPA's range still goes to a quote:
- **Drums on an axle:** NAPA's exact match (the standard quote, never the model-wide catalogue) lists discs (82) or pads (402), none on that axle, and NAPA lists drums (123) or shoes (70) there.
- **Discs on an axle:** the exact match lists discs or pads there, and NAPA answered about drums and shoes with none there.
- Both listed (handbrake shoes inside rear discs), or no answer: unknown, nothing hidden.

`quoteJobParts` reads the layout only when a brake part has no price on one axle (one extra cached lookup for drums and shoes). A part the car can't have is missing with `reason: "not_fitted"`: not estimated, not quoted. `priceLevelParts` returns those rows as `notFitted`, and `withLevelParts` leaves them out of the level and the search. That covers the website and the app's `/repairs/tree?parts=1` and `/repairs/search?parts=1`. A booking sent with such an id still gets "Get a quote".

Live: FN60KYP "pads discs" now finds only Front Brake Pads and Discs (£289.17). Its Brake pad group lists only the front pads, and its rear brake shoes (£139.96) still show. LP17BJY still lists both Pads and Discs (£393.39 / £309.46).

## 1b. Our categories with nothing for the car

Brad: "if a created group by us returns nothing for a vehicle it shouldn't show in the list." `getRepairCatalogueLevel` (`withoutEmptyCategories`, `categoryHasContent`) opens each of our categories on the level as the customer would: jobs with a time on this car, not hidden, and, with parts priced, not for a part the car doesn't have. A category with nothing is left out. A HaynesPro group inside counts as something; a category inside is checked the same way, 4 deep. Live: FN60KYP's top level no longer lists "Rear Pads and Discs" (its only repair is for rear discs; the car has drums). LP17BJY lists both.

## 2. Switched-off repairs hidden in the admin

Brad: "gareth has turn off loads of repairs globally that they wont be doing - rather than deleting them totally can we hide them from the admin UI please?"

`RepairTreePanel` leaves out repairs and groups switched off for every vehicle (`showSwitchedOff`, off by default). On a model's page, it leaves out those still hidden for that model: one the model switched back on still shows. Each level says how many are hidden there, with a link to show them (`?off=1`, kept while browsing) and hide them again. Nothing is deleted. Repairs → Hidden repairs still lists every one, with "Show again". Both `/admin/repairs` and `/admin/vehicles/[make]/[model]?tab=repairs`.

## Acceptance criteria

- [x] A repair for brake parts a car doesn't have isn't listed, on NAPA's evidence only
- [x] A gap in NAPA's range still goes to a quote
- [x] Our categories with nothing for the car aren't listed
- [x] Switched-off repairs hidden in the admin Repairs and model screens, with a link to show them
- [x] Tests: `brake-layout.test.ts`. 886 pass; `next build` passes; checked live on FN60KYP and LP17BJY
