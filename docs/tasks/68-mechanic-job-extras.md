# Task 68: The mechanic app — the rest of the job page (faults, revisions, end on site, part status, running late)

**Status:** 🟡 **Built 2026-09-17, not yet run.** Typecheck, lint on every touched file, 617 unit tests and a production build pass; all ten new paths register. **Nothing has been called with a token** — the live checks were not possible from this session (see the unticked boxes). Paths, field names and shapes are as the prompt gave them. Additions: `GET …/follow-on-draft` (the prompt's conditional ask — the pre-fill was the web page's), quoted faults are now checked against the job, and `end-on-site` had the same double-payout race `complete` had, now closed.

Source: `bmt-mechanic-app/docs/job-extras-crm-prompt.md`. Builds on Task 67, and covers everything it left web-only.

## Routes — all under `app/api/mobile/v1/mechanic/`

| Route | Family | 200 | Shared core |
|---|---|---|---|
| `POST bookings/[id]/faults` `{ description, severity? }` | `mechanic` | `{ id }` | `addFault` — `lib/quotes/mechanic.ts` |
| `POST faults/[faultId]/remove` | `mechanic` | `{}` | `deleteFault` |
| `GET bookings/[id]/revision` | `mechanicfeed` | `{ current, revisions, canRevise, reviseBlocker, onSiteOptions? }` | `revisionPanelFor` — `lib/revisions/mechanic.ts` |
| `POST bookings/[id]/revision` `{ repairIds, parts, reason, note? }` | `mechanic` | `{ id }` | `sendRevision` |
| `POST bookings/[id]/revision/preview` `{ repairIds, parts }` | `mechanicfeed` | `{ before, after, diff }` (trimmed) | `previewRevision` + `previewView` |
| `GET bookings/[id]/catalogue?query=` | `mechanicfeed` | `{ hits, truncated }` | `searchJobCatalogue` |
| `POST revisions/[revisionId]/withdraw` | `mechanic` | `{}` | `withdrawRevision` |
| `POST bookings/[id]/end-on-site` `{ charge, note? }` | `mechanic` | `{ status: "cancelled", chargedPence, payoutPence }` | `endJobOnSite` |
| `GET bookings/[id]/follow-on-draft` | `mechanicfeed` | `{ title, note, lines }` | `followOnDraftFor` |
| `POST booking-parts/[partId]/status` `{ status }` | `mechanic` | `{}` | `markPartStatusFor` — `lib/mechanics/part-sourcing.ts` |
| `POST reschedules` `{ items, note? }` | `mechanic` | `{ proposed, failed }` | `proposeReschedulesFor` — `lib/bookings/propose-reschedule.ts` |

Refusals as Task 67: `{ error }` with 400 / 403 / 404 / 409, the sentence verbatim; a database failure is logged and replaced with a 500.

### Delegate, never reimplement

Faults, revisions and catalogue search already had cores taking the mechanic id; they gained refusal codes. Two pieces were still inside `"use server"` files and moved: `markPartStatus` → `markPartStatusFor`, and the loop of `proposeReschedules` → `proposeReschedulesFor`. Three things the website's panel worked out in the browser now have one server-side source that both use:

- `reviseBlocker()` — why a revision can't be sent. `sendRevision` refuses with it; `GET …/revision` reports it.
- `chosenItemId()` (`lib/bookings/repair-lines.ts`) — which catalogue id a group of lines was chosen by. The web panel's chips and `current.repairs[].id` use it.
- `FOLLOW_ON_TITLE` (`lib/revisions/diff.ts`) — the title the follow-on quote opens with.

## The answers the prompt asked for

**Does `POST …/quotes` accept `faultId` on a line?** It already did: `QuoteLineInput.faultId` → `job_quote_lines.fault_id`, and the fault's `quote_id` is pointed at the quote. Two things were tightened because a route handler passes JSON straight through: a non-string `faultId` / `nodeId` / `description` no longer throws in the pricer, and a `faultId` that isn't a fault **on this job** is refused (409) — before, the line would have stored another job's fault id.

**`RevisionDirection`** is `"more" | "less" | "same"`, purely the sign of `differencePence`. The mechanic-facing copy is `mechanicDirectionSentence` (`lib/revisions/diff.ts`):

- **more** — "Customer pays £X more. They'll authorise it on their card when they approve. Don't start the new work until it shows Approved."
- **less** — "Customer pays £X less. The difference is released from their hold when you complete the job. They still need to approve the change."
- **same** — "Same price. The customer still needs to approve the change of work."

The customer reads `customerDirectionSentence`: "£X more than you booked. You'll authorise the difference on your card now, and nothing is charged until the job is complete." / "£X less than you booked. Only the new total is charged when the job is complete, and the rest of your pre-authorisation is released." / "The same price as you booked." The short form is `differenceLabel`: `+£23.40`, `−£18`, `no change`.

**Is the follow-on quote pre-filled server-side?** No — the website's job **page** computed it and handed it to its panel. So `GET …/follow-on-draft` exists: `{ title: "The rest of the work from your visit", note: null, lines }`, from the same `followOnLinesFromRevision`. `lines` is empty unless the job is `completed` and a revision was approved on it — the same condition as the website's button.

## Things worth knowing

- **`end-on-site` is safe against a double call.** Settling the hold already read a captured intent back instead of capturing again; the status change is now a claim, so of two overlapping calls only one pays the mechanic and the other gets a 409. Same fix, same reason, as `complete` in Task 67 — and the website had the same exposure to a double click.
- **`onSiteOptions`** is present exactly when `endJobOnSite` would proceed: `in_progress`, nothing pending, and a revision declined **or lapsed** (an expired one counts, as on the website). Amounts are the ones the charge will use.
- **A lapsed revision reads `expired`** in `revisions[]` even before the hourly cron has updated the row, so the list and `onSiteOptions` agree.
- **`canRevise` stays true after a decline.** `sendRevision` has never refused a second attempt after a declined one; the website's panel simply offers the end-the-job options instead. The app may do either.
- **`current.parts` is the mechanic's own parts only.** Supplier parts priced into a repair belong to the repair and are re-priced with it; they are not editable on a revision, on the website either.
- **`current.repairs` groups a combined repair into one entry**, by its option id — that is the id `repairIds` wants back.
- **Part status order isn't enforced**, as it isn't on the website.
- **`POST /reschedules`: partial success is a 200.** Each failed job carries the sentence the single-job route would have refused it with.
- **No migration.** Nothing here changes the schema or seeds settings.

## Acceptance criteria

- [ ] A mechanic's token can add and remove a fault; preview, send and withdraw a revision; end a declined job on site with each charge option; mark a part ordered → delivered → used; and move two jobs in one call. *(Not run. Same cores as the website.)*
- [ ] Two overlapping `end-on-site` calls pay the mechanic once. *(The claim is in; not exercised.)*
- [ ] A customer's token gets 403 everywhere; another mechanic's gets 403/404. *(By construction — `requireMobileMechanic`, then each core's ownership check — not exercised.)*
- [x] The web job page behaves exactly as before. *(Actions return the same shapes; the panel's chip ids and follow-on title now come from shared helpers with the same values. Typecheck, lint, 617 tests, production build. Not clicked through.)*

## For the app repos

- **`bmt-mechanic-app`:** contract kept. `revision/preview` answers **400** while a draft can't be priced — expected. `onSiteOptions` is **absent**, not null or empty, when ending on site isn't allowed. `POST /reschedules` can return 200 with everything in `failed`. Use `GET …/follow-on-draft` for "Quote the rest of the work". No types to regenerate for this task.
- **`bmt-customer-app`:** nothing to do.
