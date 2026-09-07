# Task 28 — Customer offers several all-day dates; mechanic picks one day + a 2-hour window

**Status:** ✅ Complete (2026-09-07) — code complete on branch `task-28-flexible-days`. `tsc` clean, 259 unit tests (17 new), lint unchanged from baseline, production build compiles. **Migration `0057` is NOT yet applied** (no SQL access from this checkout — Brad applies it; it must be in before this deploys, see "Storage"). **Not yet exercised in a browser** — the manual script is under "How to verify". Deviations from the plan: none.

## Why this exists

Ask from Brad (2026-09-07): a customer who is flexible should be able to offer **several all-day dates** rather than one, and the mechanic then picks one of those days and a 2-hour window — exactly what Task 21 does for a single all-day day, with a day choice in front of it.

## Owner decisions (Brad, 2026-09-07)

- **Day + window together.** One action, one shot (same as Task 21). Skippable as today: the job stays "any of these days" until they pick.
- **Earliest offered day is the fallback date.** Until the mechanic picks, the booking sorts under, and the 24-hour cancellation-fee boundary is measured against, 8am on the earliest offered day.

## What shipped

### Storage — one additive column (`0057`)

`bookings.candidate_days date[]`, CHECK `null or ≥ 2 entries`. PostgREST returns it as `"YYYY-MM-DD"` strings — the same UK calendar key `lib/slots.ts` already uses.

Invariants:

- A **flexible** booking = `candidate_days` non-null **and** `slot_window = 'All day (8am–8pm)'` (`isFlexibleBooking` in `lib/slots.ts`). `scheduled_at` = 8am UK on the **earliest** candidate day, so ordering, day grouping, `feeFor`, the crons and the mobile app keep working unchanged.
- The mechanic's pick (`setArrivalWindow(bookingId, window, dayKey)`) sets `scheduled_at` to that day's window start, `slot_window` to the 2-hour label and `candidate_days` to **null**, in one guarded UPDATE (WHERE still `slot_window = all-day`). The offered set is kept in the `arrival_window_set` event payload (`candidate_days`); no new event type, so no CHECK change.
- Both paths that null `slot_window` — the customer's own reschedule and an accepted mechanic proposal (`lib/bookings/manage-booking.ts`) — null `candidate_days` too.

**Deploy order:** `0057` before the code. `createBooking` only names the column when it has days, and the sibling-clash query falls back to the old column list if the column is missing, but `manage-booking`'s two updates name `candidate_days` unconditionally and would fail against a schema without it.

### Shared helpers — `lib/slots.ts`

`MAX_CANDIDATE_DAYS = 7`, `isDayKey`, `isFlexibleBooking`, `normaliseCandidateDays` (valid keys, deduped, sorted, passed days dropped, capped, null for < 2), `formatCandidateDays` ("Tue 8, Wed 9 or Thu 10 Oct"), and **`formatBookingWhen`** — the one label for when a booking is: "Any of Tue 8, Wed 9 or Thu 10 Oct · All day" while flexible, otherwise exactly `formatBookingSlot`. Every list, card, email and text now goes through it. 13 new tests.

### Customer — `app/(customer)/book/slot/_components/slot-picker.tsx`

