# Task 18 — Mobile API layer (`app/api/mobile/v1/**`)

**Status:** 🟡 Stage 1 complete (2026-07-29) — auth helper, `/auth/signup` and `/vehicle/lookup` shipped and verified live against the dev Supabase project. Rate limiting is Postgres-backed (migration `0043`). Stages 2–4 (the booking endpoints) are specced below and not built.

## Why this exists

A **customer mobile app** (React Native / Expo) now lives in a separate repo,
`bmt-customer-app`. It shares this database, this business logic and these
integrations, so **this repo is its backend**. The app reaches us two ways:

- HTTP route handlers under `app/api/mobile/v1/` — `Authorization: Bearer
  <supabase access token>`, JSON in, JSON out.
- Direct Supabase reads under the existing customer RLS policies.

A native client cannot call Server Actions, which is why this is the one
sanctioned REST layer in a codebase that otherwise bans them. See
`docs/01-architecture.md` → "Two clients, one backend".

**The constraint that governs everything here:** a mobile app cannot be
force-updated. Old builds stay on phones for months. A shipped path, response
shape or field name is therefore a **contract** — additive changes only. The
standing rules, and the list of changes that must be reported to Brad because
they need work in the app repo, are in `AGENTS.md`.

## The trap this had to avoid

`lib/supabase/server.ts` builds its client from **cookies**. Mobile requests
carry a Bearer token and **no cookies**.

