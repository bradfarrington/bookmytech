# Task 70: The mechanic app — the Account tail (earnings, documents, profile, reviews, account)

**Status:** 🟡 **Built 2026-09-18, not yet run.** Typecheck, lint on every touched file, 649 unit tests and a production build pass; all 8 routes register. **Nothing has been called with a token, and no Stripe call has been made for real.** Migration `0086` is **NOT yet applied** — `POST /mechanic/account/delete` answers 500 until it is. Paths, field names and shapes are as the prompt gave them, with the deviations listed under "Deviations" below.

Source: `bmt-mechanic-app/docs/account-crm-prompt.md`. Seventh and last of the mechanic-app prompts; builds on Tasks 64–69.

## Not in scope: the Pro tier

`mechanics.is_pro` is an admin-set flag with no criteria, no path to it and a
`take_rate_pro` that is never applied (Task 11 Stage 2 was deferred). So
`/earnings` quotes `take_rate_base` and nothing else — putting a Pro rate on a
mechanic's screen would be quoting a number their next job will not use. If the
tier is ever built it gets its own prompt, and `commissionRate` is the one field
that changes.

## Routes — all under `app/api/mobile/v1/mechanic/`

| Route | Family | 200 | Shared core |
|---|---|---|---|
| `GET earnings` | `mechanicfeed` | `MechanicEarnings` | `mechanicEarningsFor` — `lib/mechanics/earnings-summary.ts` |
| `POST stripe/dashboard` | `mechanic` | `{ url }` | `createDashboardLink` — `lib/stripe/connect.ts` |
| `POST documents` (multipart) | `mechanicupload` | `{ id }` | `uploadMechanicDocumentFor` — `lib/mechanics/documents.ts` |
| `GET documents/[id]/url` | `mechanicfeed` | `{ url, expiresIn }` | `mechanicDocumentUrlFor` |
| `POST avatar` (multipart) | `mechanicupload` | `{ url }` | `uploadAvatarFor` — `lib/mechanics/avatar.ts` |
| `POST reviews/[id]/response` `{ response }` | `mechanic` | `{}` | `respondToReviewFor` — `lib/reviews/respond.ts` |
| `POST account/email` `{ new_email, current_password }` | `action` | `{ ok, sentTo }` / `{ ok:false, error, field? }` | `requestEmailChangeFor` — `lib/account/email-change.ts` |
| `POST account/delete` `{ confirm: true }` | `action` | `{ ok }` / `{ ok:false, code, error }` | `deleteMechanicAccountFor` — `lib/account/delete-mechanic-account.ts` |

`action` is new to `MechanicLimitFamily` (`lib/mobile/mechanic-actions.ts`). Its
four limits were already seeded for the customer app, and the two account
endpoints are the same two endpoints doing the same password check and the same
irreversible write, so they share the bucket rather than getting a new one.

## Nothing here duplicates an RLS read

The app already reads `mechanic_ledger`, its completed `bookings`,
`mechanic_documents`, `reviews` (with the `bookings(customer_name)` join),
`profiles` and `mechanics` directly, and writes `full_name`, `phone`, `bio`,
`service_radius_miles`, `specialisms` and `mechanic_availability` directly —
exactly as the web pages do. What landed here is only what the web does with the
secret key or the service role.

## 1. Earnings

`GET /earnings` answers the four things the app cannot see:

- **`balance`** — `mechanicBalanceSummary` (`lib/mechanics/balance.ts`),
  unchanged. `balancePence` goes negative while a refund BMT fronted is being
  recovered; the app already has copy for that.
- **`commissionRate`** — `getTakeRateBase()`, as a fraction.
- **`account`** — `{ bankName, last4 } | null`, from
  `stripe.accounts.listExternalAccounts(…, { object: "bank_account" })`,
  preferring `default_for_currency`. Nothing else about the bank account leaves
  Stripe.
- **`payouts`** — `stripe.transfers.list({ destination, limit: 12 })`, newest
  first. Each carries `bookingId` from the transfer's own metadata
  (`payoutToMechanic` writes it) falling back to the `payout` ledger row that
  recorded the same `stripe_transfer_id`, and a `description` built from that
  booking.
- **`payoutsLive`** — false when Connect isn't set up, Stripe is unconfigured,
  **or the transfer list call failed**, so the app says "Payouts start once
  you're set up" rather than "No payouts yet".

