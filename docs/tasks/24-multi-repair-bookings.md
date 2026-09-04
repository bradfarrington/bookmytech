# Task 24 — Several repairs in one booking (the trolley)

**Status:** ✅ Complete (2026-09-04) — code complete on branch `task-24-multi-repair-bookings` (stacked on `task-23-global-repair-hides`). **Migration `0055` is NOT yet applied** (Brad, via Studio). The single-job path never touches the new table or column, so the code is safe to deploy first; a multi-job booking attempted before `0055` fails at the lines insert, is rolled back, and the customer sees "please try again" with a live hold (the existing orphaned-hold path) — apply the migration first. HaynesPro's basket calculation verified live (below). `tsc` clean, unit tests green (new suites listed below), production build clean, lint unchanged from baseline. **Not exercised in a browser this session** — the manual script is below.

## Why this exists

Gareth: "brake pads and discs — they might want to do those together, but they can't without booking twice." Brad: "someone chooses an alternator, then they should be able to add additional work, in the same time slot… four or five jobs in a trolley ready to book for a mechanic." Every layer assumed one repair per booking: the URL (`repair=`), `quoteRepair(reg, nodeId)`, the Stripe hold, `bookings.repair_node_id`, ~30 display surfaces and the mobile API.

## Owner decisions / rules (Brad, 2026-09-04)

1. **Labour = each job's book time, added up, × hourly rate.** Brad, after the first build: "if we add two jobs together it should charge for both, not just one." HaynesPro's overlap-removed basket total (below) is kept as an **admin option** — `/admin/pricing` → "Several jobs in one booking" → "HaynesPro combined (overlap removed)" — stored in `platform_settings.repair_combine_mode`; the default is "Add each job's book time".
2. **The 1-hour minimum applies once to the whole visit**, not per job. Five 0.2 h jobs bill 1 h. (Gareth can veto.)
3. **Cap: 8 jobs** (`MAX_REPAIRS_PER_BOOKING`).
4. In the HaynesPro mode, if the basket call fails the times are **added** (`combine_source = 'sum'`) — the funnel never blocks on it. The admin job detail shows which happened.
5. One job prices exactly as before: no basket call, identical figures.
6. No parts line, and no "parts agreed with your mechanic" wording anywhere — a parts API is coming. Commission via the unchanged `computePrice`.

## Verified live: HaynesPro can combine overlapping jobs (the optional mode)

`processRepairTasksV4` — HaynesPro's basket calculation — is licensed on our account and works (probed 2026-09-04 on a **VW Golf VII 1.0 TSI**, repairtimeTypeId 115566; `scripts/verify-repair-combination.mjs` reproduces it). It is only used when the admin setting is switched to it:

| basket | HaynesPro `totalRepairTime` | per item `calculatedTime` |
|---|---|---|
| Renew both front brake discs (1.1 h) + Renew the front brake pads (0.8 h) | **1.1 h** (a plain sum is 1.9 h) | discs 1.1 h · pads **0** |
| Renew the front brake pads alone | 0.8 h — identical to `getRepairtimeNodesV4` | — |
| front pads + rear pads | 1.6 h — a plain sum, nothing overlaps | 0.8 · 0.8 |

Request/response shape is recorded in `docs/04-supplier-apis.md` §3 item 10. Two facts shaped the design: the reply is an **object**, not the array most repair-time ops return, and it does **not** say which item absorbed a zeroed line — so the customer-facing label is "No extra time — covered by the other work", never "included with X".

## What shipped

### Pricing core

- `lib/haynespro/combine.ts` — `parseProcessRepairTasks(payload, requestedIds)`, pure: null (→ sum fallback) on a bad envelope, non-zero status, a requested id missing or duplicated, bad times. Items matched by id.
- `lib/haynespro/tree.ts` — `combineRepairTimes(repairtimeTypeId, nodeIds, labourRatePence)`, memoised 1 h on the sorted ids (the rate is not in the key: only times are used; money always comes from `computePrice`).
- `lib/haynespro/repair-booking.ts` — `quoteRepairs(reg, nodeIds, db)` → `RepairsQuote { nodeIds, lines[{ nodeId, description, rawHours, chargedHours, linePence }], description (summary), combinedRawHours, billedHours, combineSource, breakdown }`; pure `buildRepairsQuote` does the assembly (unit-tested). All-or-nothing: one hidden/untimed id refuses the lot, as the hold and the insert re-quote. **`quoteRepair(reg, nodeId)` is now a thin wrapper** returning the unchanged `RepairQuote` — every existing caller and the mobile `/quote` are byte-identical for one job.
- `lib/bookings/repair-ids.ts` — the list as it travels: `repairs=a,b,c` on the URL (legacy `repair=a` still read everywhere, nothing writes it), `parseRepairIds`, `repairsQuery`, `repairIdsFromInput`, `readRepairIdList` (JSON bodies), `MAX_REPAIRS_PER_BOOKING`.
- `lib/bookings/repair-lines.ts` — `repairSummary(descs)` → "X" / "X + 1 more job" / "X + 2 more jobs"; `repairLinesFor(booking, rows)` → the `booking_repairs` rows or one synthetic line, so every reader has one code path.

