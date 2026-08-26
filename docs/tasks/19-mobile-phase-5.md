# Task 19 — Mobile phase 5: push, live tracking, messaging (`app/api/mobile/v1/**`)

**Status:** ✅ Complete (2026-08-26) — all four items of the app's phase-5 prompt shipped: push tokens + sender (P1), the live-drift record + realtime publication (P2), the message endpoint on a new shared core (P3), `preferredMechanicId` on `POST /bookings` (P4). **Three migrations to apply — `0048`, `0049`, `0050` — and this checkout has no SQL access, so they were NOT applied here.** Everything that could be verified without them was: the P2 policy contract was proved against the live database with `scripts/verify-mechanic-visibility.mjs` (19/20 — the one miss is the `bookings` realtime event, which is exactly what 0049 adds), and P3 was probed live from three sessions against a local dev server. **Deviations from the prompt:** `sendMessageFor` takes a `BookingCaller` (`{ userId, email }`) rather than a bare `callerId`, because the guest-booking arm of ownership needs the email (same shape as every other core); push receipts needed a second table (`push_receipts`) and a cron, because Expo reports dead devices in the *receipt*, not the ticket; the reminder push carries the source booking's id rather than nothing.

## Why this exists

The app side of phase 5 (map card, push permission + token, message thread) was built on 2026-08-26 and was waiting on the server for four things, written up in `bmt-customer-app/docs/phase-5-crm-prompt.md`. Two of them were drift the app found while building: a table on the live database that no migration creates, and a realtime subscription that had been silently receiving nothing since phase 4.

The standing rules apply — see `AGENTS.md` and Task 18: delegate to `lib/`, never add a caller argument to a `"use server"` export, ownership from the verified caller and never the body, `{ error }` for transport failures and `{ ok: false, error }` at 200 for refusals.

## P1 — Push tokens and sending ✅

**Storage — migration `0050`.** `customer_push_tokens` (token PK → customer, platform, timestamps; RLS on, no policies — service-role only, the app never reads it), `push_receipts` (parked Expo ticket ids, see below), and `profiles.reminder_via_push boolean not null default true`.

The token is the primary key, not `(customer_id, token)`: a phone that changes hands re-registers the same token under the new customer, and the upsert **moves** the row rather than leaving the previous owner receiving the new one's bookings. Probed live: A registers, B re-registers the same token, the row is B's; A's `/devices/remove` of that token is a 200 with no effect.

**Routes** — both authenticated, `action` rate family:

| Endpoint | Body | Does |
|---|---|---|
| `POST /api/mobile/v1/devices` | `{ token, platform }` | Validates with `Expo.isExpoPushToken` and `platform ∈ {ios, android}` (400 otherwise), upserts on `token` with `customer_id` = caller, bumps `last_seen_at`. `{ ok: true }`. |
| `POST /api/mobile/v1/devices/remove` | `{ token }` | Deletes only if the row's `customer_id` is the caller. `{ ok: true }` whether or not a row matched. |

**Sending — `lib/push/send.ts`** wrapping `expo-server-sdk` (`sendPushToCustomer(customerId, { title, body, bookingId })`). Best-effort like `sendSms`: never throws, a guest or a customer with no device is a no-op, and every message carries `data.bookingId` — the only thing the app deep-links on. Chunked with `expo.chunkPushNotifications`. Wired **alongside** SMS/email, never instead, at:

- **Mechanic takes the job** — `acceptOffer` (`app/actions/job-offers.ts`) and the admin's `assignMechanic` (`app/actions/bookings.ts`): *"Your mechanic is confirmed — James M has taken your job."* (*"replacement"* variant when it's a reassignment.)
- **On the way** — `startJourney` (`app/actions/job-progress.ts`): *"James M is on the way."*
- **Mechanic's message** — `lib/messages/send.ts`: *"New message from James M"* + the first 120 chars. (Not in the prompt's list, but it is one of "the places SMS goes out today", and it's the notification a customer most wants.)
- **Reminders** — `/api/cron/send-reminders`, gated on `reminder_via_push`. Title `"MOT due · AB12CDE"`, body = the reminder blurb, `bookingId` = `reminder_schedules.source_booking_id` (the past job, where the app's "Book again" lives), and the tracked `/r/<token>` CTA in `data.url` for a future build.

`shortPersonName("James Miller") → "James M"` lives in `lib/utils.ts` (unit-tested).

**Dead tokens.** A *ticket* that says `DeviceNotRegistered` deletes the token immediately. Every OK ticket is parked in `push_receipts`, and **`/api/cron/push-receipts`** (every 15 min, `vercel.json`) fetches the receipts after a 10-minute delay and deletes any token they condemn; rows older than 24 h are dropped unanswered. This is the part Expo's docs are explicit about — keep sending to dead tokens and the project gets throttled.

**`EXPO_ACCESS_TOKEN`** is optional (Expo accepts unauthenticated sends) but should be set — documented in `docs/DEPLOYMENT_ENV.md`. Test mode: `TEST_OUTBOX_DIR` captures pushes as `kind: "push"` alongside email/SMS.

## P2 — Realtime publication, and the migrations that were never written down ✅

**The drift was wider than the two items the app found.** Diffing the live PostgREST schema (every public table, view and RPC) against every `create table|view|function` in `supabase/migrations/` on 2026-08-26 turned up, live and in no migration:

| Object | Kind | Used by |
|---|---|---|
| `mechanic_locations` | table + 6 policies + trigger | app map card (reads); mechanic app (writes, when it ships) |
| `mechanic_cards` | view | app (`src/lib/bookings.ts`) — the customer-safe mechanic card |
| `dvla_vehicle_cache` | table | **nothing, yet** — see Task 18 follow-ups |
| `owns_booking`, `has_booking_with_mechanic`, `has_live_booking_with_mechanic`, `can_track_mechanic` | `SECURITY DEFINER` fns | the policies/view above; the live `reviews` policy |
| `purge_stale_mechanic_locations`, `purge_stale_dvla_cache` | fns (+ pg_cron jobs) | housekeeping |

Nothing is migrated-and-missing except the tables `0040` deliberately dropped.

**Migration `0048` records all of it.** Column names/types/nullability and every function signature are copied from the live schema exactly; the function bodies and policy expressions could not be read back (no SQL access from here, the CLI's account can't see this project, and the SQL was never committed in either repo — only prose) and are **reconstructed from the documented contract**. That reconstruction was then **proved equivalent to live** by `scripts/verify-mechanic-visibility.mjs`, which stands up two customers, a mechanic, a booking and a location row and asserts from both customer sessions through `confirmed → en_route → sharing off/on → in_progress → completed`. Every observable rule matched: location visible only to the booking's customer, only while `en_route`, only while sharing; card visible only to a customer who booked that mechanic; phone only while `en_route`/`in_progress`. The five-minute staleness window is the one thing the script can't plant (by design — `updated_at` is trigger-stamped). Everything in `0048` is `create or replace` / `if not exists`, so applying it replaces the hand-made definitions with the written-down ones and the repo becomes the source of truth.

**Migration `0049`** adds `bookings` and `mechanic_locations` to `supabase_realtime` with 0008's idempotent guard. Postgres-changes on a user-token channel honours RLS, so nothing is exposed the policies don't already allow. `messages` stays out — both clients poll it. The verify script's realtime check is the proof this applied (it currently reports `saw []`).

**The purge crons are pg_cron**, not Next routes — pure database housekeeping with no app code, guarded so the migration applies where the extension isn't enabled.

## P3 — Send a message from the app ✅

`POST /api/mobile/v1/bookings/:id/messages`, body `{ body }`, `message` rate family. **`lib/messages/send.ts`** is the new shared core (`sendMessageFor`, `markMessagesReadFor`, `partyForBooking`); `app/actions/messages.ts` is now two thin wrappers with unchanged signatures. Customer ownership is the shared `ownsBooking` predicate; mechanic membership is the assignment. Refusals at 200: not a party, empty, over 2000 chars, and **booking `completed`/`cancelled`** (new on the web side too — there was no UI path to it anyway). `disputed` deliberately stays open.

Probed live from three sessions against a local dev server (13/13): 401 / 415 / 400 on transport, the other customer refused, empty and 2001-char bodies refused, owner and assigned mechanic both post with the right `sender_role`, RLS reads scoped correctly, and the thread closes on `completed` and `cancelled` for both parties.

## P4 — `preferredMechanicId` on `POST /bookings` ✅

Optional uuid, threaded into `CreateBookingInput.preferredMechanicId` (which already existed for the web's `?pref=`). A malformed value is **ignored, not refused**: by the time `/bookings` is called the pre-auth hold is already confirmed on the device, and failing a paid booking over an optional hint would strand it. Not live-fired — the route re-quotes through HaynesPro, which is still down (checked 2026-08-26 morning: `statusCode 1`).

## Acceptance criteria

- [x] `customer_push_tokens` keyed on token; service-role only; `reminder_via_push` on `profiles` (`0050`)
- [x] `POST /devices` and `/devices/remove`, authenticated, token validated, ownership from the caller
- [x] `lib/push/send.ts`, chunked, `data.bookingId` on every notification
- [x] Push at accept, en-route and reminders (plus mechanic messages), alongside SMS
- [x] `DeviceNotRegistered` deletes the token — ticket immediately, receipt via `/api/cron/push-receipts`
- [x] `EXPO_ACCESS_TOKEN` documented
- [x] `0048` records `mechanic_locations` (+ policies, trigger, purge, cron) and the rest of the drift
- [x] Rest of live diffed against the migration set — `dvla_vehicle_cache`, `mechanic_cards`, six functions
- [x] `0049` publishes `bookings` and `mechanic_locations`, `messages` left out
- [x] `scripts/verify-mechanic-visibility.mjs` written and run against live
- [x] `POST /bookings/:id/messages` on an extracted core, both callers on it, `message` family
- [x] `preferredMechanicId` on `POST /bookings`
- [ ] Migrations `0048`–`0050` applied — **not possible from this checkout; Brad to run in the SQL editor**, then re-run the verify script (expect 20/20) and the app's `npm run db:types`

## What the app needs to do

| CRM item | App |
|---|---|
| `0048`, `0050` applied | `npm run db:types` — new tables `customer_push_tokens`, `push_receipts`, new column `profiles.reminder_via_push`; `mechanic_locations`/`mechanic_cards` unchanged |
| `/devices` live | Nothing — the 404 in the dev log stops once `0050` is applied |
| Push sending | Nothing — `bookingId` is in `data` as expected. Reminder pushes carry `data.url` and `data.reminderType` too, and their `bookingId` is the *source* job |
| `0049` applied | Nothing — dashboard status changes and the map marker go live |
| P3 live | Set `MESSAGING_ENABLED = true` in `src/lib/messages.ts` |
| P4 | Add the "same mechanic" toggle to rebook and send `preferredMechanicId` |

## Follow-ups

- **A push at booking-confirmed / job-complete / cancelled** would round out parity with the SMS touchpoints (`create-booking.ts`, `manage-booking.ts`, `completeAndCharge`). Left out to keep this to what the prompt asked for; each is a three-line call to `sendPushToCustomer`.
- **A web toggle for `reminder_via_push`** on `/dashboard/settings/reminders`. The column defaults on and the web form doesn't touch it, so a customer can only turn it off from the app (which has a settings screen for it) or by us.
- **Mechanic push on dispatch** (`lib/dispatch/`) is a separate build with its own token table — the mechanic app is another repo.
- **`dvla_vehicle_cache` is live, recorded, and unused.** Wiring `lookupVehicleAction` to it is the Task 18 follow-up it always was.
- **Port `scripts/verify-mechanic-visibility.mjs` into CI** alongside `tests/e2e/` — these policies are all that stands between a customer and someone else's live position.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