**The website's `buildPayoutRows` is deliberately not ported.** It is a weekly
accrual preview with a `•••• 4242` seed, and mechanics are paid per job on
completion (owner decision 2026-07-01). There is no "next payout" and the app
draws none. The web earnings page still uses it as its fallback and is untouched.

### `POST /stripe/dashboard`

`stripe.accounts.createLoginLink(accountId)` — single-use, opened in the in-app
browser like onboarding. It is where the bank account is changed and each
transfer is itemised, so none of that is rebuilt. A mechanic with no
`stripe_account_id` gets a 409 with a sentence; Stripe refusing the link on an
unfinished account is also a 409, because "finish setting up your payouts" is
the useful thing to say.

## 2. Documents

The list stays a direct RLS read. The two halves that need the service role are
now shared, because `mechanic-docs` is a private bucket with no browser grants:

- `POST /documents` — twin of `uploadMechanicDocument`. Same types, 10 MB,
  pdf/jpeg/png/webp, same `documents/<id>/<type>-<ts>.<ext>` path,
  `pending_review`. **Returns the new row's id**, which the website's action
  never needed.
- `GET /documents/[id]/url` — twin of `getMechanicDocumentUrl`, one-hour signed
  URL. The route passes `isAdmin: false`: the caller here is always acting as
  the mechanic whose app it is, so the admin arm the website has is unreachable.

**Replacing a document works, and is a new row.** `mechanic_documents` has no
unique key on `(mechanic_id, doc_type)` and the object path carries a timestamp,
so the newest row per type is the current one and older rows are history — which
is what the app assumed, and what the grace sweep already reads
(`app/api/cron/enforce-grace-periods` counts a type as supplied the moment a
`pending_review` row exists).

## 3. Profile

`POST /avatar` — twin of `uploadAvatar`. 5 MB, jpeg/png/webp, public `avatars`
bucket, path namespaced by mechanic id and upserted, `profiles.avatar_url`
written with the cache-buster. Everything else on the profile screen the app
writes itself under RLS.

## 4. Reviews

`POST /reviews/[id]/response` — twin of `respondToReview`. 1–1000 characters,
`"This isn't your review."` as a 403, `"That review no longer exists."` as a 404.
Editing an existing reply is the same call: one reply per review, overwritten in
place, as the website's editor has always behaved.

## 5. Account

### `POST /account/email`

The customer route's core, body and response shape exactly.
`pending_email_changes.customer_id` is a `profiles` FK, so it works for a
mechanic unchanged, and the confirmation page (`/account/confirm-email`) is the
same web page. The `on_auth_user_email_changed` trigger (0065) rewrites
`bookings.customer_email` by `customer_id` — for a mechanic it matches nothing,
which is right: a mechanic's address is never copied onto a booking.

### `POST /account/delete` — and why `delete_customer_account()` is not enough

That function is role-gated to `role = 'customer'` and would raise on a mechanic
profile, correctly: it scrubs booking contact details and deletes customer
credit, reminders and **customer** push tokens, and knows nothing about an
earnings ledger, live job offers, documents in a private bucket, availability, a
location fix, mechanic push tokens or the `mechanics` row dispatch reads.

**Blockers** (`lib/account/mechanic-blockers.ts`, pure, 18 unit tests), in the
order the mechanic can act on them:

| code | when |
|---|---|
| `live_booking` | a job of theirs is `confirmed`, `en_route` or `in_progress` |
| `open_dispute` | a dispute on one of their jobs is `opened`, `responded` or `escalated` |
| `open_case` | a Get-help case of theirs is `open` or `in_progress` |
| `balance_owed` | `SUM(mechanic_ledger.amount_pence) ≠ 0`, **either direction** |
| `staff_account` | the account also has admin access — refused, not deleted |

`sourcing_mechanic` is deliberately absent: it has no mechanic on it, so it can
never be theirs. A live **offer** is not a commitment either — the deletion
supersedes it. `balance_owed` blocks both ways: money BMT owes them must be paid
before the account goes, and money they owe BMT must be recovered while there is
still someone to recover it from. `staff_account` is the mechanic-side twin of
the customer route's staff 403: an admin who also works jobs keeps
`role = 'admin'` and a `mechanics` row, and deleting "their" account here would
take the admin role and everything it reaches with it.

**The order** (`lib/account/delete-mechanic-account.ts`): blockers → global
sign-out → email the old address → **delete the files** → the database
transaction → the auth row. Storage before the database because storage is not
transactional: if it fails the rows are still there to retry from, where the
reverse order would leave orphan files nothing points at. The database before
the auth row for the customer path's reason — a failure there leaves them able
to sign in and try again.