### Data — migration `0055_booking_repairs.sql`

`booking_repairs(booking_id, position, node_id, description, raw_hours, charged_hours, line_pence)` + `bookings.combine_source`. **No backfill**: no rows = a single-job booking. On a multi-job booking `repair_node_id` = the first job and `repair_description` = the summary, so the ~30 one-line readers (lists, CSV, disputes, resolutions, analytics, emails, texts) keep working unchanged. `service_duration_hours` = the combined billed hours (arrival-window clash detection reads it). Four SELECT policies — customer (id or guest email), assigned mechanic, **mechanic holding a live offer** (the offer screen must list the jobs before acceptance), admin; writes service-role only.

### Booking core — `lib/bookings/create-booking.ts`

`CreateBookingInput` / `PrepareCheckoutInput` gain optional `repairNodeIds` (`repairNodeId` still honoured). Both quote via `quoteRepairs`; the Stripe hold is the combined total. The insert names `combine_source` only on a multi-job booking (the column arrives with `0055`), then writes the `booking_repairs` rows; if that fails the booking row is deleted and the customer gets "We couldn't save the jobs on this booking. Please try again." The confirmation email gains a `repairs` variable rendered by a new `repair_list` block (bullets under the summary card; nothing for one job). SMS unchanged.

### Website funnel — URL state, single-job path unchanged

- `/book/repairs`: with `repairs=` in the URL it is the "Add another job" step — heading changes, a sticky "Your jobs (n) · £total · Continue" card, chosen leaves read "Added", the rest "£x Add"; "Add" disappears at the cap. A leaf with no trolley still goes straight to the price page.
- `/book/match`: several jobs list under the price with each one's time — in the HaynesPro mode a zeroed line reads "No extra time — covered by the other work" and a partial one "reduced, overlaps with other work" — a Remove link each, "Total book time … · billed as our 1-hour minimum" when it applies. Buttons: **Pick a time** and **Add another job**. Back goes to the browser with the trolley.
- `/book/slot` + checkout (`slot-picker.tsx`): header "3 jobs · reg"; the recap and the price summary list the jobs; the Stripe 3-DS `return_url` carries `repairs=`; a checkout draft parked by a pre-Task-24 build is upgraded on read so a customer at their bank during the deploy isn't stranded.
- `/book/confirmed/[id]` now names the repair(s) — it never did before.
- Stepper label "Repair" → "Repairs". Dashboard "Book again" rebooks every job (`repairs=`).
- **Copy change:** the price card's "Parts & labour included" bullet now reads "Labour included", and every "parts, if needed, are agreed with your mechanic" line on the price page and the repair browser is gone (Brad: a parts API is coming).

### Detail surfaces

Mechanic **offer screen** (a "Jobs (n)" card — the accept/decline decision needs all of them), mechanic **job detail** (list under the heading; duration stays the combined figure), **admin job detail** ("Repairs (n)" with book → charged hours and line price, plus a "Time combining" row that goes amber on `sum`), customer **active booking card** (compact list). Every surface reads `booking_repairs` in a **separate query** so it still renders before `0055` exists. The analytics service-mix chart buckets a multi-job booking under its first job (suffix stripped).

### Mobile API (additive only — AGENTS.md)

`POST /quote`, `/checkout/prepare`, `/bookings` accept optional `repairNodeIds[]` (wins over `repairNodeId`; 1–8). A `repairNodeId` request is answered byte-identically; a `repairNodeIds` `/quote` adds `lines`, `combinedRawHours`, `combineSource`. No new GET: the app nests `booking_repairs` on its `bookings` select under customer RLS. Detail in `docs/tasks/18-mobile-api.md` → "Task 24 additions".

### Tests

