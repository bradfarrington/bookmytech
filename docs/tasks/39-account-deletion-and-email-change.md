# Task 39 — Account deletion from the app; propagating an email change

**Status:** ✅ Code-complete (2026-09-10) — on branch `task-39-account-deletion`. ⚠️ **Migration `0065` must be applied** (after `0059`–`0064`): `profiles.deleted_at`, the `account_deletions` audit table, the `delete_customer_account()` function, `customer_admin_summary` gains `deleted_at`, and the `on_auth_user_email_changed` trigger on `auth.users`. `tsc` clean, 352 unit tests (20 new), eslint clean on every touched file, production build compiles. **Not exercised against the live database** — script under "How to verify". Deviations from the spec: `requireMobileCustomer` did not exist and was added (`lib/mobile/booking-guards.ts`, `requireMobileUser` + `staffRefusal`); `auth.admin.signOut` takes the caller's JWT, not a user id, so the global sign-out uses the Bearer token the request carried; the audit row is a new `account_deletions` table because there is no general admin audit log; P3 (website email change) shipped too.

## Why this exists

The customer app's settings screen (2026-09-10) has change email, change
password and delete account. Password change is entirely client-side. Email
change is client-side too — on purpose, see P2 — but leaves our copies of the
address stale. Deletion cannot be done from the app at all: it needs the
service-role client and a decision about which records survive.

**Apple's App Store guideline 5.1.1(v)** requires any app that offers account
creation to let the customer *initiate* deletion from inside the app. The
app's button calls `POST /api/mobile/v1/account/delete`; until that existed
it 404'd and the app could not be submitted. This is the blocker.

The prompt from the app repo is `docs/account-crm-prompt.md` there; the
governing rules are the standing ones in `AGENTS.md`.

## P1 — `POST /api/mobile/v1/account/delete`

**Body** `{ "confirm": true }` — 400 without it. **Auth** `requireMobileCustomer`
(401 no/expired token, 403 staff token). **Rate limit** the `action` family,
same as cancel and reschedule. **200** `{ ok: true }` or
`{ ok: false, code, error }`.

### Refusals — `lib/account/blockers.ts` (pure, tested)

| `code` | Exact set | Sentence |
|---|---|---|
| `live_booking` | `bookings.status ∈ {sourcing_mechanic, confirmed, en_route, in_progress}` | "You have a booking in progress. Cancel it or wait until it's finished, then try again." |
| `open_dispute` | `disputes.status ∈ {opened, responded, escalated}` on any of their bookings, whoever opened it | "You have an open dispute. Once it's resolved you can delete your account." |
| `pending_quote` | `job_quotes.status = 'sent'` on any of their bookings, with `expires_at` null or in the future | "A quote on one of your jobs is still open. Approve or decline it first." |

Notes on the sets: a `completed` booking inside its 48-hour dispute window is
**not** a blocker (deletion forfeits the right to dispute; the app's copy says
so). "A quote they approved whose hold is not yet confirmed" is still
`status = 'sent'` — approving a `now` quote opens the second Stripe hold but
the row only moves to `approved` on `/confirm` — so it is covered by the one
status. A `sent` quote past its expiry is not a blocker (the cron will expire
it). `job_revisions` awaiting an answer only exist on an `in_progress` booking,
so `live_booking` covers them. The legacy `disputed` booking status (never
written by current code) is left to the dispute check. Checked in the order
the customer can act on them: booking, then dispute, then quote. No fourth
code was added.

"Their bookings" = `customer_id = uid` **or** (`customer_id is null` and
`customer_email = email`) — the two arms of the read policy — so a guest-era
row the account can see counts.

### What "delete" means

Completed bookings are financial records (HMRC six years; the mechanic payout
ledger references them; a review feeds a public rating). And a hard delete of
`profiles` is impossible anyway: `messages.sender_id`, `disputes.opened_by`,
`dispute_messages.sender_id`, `funnel_events.user_id`, the `resolution_*`
tables and every `reviewed_by` / `updated_by` audit column reference
`profiles(id)` with no `on delete` clause (0019, 0020, 0025, 0032). So:

1. **Revoke every session** — `auth.admin.signOut(<caller's JWT>, "global")`.
   The auth API takes the JWT, not a user id; the Bearer token the request
   carried is the handle. A failure here is logged, not fatal (step 4 closes
   sign-in anyway).
