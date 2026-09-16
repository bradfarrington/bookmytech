# Task 58: Changing email is ours end to end

**Status:** 🚧 Built (2026-09-16), awaiting migration `0078`. Item 4 of Task 55. `lib/account/email-change.ts`, `pending_email_changes` (`0078`), two Resend templates, our own confirmation screen at `/account/confirm-email`, and `POST /api/mobile/v1/account/email` so the app can stop calling Supabase directly. **`0078` is not applied yet, so the feature is inert until Brad applies it** — the form returns "We couldn't start the change just now" and nothing else changes.

## Why

Brad's note on Task 55: use Book My Tech's own auth, with no Supabase views, screens or redirects. Supabase stays the auth backend; every screen, email and link a customer sees should be ours.

Password reset, the mechanic invite and approvals were already first-party. **Changing email was the last one that wasn't.** The browser called `supabase.auth.updateUser({ email })`, so GoTrue sent its own "Confirm Email Change" template and its links went through `<project>.supabase.co/auth/v1/verify` before bouncing to `/dashboard/settings?email=changed`. The app did the same thing, ending at `bmtcustomer:///email-changed`.

## The finding that shaped the design

The obvious move was `admin.generateLink({ type: 'email_change_current' | 'email_change_new' })`, as the task notes suggested. **It does not work.**

With Secure Email Change on, GoTrue needs *both* addresses to confirm, so the flow needs two tokens. `generateLink` returns one token per call and **regenerates the pair on every call**. Verified against the live project on 2026-09-16 with a throwaway user: after calling it for `email_change_current`, the token returned by the earlier `email_change_new` call came back `otp_expired`. Password reset can use `generateLink` because it needs exactly one token. This cannot.

So the pending change is ours.

## Design

**`pending_email_changes` (`0078`)** holds one live request per account: the new address, a **sha256 of the token**, the requesting IP, an expiry and a `confirmed_at`. The token itself is never stored, so a leaked copy of the table cannot move anyone's account — the same reasoning as a password hash. Single-use, 24 hours. RLS on with **no policies**: service-role only, and neither client reads it.

**`lib/account/email-change.ts`** is the one implementation, shared by the website's server action and the mobile route, with the caller threaded in as a parameter — the same rule as `lib/disputes/core.ts`.

- `requestEmailChangeFor` — checks the password, refuses a duplicate address, supersedes any earlier request, records the new one, then emails.
- `peekEmailChange` — reads a token **without spending it**.
- `confirmEmailChange` — spends it and applies the change with `admin.updateUserById(..., { email, email_confirm: true })`.
- `pendingEmailChangeFor` — the "waiting" card, replacing Supabase's `user.new_email`.

**What guards the account**, which is not weaker than before and on one count stronger:

1. **The current password, checked before anything is sent.** GoTrue's flow never asked for it. This is why Task 48 had dropped the mockup's password field as decorative — under the old flow a check in front of a browser-to-Supabase call protected nothing, because it could be skipped. **The field is back and it means something.**
2. **The new address must open a link**, proving it is reachable and theirs.
3. **The current address is told**, with a "wasn't me" route, so nobody's account moves quietly while they still read their old inbox.

**Opening the link does not spend the token; a button does.** Corporate mail scanners and "safe links" services fetch URLs inside messages, and a single-use token fetched by a scanner is one the customer never gets to use — they would see "that link has expired" with no way to tell why. So `/account/confirm-email` peeks, shows what is about to happen, and POSTs to confirm.

**The confirmation screen sits outside `/dashboard`** on purpose. The link is opened from an email client, often on another device or in a private window, so there may be no session — and the dashboard's proxy gate would send a signed-out visitor to `/login` and lose the token. The token is the proof; no session is asked for.

**`checkPassword` moved to `lib/account/check-password.ts`.** It was private to `app/actions/customer-account.ts`, and a route handler cannot call a `"use server"` module. Extracted rather than copied, so the two clients can't drift on what counts as a correct password. `changePassword` and account deletion now use the shared copy and its shared wording.

**The duplicate-address check is a nicety, not the guard.** The address lives only on `auth.users` — `profiles` has no email column, confirmed against the live schema — and `auth.admin.listUsers()` takes only a page number, so answering through supabase-js would mean walking every user. GoTrue's `GET /admin/users?filter=` does it, so the code calls that directly. It is not in the supabase-js types, so **any failure returns false and the flow continues**; `updateUserById` refuses a duplicate at confirm time regardless. All it buys is telling someone straight away rather than after a round trip through their inbox.

**Kept working:** the `on_auth_user_email_changed` trigger (`0065`) still carries the new address onto unfinished bookings and unsent reminders. It is on `auth.users` and fires however the email is updated.

**`?email=changed` on `/dashboard/settings` is kept as legacy**, deliberately. Nothing we send points there now, but confirmation emails GoTrue sent before this deploy are still in inboxes and their links go through Supabase's verify endpoint to that exact path. Safe to delete once none can remain — they expire in 24 hours.

## Acceptance criteria

- [x] No customer-facing email, link or screen in the flow touches a `supabase.co` URL
- [x] The current password is checked server-side before anything is sent
- [x] The new address gets a confirmation link; the current address gets a notice with no link
- [x] The token is stored only as a sha256, is single-use and expires in 24 hours
- [x] A mail scanner fetching the link cannot burn the token
- [x] The waiting card survives a reload, from our own row rather than `user.new_email`
- [x] `POST /api/mobile/v1/account/email` exists, sharing the same core
- [x] `checkPassword` is shared rather than duplicated for the route handler
- [x] 11 unit tests on the two templates; suite 559 → 570. `tsc` clean, `next build` passes, no new lint problems
- [ ] **`0078` applied. Owner.**
- [ ] Walked end to end with a real inbox: request, both emails arrive from `noreply@bookmytech.co.uk`, confirm, sign in with the new address. **Blocked on `0078`.**
- [ ] `on_auth_user_email_changed` confirmed to have moved the unfinished bookings. **Blocked on `0078`.**
- [ ] Supabase dashboard: redirect allow-list and the "Confirm Email Change" template no longer needed. **Owner, after the above.**

## Owner

1. **Apply `0078_pending_email_changes.sql`.** Until then the feature is inert and the form says so.
2. After it is walked end to end, the Supabase dashboard's email templates and redirect URLs for email change can go.

## Mobile app — tell Brad

**This one needs app work.** The app currently calls `supabase.auth.updateUser({ email })` itself, which is the flow being replaced.

- **New:** `POST /api/mobile/v1/account/email`, body `{ new_email, current_password }`. Returns `200 { ok: true, sentTo }`, or `200 { ok: false, error, field? }` for a refusal the customer should read verbatim, with `field` being `"new_email" | "password"`. Non-2xx only for transport problems: 401, 403, 400/415, 429, 500.
- **The app's Change Email screen needs a password field**, which the endpoint requires.
- **There is deliberately no confirm endpoint and no deep link.** The emailed link opens our web page, which works whether or not the app is installed and on whichever device the inbox is read. `bmtcustomer:///email-changed` is no longer reached.
- **After a confirmed change the app's stored session still carries the old address** until it refreshes, so ask the customer to sign in again, as the website does.
- **Run `npm run db:types`** for `0078`. The app never reads that table, but the types are generated from the whole schema.

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
