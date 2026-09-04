# Task 26 — Our own layer over the HaynesPro repair tree: categories, moves, renames, combined repairs

**Status:** ✅ Complete (2026-09-04) — code complete on branch `task-24-multi-repair-bookings` (on top of Tasks 23 and 24). **Migration `0056` is NOT yet applied** (Brad, via Studio; needs `0055` first). Until it is, the catalogue is exactly HaynesPro's — the overlay loads as empty — and every control on `/admin/repairs` other than the hide switch fails with a toast. `tsc` clean, unit tests green, production build clean, lint clean on the changed files. **Not exercised in a browser this session** — the manual script is below.

## Why this exists

Gareth, via Brad (2026-09-04): "combine repairs so they become one and separate — brake pads and discs become one repair, then give the customer the option to choose front or back", and "rename the categories and move jobs around from one category to another". Then, on seeing the first Repairs screen: "in the same screen this is where we should be able to create / edit our own categories and move repairs out of one category into another … we need to be able to combine and then also have separates to give both options."

HaynesPro's tree is the only catalogue (Task 17) and it is theirs: ~43 groups per car, thousands of jobs, their names, their grouping. This task puts our layer over it without touching what HaynesPro prices.

## The model

Four small tables (`0056_repair_catalogue.sql`), all keyed on HaynesPro node ids — which mean the same job on every make (verified live, Task 23), so one overlay applies to every vehicle:

| table | one row is | customers see |
|---|---|---|
| `repair_catalogue_groups` | a category we created (`name`, `parent_id`) | a group with id `g:<uuid>` |
| `repair_catalogue_overrides` | a HaynesPro node with our `custom_name` and/or a new `parent_id` (null = where HaynesPro lists it) | the node under our name / in its new place, and gone from the old one |
| `repair_bundles` | a combined repair (`name`, `parent_id`, `is_active`) and its **pool** of jobs (`node_ids[]`, added once) | one card |
| `repair_bundle_options` | one bookable option of it (`label`, `node_ids[]` — a subset of the pool) | a button with a price, id `b:<uuid>` |

`parent_id` is `'root'`, a HaynesPro group id, or `g:<uuid>`. `booking_repairs` gains `item_id` / `item_label` so a line remembers the combined repair it came from.

**Composition** (`lib/catalogue/overlay.ts`, pure, unit-tested): a level = HaynesPro's nodes with our names, minus anything hidden or moved away; then anything moved in (a leaf only when this vehicle has a time for it); then our categories; then each active combined repair's options, priced from the same rule the quote uses and dropped when any of its jobs is hidden or missing on this vehicle. A category we created has no HaynesPro node behind it — its level is entirely what the overlay put there.

**Booking** (`lib/haynespro/repair-booking.ts`): the ids a customer chooses are *items* — a job id or a `b:` option id. `quoteRepairs` expands them (`expandCatalogueItems`) to HaynesPro jobs, dedupes a job two items share, prices the jobs as Task 24 does (each job's book time added, 1-hour minimum once; HaynesPro's basket total when the admin opted in), and keeps the item on every line. URLs, checkout and rebook carry item ids; `bookings.repair_node_id` stays the first HaynesPro job; `repair_description` summarises by item ("Brake pads & discs · Front + 1 more job"). Caps: 8 items, 16 jobs.

**Search**: HaynesPro's tree walk can't find a combined repair, so `searchRepairCatalogue` matches bundle names and option labels up front and prices them for the vehicle; renamed nodes match under our names.

## What shipped

### `/admin/repairs` — one screen (Brad: "remove these", the picker and the banner)