2. **Confirmation email to the OLD address** — new locked template
   `account_deleted` ("Your Book My Tech account has been deleted"). Awaited;
   a failure is logged and does not stop the deletion. Sent before the
   address is scrubbed.
3. **The database, in one transaction** — `public.delete_customer_account(uid,
   email, sentinel, source, ip)` (0065; SECURITY DEFINER, `service_role`
   only, re-runnable):
   - `profiles`: `full_name → 'Deleted customer'`, `phone`, `avatar_url`,
     `referral_code`, `referred_by → null`, every `reminder_*` flag (email,
     SMS, push, master) `→ false`, `deleted_at → now()`. Row and id kept.
     Role-gated to `role = 'customer'`; raises otherwise.
   - `bookings` with `customer_id = uid` (or guest rows matching the email):
     `customer_email → deleted+<uid>@invalid.bookmytech.co.uk`,
     `customer_phone → null`. `customer_name` and the address stay — they are
     the invoice. The guest arm matters because the real address is freed
     for a fresh sign-up, and a new account on that address would otherwise
     see the old guest rows through the policy's email arm.
   - Deleted: `customer_push_tokens` (all), `reminder_schedules` not yet sent
     (by id, and by email for guest-era rows), `customer_credits` grants
     (`source <> 'redemption'` — redemption rows are tied to a booking).
   - `account_deletions` audit row with the counts.
4. **The auth row, made unusable, not deleted** — `auth.admin.updateUserById`
   with the sentinel email (`email_confirm: true`, so no confirmation goes to
   an address nothing receives), a random password, `full_name` cleared from
   `user_metadata`, and `ban_duration: "876000h"` (100 years). Sign-in,
   password reset and email change are all closed; the real email is freed.
   **Chosen because `profiles.id` cascades from `auth.users`** — per
   `docs/02-data-model.md` ("References `auth.users(id)`, cascades on
   delete"; `profiles` has no migration in the checkout so this is the design
   doc, not a live read — see the verify script for the one-line check).
   Deleting the auth row would take the profile and every FK pointing at it.

3 runs before 4 deliberately. If 4 fails, the customer is told to sign in and
try again; their credentials still work, 3 is idempotent, 4 runs again. The
other order would lock someone out of an account whose data is intact, with
no way to retry.

**Stripe:** the CRM only ever creates PaymentIntents — no Customer object
exists for any customer (`grep stripe.customers` → nothing), so there is
nothing to delete. Live-booking holds can't exist here (refused); an
abandoned checkout hold expires on its own after seven days.

**Admin:** `customer_admin_summary` now carries `deleted_at`; `/admin/customers`
shows a "Deleted" pill and "Account deleted" in place of the sentinel email;
the detail page shows the pill with the date and "Removed on deletion" for
the email.

### Ownership

The token is the only thing choosing whose account goes: the body carries no
id and none would be read (`AccountDeletionCaller` is built from
`auth.caller`). A staff token is 403'd by `requireMobileCustomer` before the
rate limit or any read.

## P2 — Propagating an email change: the trigger went in

`on_auth_user_email_changed` — `after update of email on auth.users`, calling
`public.handle_user_email_change()` (SECURITY DEFINER, same shape as
`handle_new_user`). Rewrites `bookings.customer_email` where
`customer_id = new.id and status not in ('completed', 'cancelled')`, and
`reminder_schedules.customer_email` where `sent_at is null` and (`customer_id
= new.id` or a guest-era row on the old address). Completed bookings keep the
address they were invoiced to. Not the `/account/email-synced` alternative:
the app cannot be relied on to be the device the confirmation was tapped on.

Side effect worth knowing: the deletion's step 4 changes the auth email to
the sentinel, so the trigger fires then too and rewrites non-terminal
bookings to the sentinel — which step 3 already did. Harmless and consistent.

## P3 — Website email change (shipped)

`app/(customer)/dashboard/settings/_components/email-form.tsx`: the same
client-side `supabase.auth.updateUser({ email })`, with
`emailRedirectTo: <origin>/dashboard/settings?email=changed`. The settings
page shows a "confirmation received" banner on that flag and always renders
the live address from `getUser()`. The read-only "contact support" copy is
gone. No server code. The redirect URL must be allowed in the Supabase
dashboard (see below).

