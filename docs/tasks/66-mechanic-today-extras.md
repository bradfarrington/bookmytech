# Task 66: The mechanic app — Today extras (goal, accept rate, distance, timed offline, two pushes)

**Status:** 🟡 **Built 2026-09-17, not yet live.** Typecheck, lint and 612 unit tests pass. Migration `0083` is **not applied** and nothing here has run against the database or a phone — see the unticked boxes. Everything in the prompt shipped with the field names and shapes unchanged. Additions: a `mechanic_daily_pushes` table for "once per day", `resume_online_at` cleared by trigger rather than by each caller, and `?force=1` on the evening cron.

Source: `bmt-mechanic-app/docs/today-crm-prompt.md`. Builds on Tasks 64 and 65.

## The two choices the prompt left open

**Leave-by rule** (`leaveByIso`, `lib/mechanics/today.ts`): start of the first open job's arrival window, minus the straight-line miles **from the mechanic's base** at **20 mph**, minus **10 minutes**, rounded **down to 5 minutes**. As suggested. "Open" is `confirmed`, `en_route` or `in_progress`. Null when there is no open job or either postcode won't geocode. It is always measured from base, even mid-day when the mechanic is really at the previous job — simple and documented beats clever here.

**Accept rate:** `accepted / (accepted + declined)` over offers with `offered_at` in the last 30 days. Superseded and live offers count as neither. Whole-number percent; null when nothing was answered.

## What shipped

| Piece | Where |
|---|---|
| `GET /api/mobile/v1/mechanic/summary?day=` | `app/api/mobile/v1/mechanic/summary/route.ts` → `daySummaryFor` (`lib/mechanics/day-summary.ts`). `mechanicfeed` rate-limit family. 400 on a malformed day, 403 for a customer. |
| `POST …/mechanic/status` gains `resume` | `{ minutes: 30 \| 60 }` or `{ at: "next_shift" }`; response is now `{ status, resumeAt }`. 400 for anything else; 409 `Set your working hours first.` Rules in `setAvailabilityFor` (`lib/mechanics/availability.ts`), still shared with the website's toggle. |
| Cron `resume-online`, every 5 min | Claims due mechanics by clearing the column, then brings each online through `setAvailabilityFor` (payouts gate, suspension, `online_at`), re-dispatches once, pushes "You're back online" (`data: { type: "status" }`). A refused mechanic stays offline and is not retried. |
| Cron `tomorrow-at-a-glance`, hourly | Acts only when the UK wall clock says 8pm, so BST needs no schedule change. `?force=1` for a manual run. |
| "Job well done" | `sendEndOfDayRecap`, called from `completeAndCharge` after the payout. Sends when nothing of theirs is still open that London day. |
| Both pushes | `lib/mechanics/daily-pushes.ts`. Android channel **`updates`** (`ANDROID_UPDATES_CHANNEL`), `data: { type: "tomorrow" \| "recap", day }`. Figures come from the same helpers as the summary, so banner and screen agree. Money is the mechanic's **take-home**, not the customer's total. |

Details worth knowing:

- A job belongs to the London day its `scheduled_at` falls on. A still-flexible booking sits on its earliest candidate day.
- `totals.distanceMiles` is `0` for a day with no jobs, `null` if any leg won't geocode.
- `next_shift` = the next active `mechanic_availability` day whose start is still ahead, up to the same weekday next week. An active day saved without hours starts at 08:00.
- An already-offline mechanic can call `status: "offline"` again to set, change or clear the timer. Plain `{ "status": "offline" }` clears it.
- "Once per mechanic per day" is an insert into `mechanic_daily_pushes`; the primary key is the lock. The recap is claimed only once there is something to say, so a day's first recap is its only one even if they take another job afterwards.

## Migration `0083`

1. `mechanics.daily_goal_pence` — `integer`, null or 1000–200000. Added to the mechanic's column UPDATE grant (0081), so the app writes it with supabase-js.
2. `mechanics.resume_online_at` — `timestamptz`. **Not** granted; the 0081 trigger now restores it for a mechanic's session. Written only by the service role.
3. The same trigger now nulls `resume_online_at` whenever a row ends up `online` or `on_job` — whoever did it, including an admin setting a status by hand. That is how "any other path" is covered.
4. `mechanic_daily_pushes (mechanic_id, day, kind)` — RLS on, no policies.

Safe to deploy before it is applied: going offline still works (the failed clear is logged), a timed offline answers 500, `resume-online` logs a 500 every five minutes until it is, and the two pushes don't send.

## Acceptance criteria

- [ ] `GET /mechanic/summary` returns the shape for a mechanic; 403 for a customer. *(Built; 403 comes from `requireMobileMechanic` as on every mechanic route. Not called against real data.)*
- [ ] A mechanic can update their own `daily_goal_pence` with the anon-key client, and cannot update `resume_online_at`. *(Needs `0083`.)*
- [ ] Offline with `{ "minutes": 30 }` sets `resume_online_at`; the cron brings them back online and re-dispatches; going online by hand clears it. *(Needs `0083`.)*
- [ ] Both pushes arrive once, on the `updates` channel, with the right `data`. *(Copy and once-only logic unit-tested; not sent.)*
- [x] The web mechanic surface behaves exactly as before. *(`setOwnAvailability` returns the same two fields; `completeAndCharge` gains one best-effort call. Typecheck, lint, 612 tests. Not clicked through.)*
- [ ] **`0083` applied** — Brad.

## For the app repos

- **`bmt-mechanic-app`:** contract kept exactly. Regenerate types after `0083`. Create the `updates` Android channel. The "back online" push carries `data: { type: "status" }` on `updates`.
- **`bmt-customer-app`:** regenerate types after `0083`. Nothing else changed for it.
