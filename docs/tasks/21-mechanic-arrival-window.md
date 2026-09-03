# Task 21 — Mechanic narrows an all-day booking to a 2-hour arrival window

**Status:** ✅ Complete (2026-09-03) — code complete on branch `task-21-22-arrival-window-notifications`; `tsc` clean, 184 unit tests (25 new across Tasks 21–22), production build compiles. **Migration `0052` is NOT yet applied** (no SQL access from this checkout — Brad applies it). **Not yet exercised in a browser** — the manual script is under "How to verify". Deviations from the plan: none.

## Why this exists

From Gareth's test run (2026-09-03). Customers can book a 2-hour arrival window or the all-day one (8am–8pm). When a mechanic accepted an **all-day** booking there was nothing that let them narrow it: the job sat in their day as "08:00", the customer was emailed "08:00" too (a bare `toLocaleString` with no zone, ignoring `slot_window`), and the only time control a mechanic had — "Propose a new time" — is an exact timestamp that needs the customer's consent and wipes the window.

Gareth's ask: after accepting an all-day job, offer the mechanic the same six 2-hour windows the customer sees (not the all-day one), informed by their working hours and their other jobs that day. They pick one, it goes into their schedule, and the customer is told the rough window.

## Owner decisions (Brad, 2026-09-03)

- **One shot.** Once a window is set it can't be re-picked. Moving it again is "Propose a new time", which the customer has to accept — the all-day → 2-hour narrowing is the only consentless move, because the customer already agreed to the whole day.
- **Clashes block, off-hours flag.** A window that overlaps another job on their schedule is greyed out and refused server-side. A window outside their saved weekly hours is marked amber but still selectable — they accepted the job; their hours are a hint.
- **Email + push + SMS** to the customer (the SMS side is Task 22).

## What shipped

### Storage — in place, no new column

Picking a window sets `bookings.slot_window` to the 2-hour label and `bookings.scheduled_at` to that window's start (`slotIso(londonDateKey(scheduled_at), startHour)`). Nothing else changes; `reschedule_status` stays null. Two reasons this is right and not a shortcut:

- **Every display path already reads those two columns** — `formatBookingSlot` on the customer dashboard, the confirmation page, the mechanic views and the emails — and so does the **mobile app**, which reads `bookings` raw over RLS and Realtime. The narrower window shows everywhere with no further change and no app release.
- `scheduled_at` only ever moves **later within the same UK day** (all-day starts at 8am, the earliest window starts at 8am), so the cancellation-fee 24-hour boundary (`feeFor` in `lib/bookings/manage-booking.ts`) can only move in the customer's favour, and day-grouping is unaffected.

The original window is kept in a `booking_events` row (`arrival_window_set`, migration `0052`, payload `{ from_window, to_window, from, to, day }`, `reason` a human sentence for the timelines).

### The calendar — `lib/mechanics/arrival-windows.ts`

Split into a **pure builder** (`buildArrivalWindowOptions`, 16 unit tests over pre-fetched rows) and a thin loader (`loadArrivalWindowOptions`) that accepts either the mechanic's RLS client (the job page) or the service-role client (the action) — both `mechanic_availability` and their own `bookings` are own-row readable. **This is the first code that has ever read `mechanic_availability`**; the editor at `/mechanic/availability` had been writing it into the void since Task 05.

For each of the six windows on the booking's UK day:

