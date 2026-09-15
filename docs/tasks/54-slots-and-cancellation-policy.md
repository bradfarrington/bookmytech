# Task 54: Mechanics per arrival window, and the cancellation policy endpoint

**Status:** 🚧 Backend built (2026-09-15): `GET /api/mobile/v1/slots`, `GET /api/mobile/v1/cancellation-policy`, `lib/availability/`, `lib/bookings/cancellation-policy.ts`, and dispatch's coverage check moved into `lib/dispatch/eligibility.ts`. The website's Time step count and the cancel page's policy table ship with Task 48.

## Why

The redesigned booking flow shows "4 mechanics" under each arrival window (`mockups/03`). The cancel screen shows the cancellation policy as a table (`mockups/04`). The app could read neither:
- `mechanic_availability` is staff-only.
- The fee tiers live in the admin-only `platform_settings`.

## Design

**`GET /api/mobile/v1/slots?day=YYYY-MM-DD&postcode=…`** (open to guests; postcode optional)

Response: `{ day, areaChecked, windows: [{ window, startHour, mechanics, bookable }] }`. There are six 2-hour windows, then "All day (8am–8pm)".

**Who counts in `mechanics`:**
- approved and not suspended
- if a postcode is given, covers it by dispatch's own radius rule. The rule now lives in `lib/dispatch/eligibility.ts`, which dispatch also uses, so the two can't disagree.
- "Free" means what the mechanic's own window picker means (`buildArrivalWindowOptions`): inside their saved hours for that weekday (no saved hours counts as free) and no clash with another timed job.
- The all-day count is mechanics with any free window.

**Not a reservation.** Online status is ignored, because it describes now, not the day being booked. Dispatch still broadcasts at booking time.

**Limits:** days up to 30 ahead. The new `slots` rate-limit family applies per user and per address.

**`GET /api/mobile/v1/cancellation-policy`** (public)
- Response: `{ tiers: [{ key, label, feePence }] }`.
- Keys, in order: `before_24h`, `within_24h`, `en_route`.
- Labels: "More than 24 hours before", "Within 24 hours", "Once your mechanic is on the way".
- The figures come from `cancelFeeTiers`: the same numbers the cancel charges and the public policy page shows.

**Label differs from the mockup.** The mockup's third tier reads "Under 2 hrs / mechanic en route". No 2-hour tier exists in the code, so the label says only what's true.

## Acceptance criteria

- [x] `GET /slots` counts only mechanics who cover the postcode, are inside their hours and have no clashing job (unit-tested)
- [x] Dispatch behaviour unchanged after the eligibility extraction
- [x] `GET /cancellation-policy` returns the live fee tiers
- [ ] Website Time step shows the count under each window (Task 48)
- [ ] Website cancel page shows the policy table (Task 48)
- [ ] `0076` applied (owner). The rate limits work without it, from code defaults

## Mobile app

- **`fetchWindowAvailability(day, postcode)`:** `GET /api/mobile/v1/slots?day=…&postcode=…` returns a map of `window` to `mechanics`. Hide the count when `bookable` is false.
- **`fetchCancellationPolicy()`:** `GET /api/mobile/v1/cancellation-policy` returns `{ tiers }`. Format each fee (0 is "Free").

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
