# Task 45 — Link HaynesPro repairs to LKQ and AAG parts

**Status:** 🚧 In progress (2026-09-14). Built: the part-group table (0066, **applied**), automatic recording, name matching, the review page, and **parts inside each repair on the vehicle model page**, with the dearest part by default and a per-engine-variant "Change". **Migration 0067 not yet applied.** Not yet exercised by a signed-in admin.

Unblocked by Task 44 (HaynesPro production). This is item 3 of Task 43 ("repair → parts"), brought forward by Brad.

## Owner decisions (2026-09-14)

1. **Where it lives:** Vehicles → make → model → Repair times → a repair → that car's parts from LKQ and AAG. Revised from "a parts line on the global repair view" after review. The global `/admin/repairs` page shows no parts.
2. **Default part:** the best, highest-cost one, read as the dearest buyable part across both suppliers combined.
3. **Change:** lists every fitting part for that car from both suppliers.
4. **A change applies to that engine variant** (HaynesPro car type), not the whole model: parts differ by engine.
5. **Which registration prices a variant:** one a customer already looked up for that exact variant, or else one the admin enters. It's checked against the variant and remembered.
6. **LKQ mapping:** test `TecDocReferences`; failing that, name-match with admin review. It failed (below).
7. **Mobile app:** Brad prompts the app to regenerate types once the matches are being secured.

## Why it needs a person

HaynesPro says, per repair, which **TecDoc part groups** ("GenArts") it uses.
- **AAG** prices by part group directly.
- **LKQ** has its own 2,277 component numbers.

**`TecDocReferences` can't map them.** Its full schema has no part-group field, and the one live call (1 credit) returned `400 {"Message":"An error has occurred."}`.

**Name matching** on 107 part groups from BM19WKO:

| Result | Groups | Right? |
|---|---|---|
| Identical words, one LKQ component | 27 | Yes |
| Identical words, two LKQ components | 3 | Needs a pick |
| Close | 40 | About half |
| Weak | 37 | Mostly wrong |

A part group means the same thing on every vehicle, so each is decided **once**.

## What's built

### Part groups → LKQ (migration 0066, applied)

- **`part_group_links`:**
  - one row per part group: `unreviewed | confirmed (+ lkq_component) | no_match`;
  - admin-read RLS;
  - seeded with the 6 pairs verified in Task 42.
- **Suggestions are never stored.**
- **`lib/parts/part-group-match.ts`** (pure, tested):
  - word-set matching;
  - `autoMatchComponent` (only an unambiguous identical-words match);
  - `resolvePartGroupLink` → `confirmed | auto | no_match | unmatched | stale`.
- **`lib/parts/part-groups.ts`:**
  - `notePartGroups` records unseen part groups whenever `lib/haynespro/tree.ts` fetches repair nodes. It runs in `after()`: insert-only, never blocking, and switched off per instance if the table is missing.
  - `loadPartGroupLinks`.
- **`/admin/parts/groups`** (review page, linked from Parts):
  - tabs: needs a match / auto-matched / confirmed / no LKQ equivalent, with search;
  - Confirm, Use *suggestion*, Search LKQ (no credits), No LKQ equivalent, Undo;
  - actions in `app/actions/part-groups.ts`.
- **`scripts/seed-part-groups.mjs`** fills the list for one car (a metered HaynesPro walk).

### Parts inside a repair (migration 0067, not applied)

- **`repair_part_choices`:**
  - one row per `(car_type_id, node_id, genart_id)`, only when an admin changed the part;
  - holds supplier + part number (+ brand/description snapshot), **never price**;
  - admin-read RLS.
- **`lib/parts/supplier-lookup.ts`:** the LKQ and AAG lookups, **moved** out of `app/actions/lkq.ts` so `/admin/parts` and the repair view share one implementation. The one wording change is AAG's stale "waiting on their allowlist" hint.
- **`lib/parts/supplier-offer.ts`:** `dearestOffer`.
- **`lib/parts/repair-part-choice.ts`** (pure, tested): `selectRepairPart`. It uses the admin's choice when it's in today's results; otherwise the dearest, reporting a chosen part that has gone; otherwise none.
- **`app/actions/repair-parts.ts`** (admin-gated):
  - `loadRepairPartsAction`:
    - picks a saved reg for the variant (a customer's manual correction first) or takes a typed one;
    - proves it's this car type via `resolveVehicle`, which remembers a typed reg in `haynespro_vehicle_cache`;
    - fetches the repair node, resolves each part group's LKQ link, and warms the LKQ vehicle lookup once;
    - asks both suppliers per part group in parallel and applies the selection.
  - `chooseRepairPartAction` and `resetRepairPartAction`.
- **`vehicles/_components/repair-parts.tsx`:** a **Parts** button on each timed repair that names part groups, on the model page only. It shows:
  - a registration form when needed;
  - for each part group: its LKQ match status (with a link to match it), the part in use (Dearest / Chosen), each supplier's non-OK message, and **Change** (every fitting part, dearest first, "Use this") / **Use dearest**.
- **`repair-tree-panel.tsx`:** `LeafRow.partGroups` from the node's GenArts.

**Credits:** nothing is fetched until Parts is opened. LKQ costs 1 credit per new vehicle and 1 per new vehicle + component (cached 30 / 7 days). AAG is sandbox-only.

## Acceptance criteria

- [x] Part groups recorded as repairs are fetched; reviewable and matchable at `/admin/parts/groups`.
- [x] Matching never auto-confirms; ambiguous and close names need a person. *(Unit-tested against LKQ's real list.)*
- [x] A repair on a model page shows its parts from both suppliers for a registration proven to be that engine variant.
- [x] Default is the dearest buyable part across both suppliers; Change lists all fitting parts; the choice is per engine variant and stored by identity, not price. *(Unit-tested.)*
- [x] A chosen part missing from today's results falls back to the dearest and says so.
- [x] `/admin/parts` behaviour unchanged apart from sharing the lookup code.
- [x] `tsc` clean, eslint clean on changed files, `npm test` 475 passed, production build compiles.
- [ ] Migration 0067 applied. — **Owner.**
- [ ] Exercised by a signed-in admin on a real vehicle (e.g. the Vauxhall Crossland X 1.2, BM19WKO). — **Owner.**
- [ ] Matches reviewed for the common part groups. — **Owner, after seeding.**

## Open questions

- **Do auto-matched groups count** once parts reach quotes or bookings? Recommend confirmed only for anything customer-facing.
- **Does LKQ's `ShowPrice` include the surcharge?** (`docs/06-lkq-parts-api.md` §8 Q1.) This affects "dearest".
- **Who keeps the difference when a cheaper part is fitted than quoted?** (§8 Q8.) The dearest default sharpens it.
- **AAG prices are UAT sandbox data** until the demo call.

## Mobile app

**Two schema changes:** 0066 (`part_group_links`) and 0067 (`repair_part_choices`). The app re-runs `npm run db:types` after both are applied. Both tables are admin-only. No existing table, endpoint, response shape, booking status or customer-facing price changed.

## When complete
- [ ] Apply 0067; seed; review matches; exercise the Parts panel.
- [ ] Next: feed the chosen parts into quotes (Task 43 items 2 and 4). That is customer-facing and needs the open questions answered.
- [ ] Update `docs/HANDOFF.md`; commit.
