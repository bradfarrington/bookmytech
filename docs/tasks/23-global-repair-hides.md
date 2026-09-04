# Task 23 — Hide a repair for all vehicles, with per-model overrides

**Status:** ✅ Complete (2026-09-04) — merged to `main` 2026-09-04 (branch `task-23-global-repair-hides`). **Migration `0054` is NOT yet applied** (Brad, via Studio). Until it is: model-scope toggles keep working exactly as before (rows without a `mode` column read as hides), but switching anything off for *all vehicles* or switching a globally hidden repair back on for one model fails with a toast (the upsert names the missing column). `tsc` clean, 191 unit tests (7 new), production build clean, lint unchanged from baseline. **Not exercised in a browser this session** — the manual script is below.

## Why this exists

Gareth finds the customer repair list too long. Since Task 17 the booking flow shows HaynesPro's raw repair-times tree for the car — ~43 top-level groups, thousands of timed jobs — and the only curation tool was the per-make/model toggle from Task 16 Stage G: a `repair_vehicle_exclusions` row per (make, model, node). Hiding "Body - Exterior" meant visiting every model page in turn. He asked for a way to switch a repair off **once, for every vehicle**, and (Brad, 2026-09-04) to **keep the per-vehicle toggles so a model can override the global setting**.

## Owner decisions (Brad, 2026-09-04)

- **Global hides only.** The raw HaynesPro tree stays the customer's list; no curated menu; nothing pre-hidden. Gareth switches things off himself.
- **Per-model overrides in both directions**: a model can hide something extra, and a model can show something hidden for all vehicles.
- Multi-job bookings (discs + pads in one visit) are **Task 24**; the mechanic disputes area is **Task 25**.

## The rule

Rows in `repair_vehicle_exclusions` (0039) now come in three kinds — `mode` added by `0054_repair_exclusion_mode.sql`:

| row | means |
|---|---|
| `('*', '*', node, 'hide')` | hidden for **all vehicles** |
| `(make, model, node, 'hide')` | hidden for that model (unchanged behaviour; every pre-0054 row is this) |
| `(make, model, node, 'show')` | **override** — shown on that model despite a global hide |

