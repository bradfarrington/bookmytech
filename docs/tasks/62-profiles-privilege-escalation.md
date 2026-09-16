# Task 62: A customer could make themselves an admin (SECURITY)

**Status:** ✅ **CLOSED (2026-09-16).** `0079` applied by Brad and verified live in both directions. Found while answering the customer app's status file.

## The vulnerability

Any signed-in customer could make themselves a platform admin with one call:

```js
supabase.from('profiles').update({ role: 'admin' }).eq('id', <their own id>)
```

**Confirmed against the live project on 2026-09-16.** Signed in as the seeded e2e customer, the update returned `[{"role":"admin"}]` and the row really changed. Restored immediately afterwards.

The `anon` key needed to do this is **public** — it ships in every browser bundle and every build of the customer app — so this was reachable by anyone with a Book My Tech account, not by someone with privileged access.

**What it gets you:** `proxy.ts` gates `/admin/*` on `profiles.role`, and `public.is_admin()` reads the same column, which is the role check in every admin RLS policy on every table. So the entire admin surface, including every customer's data and the dispute money flows, rested on a column the customer could write.

## Cause

`"Users can update own profile"` (`0010`) is:

```sql
for update using (auth.uid() = id) with check (auth.uid() = id)
```

It restricts **which row**, and says nothing about **which columns**. `authenticated` also held a table-wide UPDATE grant, so every column was writable by its owner.

Postgres RLS cannot express "this column may not change" — `WITH CHECK` sees only the new row, so it cannot compare against the old value. Column-level `GRANT`s are the mechanism, and `customer_vehicles` (`0073`) already uses exactly that device for exactly this reason.

**This was half-known.** `0076`'s header says: *"The 'Users can update own profile' policy (0001) is not column-restricted, so a customer can write any profiles column through PostgREST. A `profiles.stripe_customer_id` would let someone point their account at another customer's Stripe Customer, then list or pay with that person's cards."* That reasoning was right and produced the correct decision for that column — the service-role `stripe_customers` table. But it treated the symptom. `role` was sitting behind the same gap the whole time.

The lesson worth keeping: a note explaining why a column was routed around is evidence of a hole, not a record of it being closed.

## The fix — `0079_profiles_column_privileges.sql`

Two mechanisms, deliberately.

1. **Column privileges.** `revoke update on profiles from authenticated, anon`, then re-grant only what a client legitimately writes: `full_name`, `phone`, `reminders_enabled`, `reminder_via_email`, `reminder_via_sms`, `reminder_via_push`. PostgREST refuses an update naming any other column with `42501`, **before** RLS is consulted.
2. **A trigger backstop.** The grant is one line, and a future `grant all on public.profiles to authenticated` — which Supabase's own templates and a lot of copied SQL do freely — would silently reopen it. `profiles_protect_privileged_columns()` restores `id`, `role`, `referral_code`, `referred_by`, `deleted_at` and `created_at` for a customer session. It restores rather than raises, so a careless re-grant fails closed instead of breaking writes.

**Privileged columns and what each one is worth to an attacker:**

| Column | If writable |
|---|---|
| `role` | Platform admin. Every admin page and every `is_admin()` policy. |
| `referred_by` | Point at any account and claim the £10 referral credit. |
| `referral_code` | Take someone else's code, so their referrals credit you. |
| `deleted_at` | Fake a deletion, or undo one. |
| `id` | Repoint a profile row at another auth user. |
| `created_at` | Audit order. |

**Why `avatar_url` is not granted:** only the service role writes it today (mechanic uploads go through `app/actions/mechanic-profile.ts` with the admin client). A client-writable image URL is a content-injection surface for nothing gained.

## Which columns clients actually write under RLS

Checked before choosing the grant list, because getting it wrong breaks live profile saves:

| Caller | Columns | Client |
|---|---|---|
| `app/actions/customer-profile.ts` | `full_name`, `phone` | **user session** |
| `app/actions/mechanic-profile.ts` | `full_name`, `phone` | **user session** |
| Customer app | `full_name`, `phone` | **user session** |
| `app/actions/reminders.ts` | reminder columns | service role |
| `lib/customers/provision.ts`, `lib/mechanics/provision.ts`, `app/actions/booking-account.ts` | name, phone, `role` | service role |
| `app/actions/mechanic-profile.ts` (avatar) | `avatar_url` | service role |

The reminder columns are granted anyway: the website writes them with the service role, but the app may write them directly, and they are customer-owned preferences with no privilege attached.

## Acceptance criteria

- [x] Escalation reproduced against the live project, and the test row restored
- [x] Cause traced to `0010`'s column-blind policy plus a table-wide grant
- [x] Every client-side profile write enumerated before choosing the grant list
- [x] `0079` written with both a column grant and a trigger backstop
- [x] `0079` parses (pglast)
- [x] **`0079` applied** by Brad, 2026-09-16
- [x] **Escalation refused.** Re-probed live as the signed-in e2e customer, five ways, all `42501`: `role → admin`, `role → mechanic`, `referred_by → self`, `deleted_at → null`, and `role` smuggled alongside a legitimate `full_name` in one update. `role` unchanged afterwards.
- [x] **A mechanic cannot self-promote either** — same `42501`.
- [x] **Legitimate writes still work**, under the customer's own session: `full_name` + `phone`, `reminders_enabled`, `reminder_via_email`. Values restored after the probe.
- [x] **The mechanic profile still saves** `full_name` and `phone` on its own session, which was the write most at risk from the revoke.
- [ ] The app confirms it can still write `full_name` and `phone`. Same grant and same mechanism as the two verified above, so expected to pass; theirs to confirm on their first real run.

## Not mitigable in code

There is no application change that helps. The attack is a direct PostgREST call with a public key, touching no code of ours. Only the grant closes it.

## Worth auditing next, same class

Other tables where a non-column-restricted self-update policy meets a table-wide grant. `customer_vehicles` is already safe via a column grant, and `stripe_customers` and `pending_email_changes` are service-role only. `customer_addresses` and `customer_inbox_reads` have full customer write policies — on those, every column *is* the customer's to set, so there is nothing to protect, but that should be a decision rather than an accident. A sweep of `grant`/`revoke`/`policy` statements across the migration set found no other privileged column exposed today.

## Mobile app

**No change needed.** It writes `full_name` and `phone`, both still granted. Told in `docs/backend-reply-to-app-2026-09-16.md` §0, with a request to say so if it also writes `avatar_url` from a session.

## When complete

Tick the boxes, set the Status line, update `docs/HANDOFF.md`, commit.
