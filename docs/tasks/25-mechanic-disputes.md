# Task 25 — A Disputes area in the mechanic dashboard

**Status:** ✅ Complete (2026-09-04) — merged to `main` 2026-09-04 (branch `task-25-mechanic-disputes`). **No migration.** `tsc` clean, unit tests green (4 new), production build clean, lint unchanged from baseline. **Not exercised in a browser this session** — the manual script is below.

## Why this exists

Brad (2026-09-04): "we also need an area inside of the mechanic dashboard for disputes — the same as we do for the admin but for the mechanic, and this will go in the sidebar." A mechanic could already *raise* a dispute from a job and *open* one from the job page's "View dispute" button (Task 12), but there was no list: a customer complaint reached them by email, and the only way back to it in the app was to remember which job it was on.

## What already existed (kept as it was)

- `/mechanic/disputes/[id]` — the detail page (`loadDispute` + the shared `DisputeDetail`, thread, withdraw / escalate).
- `/mechanic/disputes/new/[bookingId]` — the raise page; the job page's "Raise an issue" / "View dispute" buttons.
- RLS `"Parties read own disputes"` (0025) already lets a mechanic SELECT disputes on bookings where `mechanic_id = auth.uid()`; the thread policy likewise.
- Five mechanic-facing dispute emails already deep-link to `/mechanic/disputes/…`.
- Admin-only powers — `resolveDispute`, the `ArbitrationPanel` — stay admin-only; a mechanic never sees them. Disputes (customer ↔ mechanic, admin arbitrates, money-bearing) and the Resolution Center ("Get help", mechanic ↔ BMT) remain separate systems.

## What shipped

- **`lib/disputes/list.ts`** — `listMechanicDisputes(client, mechanicId)`: takes the caller's RLS client (the `lib/resolutions/load.ts` pattern) and **inner-joins `bookings` on `mechanic_id`**, because the SELECT policy also matches disputes on bookings where the mechanic is the *customer* — those belong on their customer dashboard, not here. `groupMechanicDisputes(rows)` (pure, tested): open — escalated first, then awaiting the other side, then new, newest first within each — and closed, most recently settled first. `countOpenMechanicDisputes` for the badge (0 on any failure).
- **`/mechanic/disputes`** — the list. Heading with "{n} open · {m} with Book My Tech · {k} closed"; **Open** and **Closed** sections; each row: repair, "Job #… · customer · reg", "reason · raised by you / the customer · 2h ago", the outcome and any refund on closed rows, the status pill from `DISPUTE_STATUS_TONES / LABELS`. Empty state explains where disputes come from. No top-level "raise" button — a dispute belongs to a job, and the job page has it.
- **Sidebar + mobile drawer**: a "Disputes" item (`Scale`, the icon the job page already uses) before "Get help", with an **open-count badge** — a red count next to the label, a red dot on the collapsed rail. `MechanicNavBadges` (keyed by href) is passed from the shell layout, which counts under the mechanic's own RLS.
- **Detail page**: "Back to disputes" (was "Back to job") plus a "View job" link; a non-party now bounces to the list rather than the jobs page.
- **`revalidateDispute`** now also revalidates `/mechanic/disputes`, so a reply, escalation, withdrawal or admin resolution refreshes the list.
- **Stale email copy removed**: `dispute_opened_mechanic` said "Your payout for this job is paused until the dispute is resolved" — untrue since the 2026-08-27 money-model change. Default template only; admin overrides untouched.

## How to verify

1. Sign in as a mechanic → "Disputes" in the sidebar and the mobile drawer, empty state; no badge.
2. As a customer, raise a dispute on a completed job of that mechanic → it appears under **Open** as "Opened", "raised by the customer"; the badge shows 1 in the sidebar and the drawer; the collapsed rail shows a red dot.
3. Open it → the detail is unchanged; "Back to disputes" returns to the list; "View job" opens the job.
4. Reply as the mechanic → "Responded"; escalate → "Escalated to BMT" and the heading counts it "with Book My Tech".
5. As admin, resolve it → it moves to **Closed** with the outcome (and refund line if any); badge gone.
6. A dispute on a booking where this mechanic is the *customer* (book a job from the mechanic's account, dispute it) does not appear in the mechanic list.
7. Navigate list → detail → reply → back: the list shows the new status without a refresh.
8. `/admin/emails` → preview "Dispute opened (to mechanic)" → no "payout paused" line.

## Acceptance criteria

- [x] "Disputes" in the mechanic sidebar and mobile drawer, with an open-count badge
- [x] `/mechanic/disputes` lists every dispute on the mechanic's jobs, open first, with status and outcome
- [x] Disputes where the mechanic is the customer are excluded
- [x] Detail page links back to the list and to the job
- [x] List revalidates after every dispute action
- [x] Stale payout copy removed from the mechanic email
- [x] Unit tests for the grouping (4 new)
- [x] `tsc`, production build, lint clean (baseline)
- [ ] Exercised in a browser — **deferred**; script above

## Mobile app (per AGENTS.md)

Nothing. Mechanics are not in the customer app; no migration; no request or response shape changed.

## When complete

- [x] Update this file's status + acceptance boxes.
- [x] Update `docs/HANDOFF.md`; pointer in `docs/tasks/12-disputes-polish-launch.md`.
- [x] Commit.
