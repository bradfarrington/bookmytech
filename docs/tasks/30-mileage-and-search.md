# Task 30 — Mileage box for mechanics; a search bar on the customer's repair browser

**Status:** ✅ Complete (2026-09-08) — on branch `task-30-mileage-and-search`. **Migration `0059` (one additive column, `bookings.mileage`) must be applied before this code is deployed.** `tsc` clean, 262 unit tests (3 new), lint clean on every touched file, production build compiles. **The search bar was exercised in a real browser** (dev server + Playwright against live HaynesPro on `S28BSW`: browse list, too-short hint, "Closest matches" for "brake pads" with the combined repair first, clear restores the list, no console errors). **The mileage field has not been exercised in a browser** — step 2 of "How to verify" is still to be run. Deviations from the plan: none.

## Why this exists

Two of the twelve items in Gareth's change list (email, 2026-09-08 — the full list and the
plan for all of it is in `~/.claude/plans/` and summarised in `docs/HANDOFF.md`):

- **"Add a mileage box for mechanics."** Nothing captured an odometer reading anywhere:
  DVLA VES doesn't return one and the DVSA MOT client only reads the model. A service
  record without mileage is worthless, and Task 32 (service checklists and inspection
  reports) needs it.
- **"Search bar so the customer can search for the job they need easier."** The web
  repair browser was drill-down only. The mobile app has had keyword search since Task 18
  (`GET /api/mobile/v1/repairs/search`); the website never got it.

A third item — "delete the signature part from mechanics booking" — is **parked** (Brad,
2026-09-08: "keep it for now and we will come back to this"). Nothing signature-related
changed.

## Owner decisions (Brad, 2026-09-08)

- **Mileage is the mechanic's to enter, on the job page**, from acceptance until
  completion. Optional on a repair; Task 32 makes it required before a servicing or
  inspection job can be completed.
- Signature stays.

## What shipped

### Mileage

- **`0059_booking_mileage.sql`** — `bookings.mileage integer`, CHECK `null or 0..1,500,000`,
  column comment. Additive; NULL on every existing row.
- **`lib/mechanics/owned-booking.ts`** — the service-role "re-read and confirm this mechanic
  holds the booking" check, extracted from `app/actions/job-media.ts` (which now imports it)
  so the mileage action, and Tasks 32–33's checklist and quote actions, share one copy.
- **`setJobMileage(bookingId, mileage)`** in `app/actions/job-progress.ts` — `requireMechanic()`
  → `ownedBooking()` → status ∈ `confirmed | en_route | in_progress` → whole number in range
  → `update bookings set mileage`. Not a transition, so no `booking_events` row of its own;
  `completeAndCharge` now carries `mileage` in its `status_changed` payload so the audit
  trail has the figure as it stood at completion.
- **Mechanic job page** — new `_components/mileage-field.tsx` in its own "Mileage" card in
  the side column above Actions: numeric input + Save while the job is active, read-only
  ("62,410 miles" / "Not recorded") afterwards. Takes a `required` prop for Task 32's hint.
  `page.tsx` selects `mileage`; `job-detail.tsx` gained `mileage` / `mileageRequired` props.
- **Admin job detail** (`/admin/jobs/[id]`) — a "Mileage" row in Vehicle & repair.
- **Receipt email** — `job_complete` gained a `mileage_line` variable and a `mileage_line`
  custom block (`emails/custom-renderers.ts`) that renders nothing when unset; the admin
  email editor shows the new variable automatically.

### Search bar (website)

- **`lib/bookings/repair-hrefs.ts`** (pure, tested) — `buildRepairHrefs`, `parseCrumbs`,
  `serialiseCrumbs`: every link the browser builds (`base`, `groupHref`, `crumbHref`,
  `bookHref`, `continueHref`), pulled out of `repair-browser.tsx` so the server list and the
  client search results build identical links.
- **`repairs/_components/repair-rows.tsx`** — the level renderer (`toRows` + `RepairRows`),
  pulled out of `repair-browser.tsx` with no directive so both the server browse list and the
  client search box render a hit exactly like a browsed row.
