# Task 38 — Running late: finish the rest another day; move the later jobs

**Status:** ✅ Code-complete (2026-09-09) — on branch `task-37-revise-job` (a second commit on the same branch, after Task 37; no branch of its own because it is built entirely on 37's revisions). **No migration.** `tsc` clean, 332 unit tests (unchanged), eslint clean on every touched file, production build compiles. **Not exercised in a browser.** Deviations from the plan: none.

## Why this exists

Gareth's item 9, the last sentence as Brad relayed it (2026-09-09):

> Work takes longer than planned — the mechanic can either reschedule with the current customer and continue with his work for the day, or reschedule his bookings that are booked for later on in the day.

Owner decision (Brad, 2026-09-09): **"reschedule with the current customer" = complete today at the reduced scope, then a follow-on quote** — not a paused booking. The picker only offers the next 7 days (`upcomingDayKeys`) and Stripe cancels an uncaptured hold 7 days after it was taken, so a "come back Thursday to finish" on the *original* hold would need a re-authorisation flow for no gain; a follow-on quote gives the return visit a fresh hold through Task 34 as it stands.

## What shipped

### A. "Can't finish today?" — a guided flow over existing tools
- **On the in-progress job page**, a card above *Change what's being done* with the three steps: trim today's job (Task 37's revision, customer approves and pays only for that) → complete & charge → quote the rest. Two buttons: **Trim today's job** (anchor `#change-job`) and **Move my later jobs (N)** (`/mechanic/jobs#running-late`, with the count of today's later confirmed jobs).
- **Once the job is complete**, the *Extra work & faults* card offers **"Send a follow-on quote for the rest"** whenever an approved revision took work off and no follow-on quote has been sent yet: it opens Task 33's builder as a return visit, titled "The rest of the work from your visit", **pre-filled from the revision's diff** (`followOnLinesFromRevision`, `lib/revisions/diff.ts`) — labour lines with the HaynesPro `node_id` and the hours that were taken off, parts as parts with their price — so the quote comes to what was removed. The customer books the return visit from the quote (Task 34) and this mechanic is offered it first.
- Code: `job-extras.tsx` gains `followOnPrefill` + `openBuilderForTheRest`; `job-detail.tsx` the card and `laterJobsToday`; the job page computes the pre-fill from `revisionMoney(revisions).approved`.

### B. "Running late?" — move the later jobs in one go
- **`lib/bookings/propose-reschedule.ts`** — `proposeRescheduleFor(mechanicId, bookingId, newIso, note, admin)`, the mechanic-proposes-a-time core **extracted from `proposeReschedule`** in `app/actions/mechanic-jobs.ts`, which now calls it. Same guard (`confirmed` only), same event, same `mechanic_proposed_time` email/SMS, same customer banner and `respondToRescheduleFor`.
- **`proposeReschedules(items, note)`** (Server Action) — one `requireMechanic()`, then the core per job (cap 20); returns `{ proposed, failed: [{ bookingId, error }] }` so a job that can't move (already en route, in the past) is reported and the others still go through.
- **`jobs/_components/running-late.tsx`** on the day view (`/mechanic/jobs`, anchor `#running-late`), shown when today has confirmed jobs that haven't started: **push everything by 30 min / 1 h / 2 h / 3 h** (from the booked start, or from now if that has passed, rounded up to the quarter hour), or edit each job's time; untick a job to leave it; one note to every customer ("Running behind on an earlier job — sorry. Does this new time work for you?"); **Propose to N customers**. Flexible bookings (several days offered, Task 28) are left out — they have no fixed time to push.
- Each customer gets the existing proposal and accepts or declines from their booking; a decline leaves that job where it was (the existing rule).

## How to verify

1. Mechanic with three jobs today, on job 1 (`in_progress`): the "Can't finish today?" card shows "Move my later jobs (2)". → Trim today's job → remove two of three lines → customer approves (cheaper: no card) → Complete & charge → the job page shows "Send a follow-on quote for the rest" with 2 items → Quote the rest of the work → builder opens as a return visit with those two labour lines at their original hours → Send → customer books it from the quote (Task 34) → this mechanic is offered it first.
2. `/mechanic/jobs` → Running late? → push by 2 h → both later customers receive the `mechanic_proposed_time` email/SMS; one accepts (slot moves, window cleared), one declines (unchanged); the mechanic is emailed each outcome. Untick one and propose → only the other is asked. A job already en route → reported as failed, the rest go through.

## Acceptance criteria

- [x] In-progress job page explains the finish-later flow and links to both tools
- [x] Completed job page offers a follow-on quote pre-filled with exactly what an approved revision took off, until one is sent
- [x] Day view can propose new times for today's later confirmed jobs in one go, each customer accepting or declining as today
- [x] The single-job proposal and the bulk one share one core
- [ ] Exercised in a browser — script above

## Mobile app (per AGENTS.md)

**Nothing new.** No migration, no API change. A bulk proposal reaches the app exactly as a single one always has — `bookings.reschedule_status = 'proposed'` + `reschedule_proposed_at` + `reschedule_note`, the `reschedule_proposed` event, and the existing `reschedule-response` endpoint — so a phone on last month's build handles it. The follow-on quote the mechanic sends for the rest of the work is a Task 33/34 quote like any other.

## When complete

Update `docs/HANDOFF.md`; fast-forward `gareth-change-list-30-36` to the tip and push it; commit.
