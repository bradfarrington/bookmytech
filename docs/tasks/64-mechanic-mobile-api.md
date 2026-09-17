# Task 64: The mechanic app's first endpoints — auth and onboarding

**Status:** ✅ **Complete (2026-09-17).** Built and verified; migration `0081` applied by Brad the same day. All three routes, the guard and the Stripe return page shipped as specified, with one deviation: the return page is at `/mobile-return/mechanic-stripe`, not under `/mechanic/onboarding/stripe/` (see below). Item 5 of the prompt (first password from the approval email) deliberately left as is.

Source: `bmt-mechanic-app/docs/auth-crm-prompt.md`.

## Why

There is now a **second** mobile app: `bmt-mechanic-app` (Expo), for mechanics. Everything in `AGENTS.md` about the customer app applies to it equally — a shipped path or response shape is a contract.

`app/api/mobile/v1/*` was customer-only, and the mechanic website does its privileged work in cookie-session server actions a native app cannot call. The app already does what RLS allows directly (radius, specialisms, working hours). What needed a server: Stripe's secret key, and the dispatcher.

## What shipped

### `requireMobileMechanic` — `lib/mobile/mechanic-guards.ts`

`requireMobileUser`, then the caller's own `mechanics` row read with the caller's own client. **The row grants access, not `role === 'mechanic'`** — same rule as `lib/mechanics/require-mechanic.ts` and `proxy.ts`. No row → 403 `"This account isn't set up as a mechanic."`. Returns the row with the caller.

### The routes — all `POST`, under `app/api/mobile/v1/mechanic/`

| Route | Body | 200 | Shared core |
|---|---|---|---|
| `stripe/onboarding` | `{ returnUrl }` | `{ url }` | `startStripeOnboardingFor` |
| `stripe/refresh` | none | `{ payoutsEnabled }` | `refreshStripeStatusFor` |
| `status` | `{ status: "online" \| "offline" }` | `{ status }` | `setAvailabilityFor` |

Errors are `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500. `status` also answers **409** when the mechanic isn't allowed to do that right now — no payouts (`"Connect your bank account before going online."`), suspended, or on a job.

`stripe/refresh` answers `{ payoutsEnabled: false }` for a mechanic with no account yet, not an error. The website's action keeps its "No payout account yet" error; the core reports `hasAccount` and each caller decides.

Stripe's own error text never reaches the app — the routes log it and return customer-grade copy.

Rate limited by a new **`mechanic`** bucket family (`mobile_mechanic_*`, 15/min and 300/day per user).

### Delegate, never reimplement

The three server actions were hollowed out rather than copied:

- `lib/mechanics/stripe-onboarding.ts` ← `app/actions/stripe-connect.ts`
- `lib/mechanics/availability.ts` ← `app/actions/mechanic-status.ts`

The actions now only resolve the mechanic from the cookie session; the routes resolve them from the bearer token. `createOnboardingLink(accountId, urls?)` takes optional return/refresh URLs; the web flow passes none and keeps its own.

### The Stripe return page — `app/mobile-return/mechanic-stripe/route.ts`

Stripe only accepts https return URLs, so the mobile route hands Stripe this page for **both** `return_url` and `refresh_url`, carrying the app URL as `?to=`. It 302s there. `to` is validated when the link is minted and **again on the way out** (`lib/mechanics/mobile-return.ts`) against `bmtmechanic:` and `exp+bmt-mechanic-app:` — the page is a plain GET anyone can hand-write, so the first check alone would leave an open redirect.

**Deviation from the prompt:** it suggested `app/mechanic/onboarding/stripe/mobile-return/`. `proxy.ts` gates all of `/mechanic/*` on a cookie session, and the in-app browser has none, so the mechanic would have landed on the web login instead of back in the app. The path is never seen by the app (it only sees `url`), so this costs nothing.

### Migration `0081`

1. Seeds the four `mobile_mechanic_*` limits (code defaults are identical, so the routes are limited before it runs).
2. **Closes the `mechanics` version of Task 62.** `"Mechanics can update own status"` restricts the row and not the columns, so a mechanic could write their own `rating`, `job_count`, `is_pro`, `is_suspended`, `stripe_*` flags and `stripe_account_id`, or set `status = 'online'` past the payouts gate. Fixed the 0079 way: column grants (`status`, `online_at`, `last_seen_at`, `bio`, `service_radius_miles`, `specialisms`, `base_postcode`) plus a trigger that restores privileged columns and enforces the value rules a grant can't express — no `online` without payouts or while suspended, no setting `on_job`, and `base_postcode` can be filled in but not moved.

Admins are exempt in the trigger: `setMechanicStatusAction` writes `status` through the admin's own session, which is also the `authenticated` role — that is also why `status` had to stay in the grant. The service role bypasses both.

## Behaviour changes on the website

Both come from sharing the core, both small:

- A **suspended** mechanic is refused when going online. Dispatch already skipped them, so before this they could sit "online" and receive nothing.
- `online_at` is stamped only on the offline→online transition. The comment always said so; the code stamped it on every online write.

The payouts refusal on the web still reads "…: Settings → Get paid." — the action appends it; the app gets the bare sentence.

## Acceptance criteria

- [x] A mechanic's bearer token gets 200 from all three routes; a customer's gets 403. *(Verified live with the e2e accounts, 2026-09-17.)*
- [x] `returnUrl: "https://evil.example"` gets 400. *(And the return page refuses it independently.)*
- [x] Going online without payouts gets 409 with `"Connect your bank account before going online."`
- [x] Web onboarding and the web online toggle behave as before. *(Same code path, now in `lib/`; typecheck, lint and 598 unit tests pass. Not clicked through in a browser.)*
- [x] A real onboarding link is minted. *(Stripe test mode; the account was deleted and the e2e mechanic's row reset afterwards.)*
- [x] **`0081` applied** — Brad, 2026-09-17. Still worth a check from a mechanic session: as a mechanic, `update({ is_pro: true })` should be refused with `42501`, and the web online toggle should still work.
- [ ] First password from the approval email (prompt item 5) — deliberately not done; the web link works today. Revisit if asked.

## For the app repos

- **`bmt-mechanic-app`:** nothing to change — the contract matches `src/lib/mechanic.ts` as written. After `0081`, a direct write of `base_postcode` over an existing value now raises; the app only writes it when empty, so it is unaffected. Regenerate types after `0081`.
- **`bmt-customer-app`:** regenerate types after `0081` (one new function; no column changed). Nothing else.
- **Supabase dashboard (Brad):** Authentication → URL Configuration → Redirect URLs needs `bmtmechanic://reset-password` and `exp+bmt-mechanic-app://reset-password`, or the app's "Forgot password?" email lands on the site instead.