- **`app/actions/repair-search.ts`** — `searchRepairsAction({ reg, query })`, a thin wrapper
  over `searchRepairCatalogue` (the same walk behind the mobile route). It counts against
  **the same rate-limit buckets** as the mobile search (`catalogueLimitRules` /
  `catalogueLimitMessage`, extracted from `lib/mobile/catalogue-limits.ts`; the mobile
  `enforceCatalogueLimits` is unchanged in behaviour): the walk can cost dozens of metered
  HaynesPro calls and the action is callable by anyone with the funnel open.
- **`lib/haynespro/search-query.ts`** — `MIN_SEARCH_QUERY_LENGTH = 3`, re-exported from
  `catalogue.ts` and now used by the mobile route too (it had its own copy).
- **`repairs/_components/repair-search.tsx`** (client) — the box above the breadcrumbs:
  350 ms debounce, latest-wins, `type="search"` with a clear button. While a query of 3+
  characters is active the results replace the browse list ("N matches" / "Closest matches"
  when the walk was truncated / "No matches" / the rate-limit sentence); clearing brings the
  server-rendered list straight back with no server round-trip. A group hit links into that
  group with a single crumb (the walk doesn't record the path down to it).
- `repair-browser.tsx` is now composition only: banner, `<RepairSearch>` wrapping
  breadcrumbs + `<RepairRows>`, caption, sticky trolley.

## How to verify

1. Apply `0059` (Studio → SQL, paste the file). It is idempotent.
2. **Mileage.** As a mechanic with a `confirmed` job: the Mileage card shows the input →
   type `62410` → Save → toast, card reads "Recorded: 62,410 miles". Type `-1` or `abc` →
   refused. Complete the job → `booking_events.status_changed` payload has `"mileage": 62410`;
   the receipt email shows "Mileage recorded: 62,410 miles". `/admin/jobs/<id>` shows the row.
   A completed job shows the value read-only; one with none shows "Not recorded".
3. **Search.** `/book/repairs?reg=<a reg that resolves>` → the box sits above the
   breadcrumbs. Type `br` → "Keep typing" hint, list still visible. Type `brake pads` →
   spinner, then priced rows with the same £ button as browsing; "Closest matches" if the
   walk stopped early. Click a group hit → drills into that group with one crumb. Clear (×
   or "Browse instead") → the browse list returns instantly. With `repairs=` already set
   (adding a job), hits show "Add" and "Added" exactly as browsing does. Hammer the box →
   after the burst bucket, the rate-limit sentence.
4. **Mobile regression.** `GET /api/mobile/v1/repairs/search?reg=…&q=br` → 400 "Type a little
   more…"; `q=brake` → the unchanged `CatalogueSearch` shape.

## Acceptance criteria

- [x] A mechanic can record the vehicle's mileage on an active job and it persists
- [x] Mileage is visible to the admin and on the customer's receipt email
- [x] Completion records the mileage in the audit trail
- [x] The website's repair browser has a search box that finds priced jobs for this car
- [x] Search results use the same rows and links as browsing (one renderer, one href builder)
- [x] Web search counts against the same rate limits as the mobile search
- [x] Unit tests for the href builder
- [x] Search exercised end-to-end in a browser (Playwright, live HaynesPro)
- [ ] Mileage exercised in a browser — step 2 above still to be run (needs a mechanic session with an active job)

## Follow-ups

- **Task 32** makes mileage required before completing a servicing / inspection job
  (`mileageRequired` prop and the server gate).
- The reminders engine (`lib/reminders/schedule-booking.ts`) could key annual-service and
  mileage-interval reminders on this column; `REMINDER_BOOKING_SELECT` doesn't read it yet.
- The search query isn't in the URL, so back/forward returns to the browse state, not the
  search. Fine for now; `?q=` is a small addition if wanted.

## Mobile app (per AGENTS.md)

1. **Migration `0059`** → `npm run db:types`. `bookings.mileage` is a new optional column
   the app reads raw; render it on the booking detail when non-null ("Mileage recorded:
   62,410 miles"). Nothing breaks if it isn't rendered.
2. `booking_events.status_changed` payloads on completion now carry `mileage` (may be null).
3. `GET /api/mobile/v1/repairs/search` — no shape change. The minimum query length is still
   3; the constant moved, the value didn't.
4. No new endpoints, no request/response shape changes.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