| field | rule |
|---|---|
| `bookable` | `isSlotBookable` — start at least 60 minutes away (the customer's lead time, `MIN_LEAD_MINUTES`) |
| `clash` | overlaps another job of theirs with status `confirmed`/`en_route`/`in_progress` that day; a timed job occupies `[start, start + max(2h, service_duration_hours))`. **Hard block.** |
| `outsideHours` | any part of the window is outside that weekday's saved hours (`is_active=false` → every window). No row = unknown = nothing flagged. **Advisory.** |
| `selectable` | `bookable && !clash` |

Their **other un-narrowed all-day jobs** that day never clash (they're flexible) but are listed as a note — "You also have #00120 booked as all day — plan around it." Two all-day jobs narrowed one after the other work by construction: the second sees the first as a timed clash.

All instants go through `lib/slots.ts`'s London helpers (`londonInstant`, `slotIso`, `dayOfWeekForKey` — new, plain calendar arithmetic on the key, never `getDay()` on a server-zone Date). Tested on both 2026 DST switch days.

### The action — `setArrivalWindow(bookingId, window)` in `app/actions/mechanic-jobs.ts`

Validation order and the mechanic-facing sentences:

1. not one of the six labels → "Pick one of the arrival windows."
2. `requireMechanic()`
3. not theirs → "This isn't your job."; not `confirmed` → "already under way" / "Only confirmed jobs…"
4. `slot_window` not all-day → **the one-shot refusal**: "You've already confirmed 10am–12pm for this job. To move it, propose a new time so the customer can agree." (or "…has a fixed time rather than an all-day window" for a legacy row)
5. a reschedule proposal pending → wait for the customer's answer first
6. lead time → "…has already started or is too close — pick a later window."
7. **the calendar is recomputed server-side** and a clash refused whatever the client showed — off-hours is not enforced
8. **guarded atomic UPDATE** — `where id, mechanic_id, status='confirmed', slot_window=<all-day>` — so a customer reschedule landing in between (which nulls `slot_window`), a double submit, or a status change can't be clobbered by a stale form: "This job changed while you were choosing — refresh and try again."
9. audit row, then email `arrival_window_confirmed` (new template), push "Your mechanic has confirmed an arrival window", SMS `arrival_window_confirmed` — all best-effort; revalidate the mechanic pages, `/dashboard` and `/book/confirmed/[id]`.

If `0052` isn't applied the booking still narrows and the customer is still told; the audit insert fails the CHECK and is logged by name.

### The UI

- **`arrival-window-picker.tsx`** at the top of the mechanic's job detail, only while the job is theirs, `confirmed`, and still all-day. Same 3-column grid as the customer's picker; sub-labels "Passed", "Clashes with #00123" (dimmed, disabled), "Outside your hours" (amber, enabled); a note for saved hours / day off / other all-day jobs; "Confirm window". If nothing is selectable: "No windows left today — the job stays all day." It disappears by itself after a pick, because `slot_window` is no longer all-day.
- **Accept → picker.** `acceptOffer` returns an additive `needsArrivalWindow` on an all-day job. The feed card (`offer-card.tsx`) then pushes to the job page instead of refreshing; the full-screen offer already pushed there and only changes its toast. Picking is skippable — the customer agreed to all day.
- **Day view** (`/mechanic/jobs` → "Your day") shows the window label instead of a bare start time ("All day", "10am–12pm"; a legacy row keeps "12:00") and a **"Pick a window"** pill on a confirmed all-day job — which also covers an admin-assigned job that never passed through accept.
- **Admin** timeline and live feed label `arrival_window_set` ("Arrival window set → 10am–12pm").

### Fixed on the way

- `acceptOffer`'s customer email said **"08:00"** for an all-day booking and printed BST an hour early on Vercel (UTC): it now uses `formatBookingSlot(scheduled_at, slot_window)`, and for an all-day booking adds "your mechanic will confirm a 2-hour arrival window for the day" (an `optional_note` block on `mechanic_confirmed` / `replacement_confirmed`).
- The same unzoned formatter fed every reschedule email (`fmt` in `manage-booking.ts`, `slotLabel` in `proposeReschedule`) — both now go through `formatBookingSlot`.

## How to verify (once `0052` is applied)

1. As a customer, book any repair with the **All day (8am–8pm)** window for tomorrow.
2. As a mechanic with a second confirmed job tomorrow at, say, 2pm–4pm and hours saved 08:00–18:00: accept the all-day offer from the feed → you land on the job page with the picker at the top. **2pm–4pm** is greyed "Clashes with #…"; **6pm–8pm** is amber "Outside your hours" but clickable; the rest are plain.
3. Pick 10am–12pm → Confirm. Toast, picker gone, "When" tile reads "Tomorrow · 10am–12pm".
4. Customer side: dashboard and `/book/confirmed/[id]` show "… · 10am–12pm"; the email, push and text arrive (or land in `TEST_OUTBOX_DIR` in test mode). Admin job timeline shows "Arrival window set".
5. Try again: `setArrivalWindow` refuses with the one-shot sentence; "Propose a new time" is the only route.
6. Repeat step 2 from the **full-screen offer** (`/mechanic/offer/[id]`): same landing.
7. Have an admin hand-assign an all-day job: the day view shows "Pick a window"; the job page shows the picker.

## Acceptance criteria

- [x] After accepting an all-day booking the mechanic is offered the six 2-hour windows for that day, never the all-day one
- [x] Windows clashing with another job that day are blocked (UI and server)
- [x] Windows outside the mechanic's saved hours are flagged but selectable
- [x] Picking updates the booking so every surface — customer site, mechanic views, emails, mobile app — shows the narrower window
- [x] The customer is told by email, push and SMS
- [x] One shot: a second pick is refused with a sentence that points at "Propose a new time"
- [x] Concurrent customer reschedule / double submit can't clobber (guarded UPDATE)
- [x] Audit event `arrival_window_set` with the original window (`0052`)
- [x] Day view shows the window label and a "Pick a window" pill
- [x] Unit tests for the calendar builder (clash footprint, all-day siblings, ignored statuses, hours, day off, lead time, DST days)
- [ ] Exercised end-to-end in a browser — **deferred until `0052` is applied**; script above

## Follow-ups

- **Two un-narrowed all-day jobs on the same day** are both shown to the mechanic as a soft note; nothing stops them narrowing both into the same window (the second pick sees the first as a clash, so it can't — but only after the first is set). Fine for now.
- **The job page doesn't poll**, so a mechanic with the picker open while the customer reschedules sees the "refresh and try again" refusal rather than a live update. The offer screen polls; this page could too.
- **Day view's `startOfToday()`** (`jobs/page.tsx`) is server-zone (UTC on Vercel) — around midnight it groups the wrong day. Pre-existing; the London-correct form is `londonInstant(londonDateKey(new Date()), 0)`.
- **The customer's own reschedule still nulls `slot_window`** (documented contract with the app). Unchanged.

## Mobile app (per AGENTS.md)

1. **Migration `0052`** — CHECK-only, `npm run db:types` in the app (expect no diff).
2. `booking_events` may now contain `event_type = 'arrival_window_set'`; `reason` is a sentence, `payload = { from_window, to_window, from, to, day }`. The app's event renderer needs a label and a safe default for unknown types.
3. While `status = 'confirmed'`, `slot_window` may change from "All day (8am–8pm)" to a 2-hour label and `scheduled_at` may move later on the same day. **Not a reschedule** — `reschedule_status` stays null; treat the Realtime UPDATE as a display refresh.
4. New push "Your mechanic has confirmed an arrival window", `bookingId` in `data` as every push has.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
