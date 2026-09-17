# Task 67: The mechanic app — the active job (lifecycle, photos, checklist, messages, quotes, parts)

**Status:** 🟡 **Built 2026-09-17, not yet run.** Typecheck, lint on every touched file, 616 unit tests and a production build pass; all 17 routes register. **Nothing has been called with a token, and no test job has been taken through** — the live verification was not possible from this session (see the unticked boxes). Paths, field names and shapes are as the prompt gave them. Differences: `messages/read` counts against `mechanicfeed` rather than `message`; two new rate-limit families; a double-payout race in completion was closed on the way through.

Source: `bmt-mechanic-app/docs/job-crm-prompt.md`. Builds on Tasks 64–66.

## Routes — all under `app/api/mobile/v1/mechanic/`

| Route | Family | 200 | Shared core |
|---|---|---|---|
| `GET bookings/[id]/job` | `mechanicfeed` | `{ destination, distanceMiles, money, checklists, completeBlocker, cancelReasons }` | `jobViewFor` — `lib/mechanics/job-view.ts` |
| `POST bookings/[id]/start-journey` | `mechanic` | `{ status: "en_route" }` | `startJourneyFor` — `lib/mechanics/job-progress.ts` |
| `POST bookings/[id]/begin-work` | `mechanic` | `{ status: "in_progress" }` | `beginWorkFor` |
| `POST bookings/[id]/mileage` `{ mileage }` | `mechanic` | `{}` | `setJobMileageFor` |
| `POST bookings/[id]/complete` | `mechanic` | `{ status: "completed", chargedPence, payoutPence }` | `completeAndChargeFor` |
| `POST bookings/[id]/cancel` `{ reason, detail? }` | `mechanic` | `{}` | `cancelOwnJobFor` — `lib/mechanics/cancel-job.ts` |
| `POST bookings/[id]/reschedule` `{ newIso, note? }` | `mechanic` | `{}` | `proposeRescheduleFor` |
| `POST bookings/[id]/photos` (multipart `file`) | `mechanicupload` | `{ id, url }` | `uploadJobPhotoFor` — `lib/mechanics/job-media.ts` |
| `POST photos/[mediaId]/remove` | `mechanic` | `{}` | `deleteJobPhotoFor` |
| `POST bookings/[id]/checklist` `{ itemId, result?, comment? }` | `mechanicchecklist` | `{ progress, completeBlocker }` | `saveChecklistResultFor` — `lib/checklists/save-result.ts` |
| `POST bookings/[id]/messages` `{ body }` | `message` | `{ id }` | `sendMessageFor` |
| `POST bookings/[id]/messages/read` | `mechanicfeed` | `{ cleared }` | `markMessagesReadFor` |
| `POST bookings/[id]/quotes/preview` `{ lines }` | `mechanicfeed` | `{ lines: [{ linePence }], totalPence, platformFeePence, mechanicPayoutPence, hourlyRatePence }` | `previewQuote` — `lib/quotes/mechanic.ts` |
| `POST bookings/[id]/quotes` `{ kind, title?, note?, lines }` | `mechanic` | `{ id }` | `createQuote` |
| `POST quotes/[quoteId]/withdraw` | `mechanic` | `{}` | `withdrawQuote` |
| `GET bookings/[id]/repair-times?query=` | `mechanicfeed` | `{ hits, truncated }` | `searchJobRepairTimes` |
| `POST booking-parts/[partId]/sourcing` `{ sourcing }` | `mechanic` | `{ payoutPence }` | `setPartSourcingFor` — `lib/mechanics/part-sourcing.ts` |

**Refusals** are `{ error }` with a status, the sentence passed through verbatim: **400** the request is wrong (bad mileage, unknown answer, unpriceable quote line), **403** not yours, **404** not there, **409** right caller, wrong moment. A database failure is logged and replaced with a generic 500. Each route's header comment lists its own.

### Delegate, never reimplement

Every write that lived inside a `"use server"` file was moved to `lib/` with `mechanicId` as a parameter; the action is now a guard plus one call, and returns exactly what it did before.