The reference-vehicle picker and the amber banner are gone; the tree opens on the saved reference vehicle (default the Golf VII) with a one-line footer saying times are for it. Every level has:
- **New category** (top right) — creates one under the level you're in.
- **Categories** as cards in a grid, at every level (Brad: "cards in a grid format … from the top level all the way down"): pencil to rename (HaynesPro's name stays as a hint, ↺ puts it back), the hide switch, **Move to…** (top level, any HaynesPro root group by our name, any category of ours), and **Open**. A category we created has rename, move and delete (its contents go back where they came from).
- **Timed repairs** as rows: rename, **Move to…**, **Combine…** (new combined repair from this job — name + first option label, e.g. "Brake pads & discs" / "Front" — or **Add to:** an existing combined repair), the hide switch.
- **Combined repairs** listed at this level as cards (Brad: "isn't it gonna be confusing having to do it twice for each option — could we not add the repairs into a combined job and then give the options"): rename, move, shown/hidden switch, delete. **Jobs in this combined repair** is the pool — chips with hours (remove with ×) and a **search box** that finds jobs by name on the reference vehicle and adds them with one click. **What customers can book** lists the options; each option is a set of tick boxes over the pool, with its job count and total hours. Adding a job to a combined repair with a single option ticks it there automatically; with several options the admin ticks where it belongs. **Add an option** (e.g. Front / Rear / All round). An option with nothing ticked is flagged and not shown to customers; removing a job from the pool unticks it everywhere.

Shared tree: `vehicles/_components/repair-tree-panel.tsx` — the model page renders the same composed catalogue read-only (renamed, moved, categories, combined repairs all visible) with this-model-only toggles. Actions: `app/actions/repair-catalogue.ts` (admin-gated, service-role writes, revalidate both admin areas and `/book/repairs`); the card's search is `searchJobsForBundle` → `searchJobsForCarType` in `lib/haynespro/catalogue.ts`, the customer search's walk on the reference vehicle with nothing hidden and no bundles. Controls: `repairs/_components/{inline-name,node-controls,bundle-card,job-search,use-catalogue-action}.tsx`.

### Customer funnel

- `/book/repairs`: a combined repair is one card ("Combined repair · choose an option") with a button per option — "Front · £x", "Rear · £x" — or a single button when it has one option. Categories we created are ordinary groups. Renamed jobs show our names.
- `/book/match`: a combined repair is one line group — its name, the jobs beneath with their times, one Remove.
- Checkout recap, price summary and confirmation group jobs under the combined repair's name.
- Dashboard: the card lists each chosen item by name; "Book again" carries item ids.
- Mechanic offer and job detail, admin job detail: the real jobs, each tagged with the combined repair it came from.

### Mobile API (additive only — AGENTS.md)

- `/repairs/tree` and `/repairs/search` nodes may carry ids `g:…` (a category — drill in as usual) and `b:…` (a combined repair's option — quote and book it like any repair), and additive fields `bundleId`, `bundleName`, `optionLabel`, `custom`. Old builds render them as plain groups and repairs, which works.
- `/quote`, `/checkout/prepare`, `/bookings` accept `b:` ids in `repairNodeId` / `repairNodeIds` transparently. A `repairNodeIds` `/quote` gains `items[]`, and its `lines` carry `itemId` / `itemLabel`.
- `booking_repairs` rows gain `item_id`, `item_label`. Migration `0056` → `npm run db:types`.

### Tests

`lib/catalogue/overlay.test.ts` (composition: renames, moved away/in, categories, options priced/dropped, single-option naming, empty overlay; extra ids; expansion incl. refusals), `lib/haynespro/repair-booking.test.ts` (items, dedupe, summary), `lib/bookings/repair-lines.test.ts` (`groupRepairLines`).

## How to verify (after `0055` and `0056`)

1. `/admin/repairs` → no picker, no banner. **New category** → "Brakes & tyres" → appears as "Your category". Pencil on "Brakes (Mechanical)" → "Brakes" → the tree and `/book/repairs` show "Brakes".
2. Open Brakes → Brake pad → on "Renew the rear brake pads" choose **Move to… → Brakes & tyres (your category)** → it leaves this list ("Moved here" caption in the category).
3. On "Renew the front brake pads" choose **Combine… → New combined repair from this job** → name "Brake pads & discs", option "Front" → card appears under Brake pad; the pool holds that job and Front has it ticked. In the card's search box type "front brake discs" → **Add** "Renew both front brake discs" → it joins the pool and (one option) is ticked on Front. Search "rear brake" → add rear pads and rear discs → in the pool, unticked (nothing auto-ticks once there are two options — add the Rear option first if you prefer). **Add an option** "Rear" → tick rear pads and rear discs; Front stays as it was. Optionally **Add an option** "All round" and tick all four. Open Brake disc in the tree → **Combine… → Add to: Brake pads & discs** also drops a job into the pool. Move the card to Brakes & tyres.
4. Customer `/book/repairs?reg=<Golf VII reg>` → root shows "Brakes" and "Brakes & tyres"; inside Brakes & tyres: the moved rear pads, and the "Brake pads & discs" card with Front / Rear buttons priced at the sum of their jobs (Front = 1.1 + 0.8 = 1.9 h). Brake pad still lists the separate front pads. Search "pads discs" on the app finds the two options.
5. Book Front + "Renew the rear brake pads": match shows "2 jobs in one visit" with "Brake pads & discs · Front" over its two jobs and one Remove; slot header "2 jobs"; confirmation lists "Brake pads & discs · Front (Renew both front brake discs, Renew the front brake pads)". DB: three `booking_repairs` rows, two with `item_label`; `repair_description` = "Brake pads & discs · Front + 1 more job".
6. Mechanic offer and job detail list the three real jobs, two tagged "· Brake pads & discs · Front". Admin job detail likewise.
7. Hide "Renew both front brake discs" for all vehicles → the Front option disappears for every customer; show it again → back. Switch the bundle off → the card disappears; on → back.
8. Delete the category → the rear pads are back under Brake pad, the combined repair at the top level.
9. `/admin/vehicles` → Golf VII → Repair times shows the same composed tree read-only, with this-model toggles.

## Known limitations

- Ordering: our categories and combined repairs list after HaynesPro's nodes at a level, in creation order. No drag-to-reorder yet.
- The card's search walks the reference vehicle's tree best-first with the same cap as the customer search, so an unusual job may need a more specific phrase ("closest matches" is shown when the walk stopped early).
- Moving a HaynesPro *group* moves the branch; its children keep HaynesPro's grouping beneath it.
- The admin tree shows times for the reference vehicle; an option's price for a customer is for their car.

## Mobile app (per AGENTS.md)

Migration `0056` → `npm run db:types`. Everything on the wire is additive (above). The app should treat any node id as opaque (some now start with `g:` or `b:`) and may group a bundle's options under `bundleName` when it wants the nicer layout.

## When complete

- [x] Update this file's status + acceptance boxes.
- [x] Update `docs/HANDOFF.md`, `docs/02-data-model.md`, `docs/tasks/18-mobile-api.md`.
- [ ] Apply migration `0056` (Brad, via Studio).
- [x] Commit.