**What is kept:** the `profiles` row (anonymised in place to "Deleted mechanic"),
the `mechanics` row (`bookings.mechanic_id` references it), completed bookings,
the ledger and the reviews. The `mechanics` row goes `status = 'offline'` **and**
`is_suspended = true` with `suspended_until = null` — the two gates
`lib/dispatch/dispatch.ts` reads — so it can never be offered another job.

**What goes:** document rows (files removed from the bucket first), the avatar
objects, availability, the last location fix, `mechanic_push_tokens`,
`mechanic_inbox_reads`, `mechanic_daily_pushes`, and any live `job_offers` row is
set `superseded` rather than deleted — that table is the dispatch audit trail for
someone else's booking. Their `mechanic_applications` row is scrubbed of the
home postcode, references and AES-GCM bank details but kept as the record that
they were vetted.

## ⚠️ Migration `0086_mechanic_account_deletion.sql` — NOT YET APPLIED

**Run it in the Supabase SQL editor. Idempotent.**

1. `account_deletions` gains `account_role text not null default 'customer'` and
   `details jsonb`. Both additive; the table is service-role only and invisible
   to both apps.
2. `delete_mechanic_account(uuid, text, text, text)` — SECURITY DEFINER,
   `service_role` only, everything above in one transaction.

**Safe to deploy before it is applied.** Only `POST /mechanic/account/delete`
touches it, and until it exists that route answers its 500 sentence. Every other
route in this task is unaffected.

**After applying: `npm run db:types` in BOTH app repos.** Nothing is renamed or
dropped, so old builds keep working.

## Deviations from the prompt

- **`description` format.** The prompt's example was `"Front brake pads & discs ·
  BMT-A1B2"`. There is no `BMT-` reference in this codebase — a booking's
  reference is `formatJobNumber(job_number)`, i.e. `00123` — so the field reads
  `"Front brake pads & discs · Job 00123"`. Same two parts, house wording.
- **`payouts[].status`** is `"paid"` or `"reversed"`. Stripe transfers have no
  status field; `reversed` is the one true distinction, and the web page's
  hardcoded `"paid"` is otherwise correct.
- **`payoutsLive` is false when the transfer call throws**, not only when Connect
  is unset. A Stripe outage must not make the app say "No payouts yet".
- **A fifth deletion code, `staff_account`** — see above. The app shows the
  sentence regardless, so this is additive.
- **Two web copy strings changed** where the website now shares the core:
  `getMechanicDocumentUrl`'s `"Document not found."` → `"That document no longer
  exists."` and `"Not allowed."` → `"This isn't your document."`. Both are
  toasts on `/mechanic/documents` and `/admin/documents`.
- **New email template `mechanic_account_deleted`** (registry-only, no
  migration), locked on in `lib/notifications/locked.ts` for the same reason
  `account_deleted` is: it is how someone notices a deletion they did not make.
  The customer template's wording is about reminders and bookings, so a mechanic
  gets its own.

## What the app repo has to do

- Generate types after `0086` (`npm run db:types`).
- Nothing else breaks: every route here is NEW, and no existing response shape,
  path or field name changed.

## Acceptance criteria

- [ ] A mechanic's token gets its balance, bank name and real transfers from `/earnings`.
- [ ] `/stripe/dashboard` returns a link that opens the Express dashboard; 409 before Connect is set up.
- [ ] A document uploads and opens; the new row's `id` comes back.
- [ ] A replacement upload of a type that is already expired or rejected is accepted, and the newest row is the current one.
- [ ] An avatar uploads and `profiles.avatar_url` carries the cache-buster.
- [ ] A review reply posts, and the same call edits it.
- [ ] An email change sends both emails and the web confirmation page applies it.
- [ ] `0086` applied, then each deletion blocker refuses with its code, and a clear account deletes: profile anonymised, `mechanics` offline + suspended, documents and avatar gone from their buckets, push tokens gone, live offers superseded, ledger and reviews still there.
- [ ] A customer's token gets 403 on every route; another mechanic's gets 403/404 on `documents/[id]/url` and `reviews/[id]/response`.
- [ ] The web earnings, documents, profile and reviews pages behave exactly as before.
- [x] Typecheck, lint, unit tests and a production build pass; all 8 routes register.

## When complete

1. Set the status line above.
2. Update `docs/HANDOFF.md` — "Current task".
3. Commit.
