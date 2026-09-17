# Task 69: The mechanic app — Inbox, Get-help cases and disputes

**Status:** 🟡 **Built 2026-09-17, not yet run.** Typecheck, lint on every touched file, 631 unit tests and a production build pass; all 14 routes register. **Nothing has been called with a token.** Migration `0085` was applied by Brad on 2026-09-17 — see the unticked boxes for what is still to check. Paths, field names and shapes are as the prompt gave them. Deviations: document pushes follow the cron's real milestones (30 / 7 / 0 days and on expiry, not 30 / 14 / 1); one bug fixed on the way (withdrawing a mechanic-raised dispute marked an unfinished job `completed`).

Source: `bmt-mechanic-app/docs/inbox-crm-prompt.md`. Builds on Tasks 64–68.

## Only Book My Tech decides a dispute

Owner's decision, 2026-09-17: **the customer and the mechanic can only communicate about a dispute; BMT decides all of it.** A mechanic's routes are exactly five — open, upload a photo, reply, ask BMT to step in, withdraw an issue *they* raised — plus one read. There is no route, and must never be one, by which a mechanic accepts, agrees, offers, settles, refunds or resolves. `resolveDispute` stays in `app/actions/disputes.ts`, admin-only, and its header now says why. The message route reads `body` and `photos` from the request and nothing else; `visibleTo` is not read from a mechanic's body and the core ignores it from anyone but an admin.

## ⚠️ Migration `0085` — and do NOT run `0032`

The prompt is right that the Resolution Center's tables look absent from production (they are missing from the generated types). I could not confirm it against the database from this session. So `0085` **creates them itself**, word for word as `0032` defines them, idempotently — it is correct whether or not `0032` was ever applied.

**Do not run `0032` now.** Its last section rewrites the `booking_events` event-type CHECK to the July list, which lacks `arrival_window_set`, `fault_added`, the `quote_*` and the `revision_*` types added since. Against today's rows it fails. The `resolution_opened` / `resolution_redistributed` types it existed to add are **already** in the live CHECK — `0052`, `0062` and `0064` each carried them forward — so nothing else is needed for them.

`0085` contains:

1. `resolution_reasons`, `resolution_cases`, `resolution_messages` (as `0032` §1–3). One change: the reason list's SELECT policy was the only mechanic gate keyed on `profiles.role`; it is now "has a `mechanics` row, or is an admin", like every other.
2. `resolution_cases.photos text[]` (cap 6).
3. `dispute_messages.photos text[]` (cap 6).
4. `dispute_messages.visible_to` — `'mechanic' | 'customer'`, null = everyone; a CHECK that only an admin's row may set it; and **"Parties read dispute thread" rewritten** so each party's arm also asks whether the row is for them. Privacy is in the policy, not the UI: the other party's client never receives the row. "Admins read dispute threads" is untouched.
5. `mechanic_inbox_reads` + `mark_mechanic_inbox_item_read` / `mark_mechanic_inbox_all_read` — a mirror of `0075`.

**Safe to deploy before it is applied.** New columns are only named in an insert when used; the web thread retries its read without them; each inbox source fails soft to nothing; the read routes answer 200 and remember nothing; cases answer a 500 until the tables exist (as the web "Get help" pages already do).

## Routes — all under `app/api/mobile/v1/mechanic/`

| Route | Family | 200 | Shared core |
|---|---|---|---|
| `GET inbox` | `mechanicfeed` | `{ unreadCount, items }` | `loadMechanicInbox` — `lib/inbox/mechanic-feed.ts` |
| `POST inbox/read` `{ id }` | `mechanicfeed` | `{ unreadCount }` | `markMechanicInboxItemRead` |
| `POST inbox/read-all` | `mechanicfeed` | `{ unreadCount }` | `markMechanicInboxAllRead` |
| `POST cases` `{ bookingId, reasonId, description, photos? }` | `mechanic` | `{ caseId }` | `openResolutionCaseFor` — `lib/resolutions/core.ts` |
| `POST cases/[id]/messages` `{ body }` | `message` | `{ id }` | `postResolutionMessageFor` |
| `POST cases/[id]/close` | `mechanic` | `{}` | `updateResolutionStatusFor(…, "closed")` |
| `POST cases/photos` (multipart) | `mechanicupload` | `{ url }` | `uploadCasePhotoFor` |
| `POST bookings/[id]/disputes` `{ reasonCategory, description, photos? }` | `mechanic` | `{ disputeId }` | `openDisputeFor` — `lib/disputes/core.ts` |
| `POST disputes/photos` (multipart) | `mechanicupload` | `{ url }` | `uploadDisputePhotoFor` |
| `GET disputes/[id]` | `mechanicfeed` | `MechanicDisputeView` | `mechanicDisputeViewFor` — `lib/disputes/mechanic-view.ts` |
| `POST disputes/[id]/messages` `{ body, photos? }` | `message` | `{ id }` | `sendDisputeMessageFor` |
| `POST disputes/[id]/escalate` | `mechanic` | `{}` | `escalateDisputeFor` |
| `POST disputes/[id]/withdraw` | `mechanic` | `{}` | `withdrawDisputeFor` |