## Supabase dashboard — not code

- **Redirect URLs**: add `bmtcustomer:///email-changed` (app) and
  `https://<site>/dashboard/settings?email=changed` (web; a wildcard on the
  site origin also covers it) alongside `bmtcustomer:///reset-password`.
- **Secure Email Change**: leave **on**.
- **Secure password change**: either setting works.

## Files

- `supabase/migrations/0065_account_deletion_and_email_sync.sql`
- `lib/account/blockers.ts` (+ `blockers.test.ts`) — the refusal rule, the sentinel
- `lib/account/delete-account.ts` — the shared core, order of operations
- `app/api/mobile/v1/account/delete/route.ts` — the thin wrapper
- `lib/mobile/booking-guards.ts` — `requireMobileCustomer`
- `emails/registry.ts` (`account_deleted`), `lib/notifications/locked.ts` (locked on)
- `app/(admin)/admin/(shell)/customers/page.tsx`, `_components/customers-table.tsx`, `[id]/page.tsx`
- `app/(customer)/dashboard/settings/page.tsx`, `_components/settings-form.tsx`, `_components/email-form.tsx`

## Acceptance criteria

- [x] `POST /api/mobile/v1/account/delete` exists; 400 without `{ confirm: true }`; 401 without a token; 403 with a staff token; 429 on the `action` family
- [x] Refusals at 200 with `{ ok: false, code, error }` for `live_booking`, `open_dispute`, `pending_quote`; sets and sentences documented above; pure rule unit-tested
- [x] Sessions revoked globally; confirmation email to the old address; profile anonymised in place; bookings scrubbed and kept; push tokens, unsent reminders and unspent credit deleted; audit row written — the database half in one transaction
- [x] Auth row made unusable (sentinel email, random password, permanent ban); real address freed
- [x] Stripe: confirmed no Customer object exists; step skipped and said so
- [x] `customer_admin_summary` reads `deleted_at`; admin list and detail show the state, not the sentinel
- [x] Trigger on `auth.users` propagates a confirmed email change to non-terminal bookings and unsent reminders
- [x] Website settings page can change email client-side (P3)
- [ ] Exercised against the live database — deferred to Brad (script below); `0065` is unapplied

## How to verify (live)

```sql
-- Does profiles.id cascade from auth.users? (the assumption behind step 4)
select confdeltype from pg_constraint
 where conrelid = 'public.profiles'::regclass and contype = 'f';
-- 'c' = cascade. If it is not 'c', step 4 still works (the auth row is kept),
-- but the cleaner option becomes auth.admin.deleteUser — say so before switching.
```

```bash
TOKEN=<customer access token>; BASE=https://<preview>/api/mobile/v1
# tripwire
curl -s -X POST $BASE/account/delete -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{}'            # 400
# refusal (with a confirmed booking on the account)
curl -s -X POST $BASE/account/delete -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"confirm":true}'  # {ok:false, code:"live_booking"}
# staff token
curl -s -X POST $BASE/account/delete -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" -d '{"confirm":true}'  # 403
# the real thing, on a throwaway customer with only completed/cancelled bookings
curl -s -X POST $BASE/account/delete -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"confirm":true}'  # {ok:true}
```

Then check: the old inbox has "Your Book My Tech account has been deleted";
`profiles` row is `Deleted customer` with `deleted_at` set and null contact
fields; every booking of theirs has the sentinel email and null phone but its
name and address; `customer_push_tokens` / unsent `reminder_schedules` /
credit grants are gone; `account_deletions` has a row; `auth.users` shows the
sentinel email and `banned_until` a century out; signing in with the old
credentials fails; signing up afresh with the old address succeeds;
`/admin/customers` shows the "Deleted" pill.

Email change: on the app or `/dashboard/settings`, change the address, click
both links, then `select customer_email from bookings where customer_id = …`
— non-terminal rows carry the new address, completed rows the old one.

## When complete

- [x] This md's status line and boxes reflect reality
- [x] `docs/HANDOFF.md` updated; current task pointer left on Gareth's list (this is a side task for the app submission)
- [x] `docs/02-data-model.md` — `profiles.deleted_at`, `account_deletions`, the trigger
- [x] Committed on `task-39-account-deletion`