Effective hidden set for a vehicle = **(global hides − this model's `show` rows) ∪ this model's `hide` rows**. Globals apply even when the reg didn't resolve to a model label; per-model rows only on the normalised label match Task 16 already used. Partial wildcards (`'*'` + a real model) match nothing and the action refuses to write them. The unique key `(make_name, model_name, node_id)` is unchanged: a model holds one row per node and its `mode` flips.

**Why wildcard rows rather than a new table:** same unique key, same admin SELECT policy, same service-role writes, same action, and the sentinel is inert to code that predates it (`normaliseLabel("* *")` never equals a model label), so rows can exist before deploy or after a rollback with no effect. The only schema change is one column with a default.

## Verified live first: a node id is the same job on every make

Global hides key on the HaynesPro node id alone, which is only sound if `1M01510000WV0` means "Renew the front brake pads" on a Ranger as well as a Golf. `scripts/verify-repair-node-ids.mjs` proved it on 2026-09-04 against **VOLKSWAGEN Golf VII 1.0 TSI** (repairtimeTypeId 115566) and **FORD Ranger 2.2 CIS** (24602):

- Root groups: 43 vs 42, **42 ids in both, every one with the same description** (the Golf alone has `1N4` ADAS).
- Brakes is `1M2` on both; under it 107 leaf ids are shared and all describe the same job — HaynesPro decorates some with a trailing `*` or a variant qualifier ("Renew the brake servo *Manual transmission, RHD*"), which the script normalises away.
- "Renew the front brake pads" is `1M01510000WV0` on both (0.8 h on the Golf, 1.0 h on the Ranger — different times, same job), and `getRepairtimeNodesV4` on the Ranger with the Golf's id returns that job with a time — exactly the lookup `quoteRepair` does.
- The id doubles as the `awNumber`. Group ids (`1M2`) are not prefixes of their leaves (`1M015…`), so "is this leaf under a hidden group?" still cannot be answered from ids alone (see Known limitations).

Rerun any time with `node scripts/verify-repair-node-ids.mjs` (or `--types <idA>,<idB>` / `--a "MAKE|Model" --b …`). The REST helpers it uses live in `scripts/lib/haynespro-rest.mjs` and share the app's persisted VRID, so the script never invalidates a live session.

## What shipped

### Matcher — `lib/haynespro/exclusions.ts`

`excludedRepairNodeIdsForLabel(label, rows)` implements the rule above (pure, unit-tested); `excludedRepairNodeIdsForVehicle` no longer short-circuits on an empty label (globals are unconditional) and reads `select("*")` rather than naming `mode`, so the deploy window before `0054` is applied cannot switch every hide off (Postgres would otherwise resolve a missing `mode` column as the `mode()` aggregate and error). New exports for the admin page: `GLOBAL_SCOPE`, `isGlobalExclusionRow`, `exclusionStateForModel` (the same partition, keyed by the make/model names the page holds — it used to compare raw strings while the funnel normalised), `nodeAvailability` → `shown | hidden_model | hidden_global | shown_override`, `isNodeVisible`.

**No change at the three enforcement points** — browse (`catalogue.ts`), search (a globally hidden group also prunes the walk) and `quoteRepair` all consume the same set. **No change to the mobile API**: `/repairs/tree` and `/repairs/search` simply omit more nodes.

### Action — `app/actions/vehicle-exclusions.ts`

`setRepairVehicleAvailability(target & { nodeId, description?, available })` with `target = { scope: "global" } | { scope: "model", makeName, modelName }`. Global off → upsert the `'*'` hide; global on → delete it **and every `show` override for that node** (they only existed to punch through it). Model → the server reads whether a global hide exists, then: on = override row if globally hidden, else delete the model row; off = delete the override if globally hidden (back to the default), else a model hide. The client only ever says "available: yes/no". Model names equal to `'*'` are refused. `revalidatePath("/admin/vehicles", "layout")`.

### Admin

- **Repairs tab** (`/admin/repairs`, in the sidebar under Commercial — Brad, later on 2026-09-04: "a repairs tab so we can control the globals there rather than go into a vehicle and choose"): the HaynesPro tree with switches that hide for **every vehicle**, browsed on a **reference vehicle** (default the VW Golf VII 1.0 TSI both verification scripts used; a make → model → engine picker changes it and "Save as default" remembers it in `platform_settings.repair_reference_vehicle`). Any well-covered car works because a node id means the same job on every make. A count card links to the review page. The tree itself is the shared `vehicles/_components/repair-tree-panel.tsx` (`RepairTreePanel`, `target` = global or model).
- **Model page** (`/admin/vehicles/[make]/[model]?tab=repairs`): **this model only**. Every toggle stays live and shows the *effective* state for that model, with a caption where the switch alone can't explain it: 🔒 "Hidden for all vehicles" (links to Repairs), "Shown for this model · hidden elsewhere", "Hidden from customers". Switching a globally hidden job on here writes a per-model override. `RepairToggle` takes `target` instead of make/model names.
- **Review page** `/admin/repairs/hidden`: every global hide (description, node id, since date, and "Shown on: …" listing the models that override it) with a **Show again** button (`show-again-button.tsx` — refreshes rather than the optimistic tick, so the row leaves the list), then the per-model hides grouped by model. Top-bar crumbs for `/admin/repairs`, `/admin/repairs/hidden` and `/admin/vehicles` (missing before).
- No per-instance cache on the exclusion read: one small query per catalogue call, and a cache would make hide-then-check take a minute.

## How to verify (once `0054` is applied)

1. `node scripts/verify-repair-node-ids.mjs` → PASS.
2. `/admin/repairs` (opens on the Golf VII) → amber banner. Switch off **Body - Exterior** and, under Brakes (Mechanical) → Brake pad, **Renew the front brake pads**. Both ticks empty. Pick a different make/model/engine in the picker → the tree re-renders for it, the same two are still off; "Save as default" remembers the choice.
3. `/admin/vehicles` → Volkswagen → Golf VII → Repair times → both dimmed with 🔒 "Hidden for all vehicles". Switch front pads **on** → caption "Shown for this model · hidden elsewhere".
4. `/admin/repairs/hidden` → both listed; front pads shows "Shown on: VOLKSWAGEN Golf VII"; the Repairs page's card says "2 repairs hidden for all vehicles".
5. Ford → Ranger → Repair times: both hidden, no override.
6. Customer site `/book/repairs?reg=<a Ranger reg>` → no Body - Exterior at the root; under Brakes → Front brakes the front-pads leaf is gone, rear pads present. `/book/repairs?reg=<a Golf VII reg>` → front pads present.
7. `/book/match?reg=<Ranger reg>&repair=1M01510000WV0` bounces back to the browser (refused quote); the Golf VII one prices.
8. `curl "$HOST/api/mobile/v1/repairs/tree?reg=<Ranger reg>"` and `…/repairs/search?reg=…&q=brake%20pads` agree with the website; response shape unchanged.
9. **Show again** on the review page for front pads → row gone; the Golf's override is gone too; step 7 quotes on the Ranger again.
10. Toggle something off in model scope on a model with no global hide → `select * from repair_vehicle_exclusions where make_name = '*'` shows no new row; the model row has `mode = 'hide'`.

## Acceptance criteria

- [x] A repair or group can be switched off for all vehicles from any model page
- [x] A model page can switch a globally hidden repair back on for that model only, and hide extra ones
- [x] Browse, search and quote all honour the effective set; a stale URL to a globally hidden leaf refuses to price
- [x] A review page lists everything hidden globally, which models override each, and can show it again
- [x] Node-id stability across makes verified live (script + result recorded above)
- [x] Unit tests for the matcher and the admin partition (7 new, 191 total)
- [x] `tsc`, production build and lint clean (lint unchanged from baseline)
- [ ] Exercised in a browser end-to-end — **deferred**, needs `0054` applied; script above

## Known limitations

- `quoteRepair` checks only the leaf (unchanged from Task 16): a crafted `/book/match?repair=<leaf>` under a globally hidden **group** still prices, because a leaf's ancestors aren't knowable from its id. Hiding the group already removes every path a customer could take to it.
- A `show` override is silently removed when its global hide is lifted. If Gareth later re-hides the same node globally, previous overrides do not come back.

## Follow-ups

- Task 24 — multi-job trolley. Task 25 — mechanic disputes area.
- If HaynesPro ever renames an id in a quarterly update the global row stops matching (fails open, the repair shows again), same as per-model rows — the review page makes that visible.

## Mobile app (per AGENTS.md)

- **Migration `0054`** adds `repair_vehicle_exclusions.mode` → `npm run db:types` in the app. The app never reads this table.
- **No request or response shape changed.** `/repairs/tree` and `/repairs/search` return the same `CatalogueLevel` / `CatalogueSearch` unions with fewer nodes; a phone holding a now-hidden node id gets the same `not_priceable` answer from `/quote` that per-model hides already produced.

## When complete

- [x] Update this file's status + acceptance boxes.
- [x] Update `docs/HANDOFF.md` (Current task) and `docs/02-data-model.md`.
- [ ] Apply migration `0054` (Brad, via Studio).
- [x] Commit.