`lib/haynespro/combine.test.ts` (the live baskets as fixtures; every null path), `lib/haynespro/repair-booking.test.ts` (`buildRepairsQuote`: single = today's numbers, HaynesPro combine, sum fallback, **minimum applied once**, summary text), `lib/bookings/repair-ids.test.ts`, `lib/bookings/repair-lines.test.ts`. The Playwright funnel helper keeps working unchanged (leaf links still contain `/book/match`, "Pick a time" unchanged).

## How to verify (once `0055` is applied)

1. `node scripts/verify-repair-combination.mjs` → PASS (discs+pads 110 with pads 0; pads 80; front+rear 160).
2. `/book/repairs?reg=<Golf VII reg>&postcode=…` → Brakes (Mechanical) → Brake disc → "Renew both front brake discs" (£) → `/book/match?…&repairs=1M01822000WV0`: identical to before plus **Add another job**.
3. Add another job → heading "Add another job", sticky "Your jobs (1) · £…"; leaf buttons read "Add"; the discs row reads "Added". Brake pad → "Renew the front brake pads" Add → "2 jobs in one visit", pads line "No extra time — covered by the other work", price = 1.1 h × rate. Add "Renew the rear brake pads" → 3 jobs, combined 1.9 h.
4. Remove discs → 2 jobs, pads now 0.8 h. Remove until one is left → removing the last returns to the browser. Legacy `/book/match?reg=…&repair=1M01510000WV0` still prices.
5. Add 8 jobs → "Add" gone, cap note; a 9-id URL keeps 8.
6. Pick a time → header "3 jobs · <reg>"; recap + price summary list them; Stripe 3-DS test card `4000 0027 6000 3184` returns to `/book/slot?…&repairs=a%2Cb%2Cc` and completes; confirmation lists the three jobs.
7. DB: `select * from booking_repairs where booking_id = …` → 3 rows, positions 0–2, `charged_hours` 1.1 / 0 / 0.8; `bookings.repair_description` = "Renew both front brake discs + 2 more jobs", `service_duration_hours` 1.9, `combine_source` haynespro.
8. Email: summary row + "Jobs in this booking" bullets. SMS unchanged.
9. Mechanic offer screen shows "Jobs (3)" before accepting; after accepting, job detail lists them (`~1.9h`); `/admin/jobs/<id>` shows "Repairs (3)" and "HaynesPro combined the jobs". Arrival-window clash check uses 1.9 h.
10. Break the operation name in dev → the booking still completes with `combine_source` = sum and the admin row amber.
11. Mobile: `POST /quote {reg, repairNodeId}` byte-identical to a pre-change capture; with `repairNodeIds` returns `lines`; `/checkout/prepare` + `/bookings` with `repairNodeIds` create a 3-line booking; a customer token can `select *, booking_repairs(*) from bookings`.
12. Guest booking → confirmation lists the jobs; signing up later with that email → the dashboard card lists them and "Book again" carries `repairs=`.

## Acceptance criteria

- [x] A customer can add jobs from the price page and book them in one visit, one slot, one mechanic
- [x] Priced from HaynesPro's combined time; a covered job shows as no extra time; 1-hour minimum once
- [x] One job prices and books exactly as before (no basket call; mobile `/quote` byte-identical)
- [x] Lines stored per booking; every list/email/text keeps working off the summary string
- [x] Mechanic sees every job before accepting; job detail, admin detail, dashboard and confirmation list them
- [x] Old links (`repair=`), rebook links and parked checkout drafts keep working
- [x] Mobile API additive only; documented for the app
- [x] Unit tests for the parser, the quote assembly, the id helpers and the line helpers
- [x] `tsc`, production build, lint clean (baseline)
- [ ] Exercised in a browser end-to-end — **deferred**, needs `0055`; script above
- [ ] Verified against Stripe test mode with a 3-DS card — deferred with the above

## Known limitations

- **All-or-nothing quote.** One stale or hidden id refuses the whole trolley and the price page bounces to the browser (today's behaviour for one id). A follow-up could report which job failed and drop it.
- **Admin job search** (`lib/admin/job-filters.ts`) and the **brakes reminder** regex (`lib/reminders/schedule-booking.ts`) only see the summary string — a second job's name doesn't match.
- The basket can't name which job absorbed another, so lines say "covered by the other work".
- `service_duration_hours` is `numeric(4,2)` — fine at 8 jobs.

## Follow-ups

- Task 25 — mechanic disputes area.
- Gareth's next asks (2026-09-04): admin-defined **combined repairs** ("Brake pads & discs" with a Front/Rear choice) and **renaming categories / moving jobs between them** — a curated overlay on the HaynesPro tree. Both sit on this task: a bundle is a named set of node ids priced through the same basket, and a moved/renamed node is an override applied in `lib/haynespro/catalogue.ts`. Needs its own spec (proposed Task 26).

## Mobile app (per AGENTS.md)

- **Migration `0055`** — new table `booking_repairs`, new nullable `bookings.combine_source` → `npm run db:types`.
- **Additive fields**: `repairNodeIds[]` on `/quote`, `/checkout/prepare`, `/bookings`; `lines`, `combinedRawHours`, `combineSource` on a `repairNodeIds` `/quote`. Old builds send `repairNodeId` and get exactly what they always did.
- **App-side work to build the trolley**: an "add another job" flow that collects node ids, sends `repairNodeIds`, and renders `quote.lines`; booking screens nest `booking_repairs(position, description, charged_hours)` on their `bookings` select and fall back to `repair_description` when empty.
- `repair_description` on a multi-job row is a summary ("X + 2 more jobs"); the displayed figures for a multi-job quote are combined (1-hour minimum once).

## When complete

- [x] Update this file's status + acceptance boxes.
- [x] Update `docs/HANDOFF.md`, `docs/02-data-model.md`, `docs/04-supplier-apis.md`, `docs/tasks/18-mobile-api.md`.
- [ ] Apply migration `0055` (Brad, via Studio).
- [x] Commit.