This is not a 401 you'd notice. `createBookingAction`
([create-booking.ts:54](../../app/actions/create-booking.ts#L54)) derives the
customer from `supabase.auth.getSession()`. Called from a mobile route handler
that reached for the cookie client, that returns `null` and the booking is
written as a **guest booking** — `customer_id` null, so the job never appears in
the customer's account, and account credit and preferred-mechanic handling are
silently skipped. It would pass a smoke test. You would find out when a customer
said their booking had vanished.

Hence `lib/supabase/mobile.ts`, and the rule: **no mobile request may reach
cookie-derived auth without the caller being threaded through explicitly.**

---

## Stage 1 — scaffolding, signup, vehicle lookup ✅ (2026-07-29)

### `lib/supabase/mobile.ts` — Bearer auth

- `createMobileClient(token)` — a Supabase client that acts **as** the caller.
  The token goes on the `Authorization` header, so Postgres sees the caller's
  `auth.uid()` and every RLS policy applies exactly as it does in the browser. A
  mobile read can never see more than the web app would. Session persistence and
  refresh are off: a route handler is one request, and refreshing is the app's
  job (it owns the refresh token; we never see it).
- `requireMobileUser(request)` — resolves `{ userId, email, role, supabase }`,
  or a ready-to-return 401 when the header is missing, malformed, expired or
  invalid. Uses `getUser()`, **not** `getSession()`: it verifies the JWT with
  Supabase rather than trusting its claims, so a forged or stale token can't get
  through. `role` comes from `profiles` read under the caller's own RLS.
- `optionalMobileUser(request)` — for endpoints a guest may legitimately call
  but where a signed-in caller should still be identified (per-user rate
  limits). A missing or bad token is simply "guest"; it never fails the request.

### `lib/mobile/respond.ts` — the response contract

- `apiOk(body, status)` / `apiError(message, status)` / `apiRateLimited(...)`.
  Errors are always `{ "error": "…" }`; the app shows that string to the
  customer **verbatim**, so they're product copy, not diagnostics.
- `readJsonBody()` **requires `Content-Type: application/json`**. That's a
  security control, not pedantry: JSON is not a CORS-simple content type, so a
  cross-origin browser request carrying it is preflighted — and we answer no
  preflights. Without the check, a page on any origin could POST a JSON body as
  `text/plain` (a simple request, no preflight) and create accounts or spend our
  DVLA credits from a victim's browser.
- `clientIp()` — first entry of `x-forwarded-for` (rewritten at the Vercel edge,
  so trustworthy in production), falling back to `x-real-ip` then a constant, so
  a missing header degrades to one shared throttled bucket rather than to no
  limit.
- **No CORS headers anywhere.** A native app needs none.

### `POST /api/mobile/v1/auth/signup` — unauthenticated

Body `{ email, password, fullName, phone?, referralCode? }` → **201**
`{ userId }`.

Delegates to `createCustomerAccount()` in
[lib/customers/provision.ts](../../lib/customers/provision.ts) — **no logic is
duplicated here.** That function is already the one implementation shared by the
web `/signup` Server Action and the booking funnel, so an account has the same
shape however it was made: service-role `createUser` with `email_confirm: true`,
a unique `referral_code` with collision retry, `referred_by`, the referral
welcome credit, and `linkGuestBookings`.

> The prompt for this task expected to have to extract that core out of
> `app/actions/signup.ts` into a new `lib/auth/create-customer.ts`. **It was
> already extracted** — that refactor shipped with the "booking requires an
> account" work earlier the same day. `app/actions/signup.ts` was left
> completely untouched, so the web flow is unchanged by construction.

Status codes: **409** when the email is taken (so the app can offer "sign in
instead" rather than showing a generic failure), **400** for validation, **429**
when rate-limited. Never a 500, which the app would surface as "something went
wrong". The 8-character minimum and the "account already exists" wording come
from `provision.ts` and so match the web form exactly.

We do **not** sign the caller in — the app calls `signInWithPassword` itself and
owns the resulting tokens. There is nothing for us to set: no cookies.

### `POST /api/mobile/v1/vehicle/lookup` — unauthenticated

Body `{ reg }` → **200** with the `LookupResult` from
[lib/dvla/types.ts](../../lib/dvla/types.ts), **unchanged**, including the
`{ ok: false, code, message }` arm. A reg DVLA doesn't recognise is a successful
lookup with a negative answer, not a failed request, and the app types against
that union. Only transport-level problems return `{ error }` with a non-2xx:
**400** (no reg), **415** (wrong content type), **429** (rate-limited).

Thin wrapper over `lookupVehicleAction`. Guests can call it because the app lets
people price a job before making an account.

### Rate limiting — Postgres (migration `0043`)

**Store decision: Postgres, not Upstash Redis.** Redis is the better-shaped tool
— counters with TTLs are what it exists for, and it keeps this traffic off the
primary database. Postgres won on three grounds: no new vendor, account, billing
relationship or secret to rotate; the volume doesn't justify a dependency (one
indexed upsert per request on a table that never exceeds active-callers ×
buckets rows); and correctness is easier to prove, because the counter is a
single atomic `INSERT … ON CONFLICT DO UPDATE` that concurrent serverless
instances cannot race. The justification is repeated in the migration itself.
The limiter interface is small, so swapping the store later is contained.

`0043` adds `api_rate_limits` (fixed-window counters, RLS on with **no
policies** — service-role only, so a customer can never read or reset their own
counter) and `consume_rate_limit(bucket, subject, window_seconds, limit)`
(`security definer`, granted to `service_role` only). Expired rows are swept
opportunistically on ~1 request in 200 — cheaper and less to forget than a cron
entry.

**The limits**, all seeded into `platform_settings` so they're tunable in the
database **without a redeploy** (same mechanism as `hourly_rate_pence`;
`lib/rate-limit/limiter.ts` caches them for 60s, so an edit propagates within a
minute, and falls back to identical defaults in code if the seed is missing):

| Setting | Limit | Window | Applies to |
|---|---|---|---|
| `mobile_lookup_user_burst` | 6 | 1 min | signed-in caller |
| `mobile_lookup_user_daily` | 50 | 24 h | signed-in caller |
| `mobile_lookup_ip_burst` | 10 | 1 min | IP |
| `mobile_lookup_ip_daily` | 200 | 24 h | IP |
| `mobile_lookup_global_daily` | 5000 | 24 h | everyone |
| `mobile_signup_ip_burst` | 5 | 1 min | IP |
| `mobile_signup_ip_daily` | 20 | 24 h | IP |

Why three layers on lookup: **every miss spends money** (DVLA VES and DVSA MOT
are both billed per call), and the in-memory cache inside `lookupVehicleAction`
is per-serverless-instance so it protects nothing — a cold instance starts
empty, and a caller looping regs never repeats one anyway. Per-IP alone is both
too weak (trivially rotated) and too strong (mobile carriers put many customers
behind one CGNAT address), so a signed-in caller gets their own tighter bucket
and everyone shares a global daily ceiling that caps what a distributed attack
can bill us in 24 hours.

**The limiter fails closed.** If the counter can't be reached — migration not
applied, database unreachable — the request is refused, not waved through, and
the reason is logged naming the migration. These endpoints spend real money and
create real accounts; a broken guard must not become an open one.

### Verified live (2026-07-29, dev Supabase + `npm run dev`)

- Signup → **201** `{ userId }`; the profile row has `full_name`, `phone`,
  `role='customer'` and a generated `referral_code` (`BMTF54WF5`), and
  `signInWithPassword` with the same credentials returns an access token
  immediately — which is what the app does next, so `email_confirm: true`
  matters.
- Second signup, same email → **409** "An account with that email already
  exists — try signing in instead." (not a 500).
- Short password → **400** "Choose a password of at least 8 characters."
- `text/plain` body → **415**, before any work is done.
- Lookup with a real reg → **200** with a live DVLA + MOT result.
- Hammering lookup as a guest → **200** up to the per-IP limit, then **429**
  with "You've looked up a lot of vehicles. Please wait a moment and try again."
  and a decreasing `Retry-After`, rather than continuing to bill us.
- The per-user bucket was verified separately by raising
  `mobile_lookup_ip_burst` to 500 **in the database, with no redeploy**, then
  firing 9 authenticated lookups: requests 1–6 returned 200 and 7–9 returned
  429, exactly the seeded `mobile_lookup_user_burst` of 6. The setting was
  restored to 10 afterwards. This proves both the per-user bucket and the
  redeploy-free tuning in one run.
- The throwaway probe account was deleted afterwards.
- Before `0043` was applied, every limited endpoint returned 429 and logged
  `Has migration 0043_api_rate_limits.sql been applied?` — fail-closed confirmed.
- `app/actions/signup.ts` and the web `/signup` flow were **not modified**.

### Acceptance criteria

- [x] `curl` against a local dev server creates a real customer via
      `/auth/signup`, with a referral code on the profile
- [x] The existing web signup form still works (untouched — it already shared
      `createCustomerAccount`)
- [x] A second signup with the same email returns the "already exists" message,
      not a 500
- [x] `/vehicle/lookup` returns a real DVLA result
- [x] Hammering `/vehicle/lookup` trips the limit with a clear message rather
      than continuing to bill us
- [x] Rate limits are adjustable without a redeploy
- [x] No mobile route reaches cookie-derived auth
- [x] Errors are `{ "error": "…" }` with a real status code and customer-facing
      copy; success is JSON; no redirects; no permissive CORS
- [x] `AGENTS.md`, `docs/01-architecture.md`, `docs/HANDOFF.md` and this file
      reflect the mobile app
- [ ] A shared cache in front of DVLA — **deliberately deferred**, see
      "Follow-ups"

---

## Later stages — not built

Prompted separately, now the scaffolding exists and the auth helper is proven.
Every one of these is a thin wrapper; if the underlying function isn't callable
from a route handler, extract the shared core and have both callers use it, as
`createCustomerAccount` already does.

### Stage 2 — browse and quote (unauthenticated)

| Endpoint | Wraps |
|---|---|
| `GET /repairs/tree`, `GET /repairs/search` | `lib/haynespro/tree.ts` |
| `POST /quote` | `quoteRepair` (`lib/haynespro/repair-booking.ts`) |

Both hit HaynesPro, whose demo credentials are metered — they need the same
rate-limit treatment as `/vehicle/lookup`, using the buckets already in place.

### Stage 3 — booking (authenticated)

| Endpoint | Wraps |
|---|---|
| `POST /checkout/prepare` | `prepareCheckout` |
| `POST /bookings` | `createBookingAction` — **the cookie/Bearer trap lands here** |

`createBookingAction` currently derives `customer_id` from
`supabase.auth.getSession()` internally. It must take the caller explicitly
(an optional `customerId` argument, or a resolved-caller parameter) before a
mobile route may call it. Do not add a mobile-only copy. Staff sessions must not
be able to book — the web funnel already enforces `role === 'customer'`, and the
mobile route needs the same gate.

### Stage 4 — manage a booking (authenticated)

| Endpoint | Wraps |
|---|---|
| `POST /bookings/:id/cancel` | `quoteCancellation`, `cancelBooking` |
| `POST /bookings/:id/reschedule` | `rescheduleBooking`, `respondToReschedule` |

---

## The contract the app is already written against

`src/lib/api.ts` in `bmt-customer-app` expects:

- Base URL `EXPO_PUBLIC_API_BASE_URL` + `/api/mobile/v1`
- `Authorization: Bearer <supabase access token>`; guest endpoints send no header
- Any non-2xx carries `{ "error": "…" }`, shown to the customer as-is
- `POST /auth/signup` with `{ email, password, fullName }`; on success the app
  immediately calls `signInWithPassword` with the same credentials, so the
  account must be usable straight away — hence `email_confirm: true`

## Follow-ups

- **A shared cache in front of DVLA is worth adding — but as its own change, not
  bolted onto this one.** The same reg genuinely does get looked up repeatedly:
  by the same customer across funnel steps and sessions, by the app and the
  website for one person, and across everyone else. The existing in-memory cache
  catches none of that, because it's per-serverless-instance and 5 minutes long.
  A `dvla_vehicle_cache` table keyed on the normalised reg (mirroring
  `haynespro_vehicle_cache`, service-role read/write, ~24–48 h TTL, successful
  lookups only) would turn most repeat lookups into a single indexed read and cut
  the bill meaningfully. Two things make it a separate job rather than a footnote:
  it changes the freshness of **tax and MOT status**, which are the fields most
  likely to have moved and which customers act on, so the TTL is a product
  decision; and it should sit inside `lookupVehicleAction` so the website benefits
  too, which puts it on the funnel's critical path and wants its own testing.
  Until then the rate limits are the cost ceiling.
- **`LookupResult` carries more fields than `VehicleDetails` declares.** The DVLA
  client spreads the raw VES response, so live results also include
  `markedForExport`, `typeApproval`, `wheelplan`, `dateOfLastV5CIssued` and
  `monthOfFirstRegistration`. Pre-existing, harmless (the app types against the
  declared subset), and passing it through unchanged is correct here — but worth
  knowing before anyone "tidies" the type.
- **No mobile endpoint is covered by an automated test yet.** Stage 1 was
  verified by hand against the dev project. A route-handler test suite (or
  Playwright API tests) should land before the app ships to real customers,
  because these responses are contracts that can't be walked back.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