Under the All day button: **"Flexible? Offer more than one day"**. In flexible mode the date strip is multi-select (a chip is disabled once that day's all-day window has started), the window grid is hidden behind a panel that counts the days offered and explains that the mechanic picks the day and window, and "Choose a single day and window instead" goes back. `selectedSlot` is parked on the earliest ticked day's 8am so the lead-time check, the 3-D Secure draft and the `slot_passed` return path are unchanged; the CTA needs at least two days still open. `ConfirmCommon.candidateDays` rides in the sessionStorage draft (older drafts read back as `[]`), and the recap reads "Any of …".

### Booking creation — `lib/bookings/create-booking.ts` (shared core; the mobile route is a thin wrapper)

`CreateBookingInput.candidateDays?: string[]`. With days present the window must be all-day (else a customer-facing refusal), the list is cleaned server-side, `scheduled_at` is **overridden** to the earliest surviving day (never the client's), and `candidate_days` is written. One survivor → an ordinary all-day booking on that day; none → the existing `slot_passed` result with the hold untouched. The confirmation email's `when` reads "Any of … · All day — your mechanic will confirm the day". `POST /api/mobile/v1/bookings` accepts optional `candidateDays` (additive; a non-array is ignored).

### Dispatch — unchanged

`lib/dispatch/dispatch.ts` never reads the date. The offer feed, the full-screen offer, and the accept / admin-assign confirmation email + SMS all show "Any of … · All day"; the accept email's note becomes "You offered a choice of days — your mechanic will confirm which day and a 2-hour arrival window."

### Mechanic picks day + window — Task 21 extended, not forked

- `lib/mechanics/arrival-windows.ts`: `loadArrivalWindowOptionsForDays(db, mechanicId, booking, dayKeys)` builds the calendar for several days in three queries (hours for the weekdays involved; timed siblings in the date range; **flexible siblings by `candidate_days` overlap**, since their `scheduled_at` sits on their earliest day and may fall outside the range). A flexible sibling is an all-day note on **every** day it offers (`siblingDayKeys`, tested). `loadArrivalWindowOptions` is now the one-day call of it.
- `arrival-window-picker.tsx` takes `days: ArrivalWindowOptions[]`. One entry → the Task 21 picker unchanged. Several → a day-chip row (same look as the customer's strip; dimmed when nothing is left that day) above the six windows for the chosen day; "Confirm day and window".
- `setArrivalWindow(bookingId, window, dayKey?)`: a flexible booking requires `dayKey` ∈ `candidate_days` ("Pick one of the days the customer offered."); an ordinary one refuses a `dayKey` that isn't its own day (stale form). Lead time and clash are recomputed on the target day. Event `reason`: "Arrival window set to Wed 10 Sep 10am–12pm (customer offered 3 days)". Notifications unchanged — `arrival_window_confirmed` already names the day.
- Day view: a flexible job shows "Any of 3 days" with a **"Pick a day"** pill. Admin job detail gains a "Days offered" row; the live feed's `arrival_window_set` line names the day when the payload carries `candidate_days`; the admin jobs list, customer and mechanic detail tables now use the UK-zoned `formatBookingWhen` instead of an unzoned `toLocaleString`.

## How to verify (once `0057` is applied)

1. As a customer, book any repair; click **Flexible? Offer more than one day**, tick three days → the window grid hides, the panel reads "3 days offered · All day (8am–8pm)", the recap reads "Any of … · All day". Untick down to one → CTA disabled. Complete checkout (test card). Confirmation email says "Any of …".
2. Customer dashboard and `/book/confirmed/[id]` show "Any of … · All day".
3. As a mechanic: feed and full-screen offer show "Any of Today, Tomorrow or … · All day". Accept → job page shows the day row + window grid. Give the mechanic a confirmed 10am–12pm job on the second day: that day's 10am–12pm is greyed "Clashes with #…". Pick day two, 2pm–4pm → Confirm.
4. Everywhere now reads "<day two> · 2pm–4pm"; `candidate_days` is null; `booking_events` has `arrival_window_set` with `candidate_days` in the payload and the day in `reason`; the customer gets email + push + SMS naming the day. Admin live feed: "Arrival window set → Wed 10 Sep 2pm–4pm".
5. Second pick refused with the one-shot sentence.
6. Book another flexible job; as the customer, reschedule it to an exact time → `slot_window` and `candidate_days` both null.
7. Regression: a single all-day booking still shows the Task 21 picker with no day row; a 2-hour booking is untouched.
8. Mobile: `POST /api/mobile/v1/bookings` with `candidateDays: ["…","…"]` + `slotWindow: "All day (8am–8pm)"` → booking with `candidate_days`; with a 2-hour `slotWindow` → `{ok:false, error:"Offering several days only works with the all-day window…"}`; omitted → unchanged behaviour.

## Acceptance criteria

- [x] A customer can offer two to seven all-day dates in one booking
- [x] The booking sorts under, and is fee-measured against, the earliest offered day until the mechanic picks
- [x] Mechanics see the offer as "Any of … · All day" in the feed, the full-screen offer and the confirmation email/SMS
- [x] After accepting, the mechanic picks a day and a 2-hour window together; days and windows that clash are blocked (UI and server)
- [x] The pick updates the booking in place so every surface — customer site, mechanic views, admin, emails, mobile app — shows the chosen day and window
- [x] The customer is told by email, push and SMS (existing `arrival_window_confirmed`)
- [x] One shot; second pick refused
- [x] A customer reschedule or accepted proposal withdraws the offered days
- [x] Audit: `arrival_window_set` payload carries `candidate_days`
- [x] Unit tests: slot helpers, flexible-sibling bucketing
- [ ] Exercised end-to-end in a browser — **deferred until `0057` is applied**; script above

## Follow-ups

- **Flexible siblings and clashes.** Two of the mechanic's own flexible jobs sharing a day are shown to each other as all-day notes, never as clashes (same as two all-day jobs in Task 21). Fine for now.
- **The 24-hour fee on the earliest day** can bite a customer who cancels the day before the *earliest* offered day when the mechanic might have picked a later one. Owner decision; revisit if it comes up.
- **The offer feed sorts by `scheduled_at`**, i.e. the earliest offered day, which is the right place for it.

## Mobile app (per AGENTS.md)

1. **Migration `0057`** — `bookings.candidate_days date[]` → `npm run db:types`.
2. **Additive request field:** `POST /api/mobile/v1/bookings` accepts optional `candidateDays: string[]` (`"YYYY-MM-DD"`, 2–7 entries) with `slotWindow: "All day (8am–8pm)"`. Old builds keep working.
3. **Display:** the app reads `bookings` raw. Until the mechanic picks, a flexible booking shows in the app as "<earliest day> · All day (8am–8pm)" — incomplete, not wrong. Render `candidate_days` when non-null ("Any of …").
4. **Semantics change:** while `confirmed`, `scheduled_at` may now move to a **different day** (one of `candidate_days`), not just later on the same day as Task 21 documented. Still not a reschedule — `reschedule_status` stays null; `candidate_days` goes null in the same update. Treat the Realtime UPDATE as a display refresh.
5. `arrival_window_set` payload gains `candidate_days`; `reason` may now name the day.
6. The customer's own reschedule (`POST /bookings/:id/reschedule`) now nulls `candidate_days` as well as `slot_window`.
7. **Migration `0058`** (config only, no type change) adds `booking_events` to the `supabase_realtime` publication so the app's detail-screen subscription to the booking's events actually fires. Until it is applied that half of the subscription is silent, exactly as `bookings` was before `0049`.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