Photo uploads use `mechanicupload` (Task 67's family) rather than the customers' `upload`, which is sized for six dispute photos a day. Refusals are non-2xx `{ error }`; the dispute and case cores now carry an optional `code` for that (absent = 409), which the website and the customer app ignore.

### Delegate, never reimplement

- `app/actions/resolutions.ts` was cookie-bound: open / message / status moved to `lib/resolutions/core.ts` with a `ResolutionCaller { userId, role }`. **The app always acts as `role: "mechanic"`**, even for an admin who also works jobs — in the core `admin` means any job and any case.
- `escalateDispute` moved into `lib/disputes/core.ts` as `escalateDisputeFor`.
- Every dispute route first checks the caller is the **mechanic on that job** (the core accepts either party, or an admin).
- `uploadEvidencePhoto(file, callerId, folder)` serves `disputes/` and `cases/`; `ownEvidencePhotos()` keeps only URLs under `job-media/<folder>/<callerId>/`. Applied to case photos, dispute-message photos and a mechanic's dispute-open photos.

## The Inbox

Seven sources, newest first, capped at `FEED_LIMIT` (60); `unreadCount` counts past the cap. Wording is pure and unit-tested in `lib/inbox/mechanic-events.ts`, beside the customer's.

- **Assembled on the service role, scoped to the mechanic in every query** — not through the caller's client like the customer's feed. A job reassigned away stops being readable under RLS at the moment it becomes news.
- **Events are an allow-list**, and never anything the mechanic did themselves (`actor_id` or `actor_role`). `mechanic_reassigned` only reaches the mechanic who *lost* the job.
- **Read state** is the customer's rules (`lib/inbox/read-state.ts`): an instant for "Mark all read", ids for single items, seven days and it counts as read. `thread:` items ignore it; a `case:` is unread only while an admin's message is the latest.
- **Documents**: `at` is when it became this news (the 30-day mark, the 14-day mark, the expiry, the review), so one that turns urgent is news again after "Mark all read".
- Titles shared with their pushes: `reviewTitle`, `payoutTitle`.

## Pushes — all via `pushMechanicUpdate` (`lib/push/mechanic-updates.ts`), channel `updates`

Each sits beside the email or SMS that already existed, and none waits on there being an email address or phone number.

| When | Title | `data` |
|---|---|---|
| dispute opened by the customer / their or BMT's message / escalated by the customer / resolved / withdrawn by the customer | the email's own subject | `{ type: "dispute", disputeId }` |
| dispute auto-escalated by the cron | "Book My Tech is stepping in" (there is no email for this) | same |
| admin replies in a case, resolves or closes it, or opens one | "Book My Tech replied" / "Book My Tech opened a case" | `{ type: "case", caseId }` |
| quote, revision or reschedule answered; quote or revision expired; customer cancels or moves the job | a short title; **body is the SMS text** | `{ type: "job", bookingId }` |
| new review | "Priya S left a 5-star review" | `{ type: "reviews" }` |
| payout transferred (once per payout, the amount that reached them) | "Payout sent · £268" | `{ type: "earnings" }` |
| document 30 / 7 / 0 days from expiry, and on expiry | "… expires in 7 days" | `{ type: "documents" }` |

A private note for the customer alone does not push, email or nudge the mechanic.

## Web changes

- The shared dispute thread shows photos, and for an admin a selector — "Everyone sees this / Only the mechanic sees this / Only the customer sees this" — and a "Private" label on such notes.
- Both case pages show the case's evidence (`components/resolutions/case-photos.tsx`).

## A bug fixed on the way

`withdrawDisputeFor` always set the booking back to `completed`. A mechanic can raise a dispute on a job that is `en_route` or `in_progress`; withdrawing it then marked the job finished **without the customer being charged or the mechanic paid**. It now restores the status recorded in the `dispute_opened` event. `resolveDispute` has the same line and was left alone — that is an admin's decision on a money path, and worth a look.

## Acceptance criteria

- [ ] `GET /inbox` returns every source for a mechanic who has one of each, with `unread` following the read routes; 403 for a customer. *(Wording and read rules unit-tested; not run against data.)*
- [ ] A mechanic's token can raise a case with a photo, reply in it and close it; open a dispute, reply with a photo, escalate and withdraw. *(Not run. Needs `0085`.)*
- [ ] A private note is unreadable with the other party's token under RLS. *(In the policy; not exercised. Needs `0085`.)*
- [x] No mechanic route can resolve a dispute or move money on one. *(By inspection: the six dispute routes are open, photo, read, reply, escalate, withdraw-own.)*
- [ ] Each push arrives once, on `updates`, with its `data`. *(Not sent.)*
- [x] The customer app and the web dispute, case and inbox pages behave as before. *(Same cores and return shapes; typecheck, lint, 631 tests, production build. Not clicked through.)*
- [x] **`0085` applied** — Brad, 2026-09-17. He had run `0032` earlier the same day; it errored (on the out-of-date `booking_events` CHECK, as expected) and, having no explicit transaction of its own, rolled back whole. Worth one look at the live CHECK to be sure — the query is in `docs/HANDOFF.md`.

## For the app repos

- **`bmt-mechanic-app`:** contract kept. Regenerate types after `0085`. Document pushes arrive at 30 / 7 / 0 days and on expiry. `inbox/read-all` can return a non-zero `unreadCount` (unread threads). A closed dispute's `can` is all false.
- **`bmt-customer-app`:** regenerate types after `0085` — `dispute_messages` gains `photos` and `visible_to`. Its direct read keeps working and now never returns a note meant for the mechanic; it may receive `photos` on a mechanic's message and, until it renders them, shows the text alone. Its dispute routes' `{ ok: false }` answers may now carry an extra `code` field, and a sent message an `id` — both additive.