- `app/actions/job-progress.ts` → `lib/mechanics/job-progress.ts` (moved with `git mv`; the diff is the guard and the refusal codes)
- `app/actions/mechanic-jobs.ts` (`cancelOwnJob`) → `lib/mechanics/cancel-job.ts`
- `app/actions/job-media.ts` → `lib/mechanics/job-media.ts`
- `app/actions/job-checklist.ts` → `lib/checklists/save-result.ts`
- `app/actions/booking-parts.ts` (`setPartSourcing`) → `lib/mechanics/part-sourcing.ts`
- quotes, messages and reschedule already had cores; they gained refusal codes / return values.

Cores refuse with a `code` (`lib/mechanics/refusal.ts`); the website ignores it.

## Things worth knowing

- **`completeBlocker`** is `completionGate()` — the same function `completeAndChargeFor` runs, so the sentence shown before the button and the refusal after it cannot differ. It covers unfinished checklists, missing mileage, and a quote or revised job awaiting the customer. It deliberately ignores the job's status.
- **`money`** is `jobMoney()` (`lib/mechanics/job-money.ts`), and the website's job page now calls it too. `payoutPence` = the mechanic's share of the total less BMT-sourced parts, the figure the web page has always shown.
- **`complete` is safe to retry.** Captures were already idempotent. The status flip is now also a claim: of two overlapping calls only the one that changes the row pays the mechanic. Before, both would have — a real double-payout race on the website too (a double click), made likelier by an app retrying after a timeout.
- **Cancel's "already under way" sentence** no longer says "Manage it from the mobile app." It reads: *"This job is already under way, so it can't be cancelled. Message the customer, or contact Book My Tech if you can't carry on."* Shared with the website.
- **Cancel reasons** live in `lib/mechanics/cancel-reasons.ts`; the website's picker reads the same list, and `joinCancelReason` is the one place "reason: detail" is formed.
- **Checklist rate limit.** `mechanic` allows 15 a minute; a run of passes is faster than one a second. `mechanicchecklist` allows 150/min, 4,000/day. Photos get `mechanicupload` (20/min, 300/day) because the customers' `upload` is sized for six dispute photos. Migration `0084` seeds both; the code defaults are identical, so nothing waits on it.
- **`messages/read` is on `mechanicfeed`**, not `message` as the prompt had it: an open thread calls it as it polls, and that must not use up the budget for replying.
- **Message routes check assignment first** (`ownedBooking`), because the core accepts either party and this route is for the mechanic.
- **New push: a customer's message → the mechanic.** `sendPushToMechanic`, channel `updates`, title `New message from <short name>`, body the first 120 characters, `data: { type: "message", bookingId }`. The unread-message sweep still texts a mechanic who hasn't read it after ~5 minutes.
- **No customer signature**, as instructed. The completion event still records `mechanic_confirmed: true`.
- **Left web-only:** faults, job revisions, end-on-site, `markPartStatus`, bulk reschedule.

## Migration `0084`

Eight `platform_settings` rows for the two new rate-limit families. **No schema change** — no types to regenerate.

## Acceptance criteria

- [ ] A mechanic's token takes a test job confirmed → en route → in progress → completed through these routes alone, with the same customer emails/SMS/push and `booking_events` as the web, and the payout transfer recorded. *(Not run. Same cores as the web, so the side effects are the same code — but unproven end to end.)*
- [ ] A customer's token gets 403 everywhere; another mechanic's gets 403/404. *(By construction — `requireMobileMechanic`, then each core's ownership check — not exercised.)*
- [ ] A failed capture leaves the job `in_progress` and a retry succeeds. *(The capture path is unchanged; not exercised.)*
- [x] The web job page behaves exactly as before. *(Actions return the same shapes; the page's money figures come from `jobMoney`, unit-tested against the old sums. Typecheck, lint, 616 tests, production build. Not clicked through.)*
- [ ] **`0084` applied** — Brad. Optional: the limits apply from code without it.

## For the app repos

- **`bmt-mechanic-app`:** contract kept. Note `messages/read`'s answer is `{ cleared }` and send's is `{ id }`; a refused message is a **409 `{ error }`**, not a 200 `{ ok: false }` like the customer route. `quotes/preview` answers **400** while a line is half-typed — expected, not a failure. Handle the `message` push (`data.type === "message"`, `data.bookingId`) on the `updates` channel. No types to regenerate for this task.
- **`bmt-customer-app`:** nothing to do. `POST /bookings/:id/messages` now also returns `id` alongside `ok` — additive.
