# Task 57: Guest-era bookings can be disputed

**Status:** ✅ Complete (2026-09-16): `ownsBooking` now decides the customer arm in `lib/disputes/core.ts`, `lib/disputes/load.ts`, the new-dispute page and the disputes list, and the guard hiding "Report a problem" is gone. Item 7 of Task 55. Exploration found **five** wrong ownership checks, not the three the Task 55 notes recorded.

## Why

A booking made before accounts were required has no `customer_id` and is linked to its customer by `customer_email`. Those customers could view, cancel, reschedule, review and message their booking, because all of those go through the shared `ownsBooking`. They could not open, view, reply to or withdraw a dispute.

"Report a problem" was hidden on those bookings rather than offered and refused, by an `ownedByAccount` guard in `canReportProblem`. That plaster is what kept the bug invisible.

## Cause

RLS was never the problem. The dispute policies have the guest arm and are correct:

```sql
b.customer_id = auth.uid()
or (b.customer_id is null and b.customer_email = auth.email())
or b.mechanic_id = auth.uid()
```

Every failing path uses the **service-role** client, so RLS is bypassed and cannot save it. The fault was five application-code checks that compared `customer_id` and had no email arm.

| Site | Gated |
|---|---|
| `lib/disputes/core.ts` `openDisputeFor` | Opening a dispute. The primary failure. |
| `lib/disputes/core.ts` `partyForDispute` | Reply, withdraw, escalate, arbitrate. |
| `lib/disputes/load.ts` `loadDispute` | Viewing a dispute, on both the customer and mechanic pages. |
| `dashboard/(shell)/disputes/new/[bookingId]/page.tsx` | The form itself. |
| `_home/booking-logic.ts` `canReportProblem` | Hid the link. |

The disputes **list** page already had a guest arm, so it would show a guest-era dispute whose detail page then refused it. That arm also compared the email case-insensitively, making it very slightly *looser* than the policy it mirrors.

## Design

Reuse `ownsBooking` from `lib/bookings/ownership.ts`. It already mirrors the RLS arms exactly, including the hardening that `null === null` must not match, and it is the predicate every other customer action uses. No new rule, no new migration.

- `openDisputeFor`, `partyForDispute`, `sendDisputeMessageFor`, `withdrawDisputeFor` and `loadDispute` take a `BookingCaller` instead of a bare `callerId`, following the existing convention that the caller is always a parameter and never derived inside `lib/`.
- The website's `requireUser()` already returned `{ userId, email }`, and mobile's `auth.caller` is already a `BookingCaller`, so both call sites had the email to hand.
- Two selects widened to include `customer_email`: `loadDispute` and the new-dispute page.
- The disputes list uses `ownsBooking` in place of its inline copy, so one rule governs everywhere.
- The `ownedByAccount` guard and its test are gone. The field stays on `CustomerBooking` because it is a true fact about a row, with a comment warning not to gate on it again.

## Acceptance criteria

- [x] `openDisputeFor` accepts a guest-era booking
- [x] `partyForDispute` lets its customer reply, withdraw and escalate
- [x] `loadDispute` renders it for the customer, and still for the mechanic and admin
- [x] The new-dispute form no longer redirects those customers to `/dashboard`
- [x] "Report a problem" is offered on a guest-era completed booking; the test asserts the new behaviour
- [x] The disputes list uses the shared rule, so its email match is no longer looser than RLS
- [x] `tsc` clean, `next build` passes, 559 tests pass
- [ ] Walked end to end on a real guest-era row: open, view, reply, withdraw. **Needs a booking with `customer_id IS NULL` and a matching `customer_email`.**

## Mobile app — tell Brad

**Additive, no shape change.** The mobile dispute routes wrap the same core, so these now accept guest-era bookings too:

- `POST /api/mobile/v1/bookings/:id/disputes`
- `POST /api/mobile/v1/disputes/:id/messages`
- `POST /api/mobile/v1/disputes/:id/withdraw`

No request or response field changed and no migration ran, so the app needs no work and older builds keep working. If the app hides its own "Report a problem" on bookings with a null `customer_id`, mirroring the guard we just deleted, it can stop.

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
