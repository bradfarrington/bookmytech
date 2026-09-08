# Task 36 — Remove the customer signature from the mechanic's completion flow

**Status:** ✅ Complete (2026-09-08) — on branch `task-36-remove-signature` (stacked on 30–35). **No migration.** `tsc` clean, 318 unit tests (unchanged), lint clean on every touched file, production build compiles. **Not exercised in a browser.** Deviations from the plan: none.

## Why this exists

Item 2 of Gareth's change list (2026-09-08): *"Delete the signature part from mechanics
booking."* It was parked on 2026-09-08 when Brad said "keep it for now and we will come back
to this", and unparked the same day: **"delete the signature we dont need this now."**

## What it was

Completing a job opened a `<canvas>` signature pad on the mechanic's screen. The customer
signed, the PNG went to the public `job-media` bucket as a `booking_media` row with
`kind = 'signature'`, and `completeAndCharge` **refused to complete until that row existed** —
so no signature meant no capture and no payout.

Nothing downstream ever read it. Not the customer, not the admin, not the disputes flow, not
an email, not the mobile app (`booking_media` has no customer RLS policy at all). It was shown
back only on the mechanic's own job page.

## What shipped

- **The gate is gone.** `completeAndCharge` no longer counts signature rows. The other two
  gates it grew since — the Task 32 checklist and mileage checks on a service or inspection —
  are untouched and still run before Stripe.
- **The record is the mechanic's own confirmation.** Completing now opens a confirm panel
  naming the amount ("Charge £114.00 to the customer's card and mark this job complete?"), and
  the completion `status_changed` event carries `mechanic_confirmed: true` and `charge_pence`
  alongside the mileage and checklist summary it already had.
- **Deleted:** `signature-pad.tsx`, `saveSignature` in `app/actions/job-media.ts`, the
  "Customer sign-off" card and `signatureUrl` / `hasSignature` props on the mechanic's job
  page. `JobActions` gained `chargePence` in their place.
- **Copy, everywhere it promised a signature:** the customer's live tracker ("You'll be asked
  to sign off" → "We'll email your receipt"), the price hero and the booking-confirmed email
  ("until the job is complete and you've signed off" → "until your mechanic has completed the
  job"), the review page, and the mechanic's earnings note ("Paid out after the customer signs
  off" → "after you complete the job").
- **The dispute reason `refused_signoff` keeps its value** — it is stored on existing rows —
  but is relabelled "Customer disputes that the work was done".
- **No migration.** `booking_media.kind` still allows `'signature'`, so the PNGs already
  captured stay readable and nothing has to be migrated or deleted.

## What this costs

The signature was the only customer acknowledgement at completion. What remains as evidence:
the mechanic's explicit confirmation (timestamped, attributed, with the amount, on the
completion event), the job photos, and — on a service or inspection — the Task 32 checklist
and report, which is a far stronger record of what was actually done than a scribble on a
phone. Worth knowing if a dispute ever turns on "was the work finished".

## How to verify

1. As a mechanic on an `in_progress` job: **Complete job & charge customer** → a confirm panel
   names the amount → **Confirm & charge** → "Job complete — payment captured." No pad, no
   second button, no "Use saved signature".
2. `booking_events` for that booking: the `status_changed` row's payload has
   `"mechanic_confirmed": true` and `"charge_pence"`, plus `mileage` and any `checklists`.
3. The job page has no "Customer sign-off" card.
4. Regression: a **service or inspection** still refuses to complete with an unanswered
   checklist item or no mileage (Task 32) — the signature gate went, those did not.
5. Customer copy: the tracker at `/book/confirmed/[id]` while in progress says "We'll email
   your receipt as soon as it's done"; the price page and the confirmation email say the
   payment is captured when the mechanic completes the job.

## Acceptance criteria

- [x] The signature pad, its action and its completion gate are gone
- [x] Completing asks once, naming the amount, and records the mechanic's confirmation
- [x] Every customer- and mechanic-facing mention of signing off is reworded
- [x] Task 32's checklist and mileage gates still hold
- [x] No migration; existing signature rows and PNGs are left alone
- [ ] Exercised in a browser — script above

## Mobile app (per AGENTS.md)

**Nothing to do.** `booking_media` was never readable by the app (no customer RLS policy), so
the signature was invisible to it. No schema change, no API change. The only thing worth
knowing: a completion `status_changed` payload now carries `mechanic_confirmed` and
`charge_pence` — additive fields on an event the app already renders.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
