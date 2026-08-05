# Task 18 — Mobile API layer (`app/api/mobile/v1/**`)

**Status:** ✅ Complete (2026-08-05) — Stages 1–3 and 5. Stage 5 (customer actions: cancel, reschedule, review, disputes, stranded-hold release) shipped ten endpoints on three new shared cores (`lib/bookings/manage-booking.ts`, `lib/reviews/submit-review.ts`, `lib/disputes/core.ts`), with the website's Server Actions refactored onto them and their signatures unchanged. **Deviations from the old "Stage 4 — manage a booking" spec, which this replaces:** it shipped as **Stage 5** and covers far more than that two-row table did; the cancel *quote* is its own `GET /bookings/:id/cancel-quote` rather than sharing the cancel route, because the app must show the fee before the customer commits; and `respondToReschedule` got its own route (`/reschedule-response`) rather than sharing `/reschedule`, because they are opposite directions of the same conversation. Two migrations to apply: **`0046`** (records a `reviews` customer-read policy that exists on live but in no migration) and **`0047`** (rate-limit seeds, data only). Verified live against the dev Supabase project, including an ownership probe from a second customer account against every endpoint. Earlier stages: Stage 1 (2026-07-29) — auth helper, `/auth/signup` and `/vehicle/lookup`, Postgres-backed rate limiting (migration `0043`). Stage 2 (2026-08-04) — `/repairs/tree`, `/repairs/search` and `/quote`, on a new shared core (`lib/haynespro/catalogue.ts`) that the website's repair browser was refactored onto; migration `0044` seeds their limits (data only, no schema change). Stage 3 (2026-08-04) — `/checkout/prepare` and `/bookings`, on a new shared core (`lib/bookings/create-booking.ts`) that the website's two Server Actions were refactored onto; migration `0045` seeds their limits (data only, no schema change). **Deviation from the spec:** the customer id became a parameter of the extracted core, *not* of `createBookingAction` — see "Why the core moved out of `app/actions/`" below; the web Server Actions keep their exact signatures. All three stages verified live against the dev Supabase project.

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

## Stage 2 — browse and quote ✅ (2026-08-04)

Unauthenticated, because the app lets people price a job before making an
account. This is what the app's booking step 2 calls; before it existed the
screen showed "Something went wrong. Please try again." — the app's generic
fallback for a 404 with no `{error}` body.

| Endpoint | Wraps |
|---|---|
| `GET /repairs/tree?reg=&node=` | `getRepairCatalogueLevel` |
| `GET /repairs/search?reg=&q=` | `searchRepairCatalogue` |
| `POST /quote` `{reg, repairNodeId}` | `quoteRepair` (`lib/haynespro/repair-booking.ts`) |

### `lib/haynespro/catalogue.ts` — the shared core

The spec above said to extract a shared core rather than reimplement, and here
that mattered more than usual: the website's `RepairBrowser` server component
held the catalogue logic **inline** — resolve the vehicle, read the level, drop
admin-excluded nodes, drop untimed leaves, price the rest. Wrapping the route
handlers around a copy would have left two implementations of *what a repair
costs*, free to drift.

So it moved into `getRepairCatalogueLevel` / `searchRepairCatalogue`, and
[repair-browser.tsx](../../app/(customer)/book/repairs/_components/repair-browser.tsx)
was refactored onto it. It now decides only how things look — the two clients
cannot quote a customer different prices for the same job on the same car.

`toCatalogueNode` is the one place a HaynesPro node becomes a customer-facing
one: groups carry no price, timed leaves are priced with the same arithmetic
`quoteRepair` uses, and **untimed leaves are dropped entirely** — they can't be
priced, so they can't be booked, and showing one is a dead end in both clients.

### The response convention

Same as `/vehicle/lookup`, and the app types against it: a request that ran
correctly but has a negative answer is **200** with `{ ok: false, code, message
}` — `vehicle_not_matched` (reg we can't match) or `no_repair_data` (matched,
but HaynesPro has no repair times for it). Only transport-level problems return
`{ error }` with a non-2xx: **400** (no reg, or a search query under 3
characters), **415** (wrong content type on `/quote`), **429**.

`message` is product copy shown to the customer verbatim. The website renders
the same two answers with a `/help` link inline instead, branching on `code`.

An **empty root level is reported as `no_repair_data`**, not as an empty
catalogue: `getRepairtimeSubnodes` swallows upstream failures as `[]`, every
vehicle with a repair-time type has root groups, so at the root the two are
indistinguishable and the safer reading is "we have nothing for you". Inside a
group, empty stays a legitimate answer.

### Search is best-first, and that is load-bearing

HaynesPro has no keyword search, so we walk the tree — and the obvious walk
does not work. **Breadth-first returns nothing.** The tree has ~43 groups at the
root and the priced repairs sit two levels below them, so a 40-expansion
breadth-first walk spends its entire budget on the root's children and never
reaches a leaf. Measured, not theorised: "brake pads" on a live T-Roc returned
**0 hits**.

Best-first works because **the path to a matching leaf is itself named for the
query** — "Renew the front brake pads" sits under "Brake pads" under "Brakes".
Groups are expanded in order of how many query tokens their own name contains
(`affinityFor`), shallowest first. Groups matching nothing are still expanded if
budget remains, since a leaf can be named unlike its parents; they just go last.
Same query, same budget: **14 priced hits in ~1.1s.**

Two more things the live results forced:

- **Dedupe on the name, not the id.** HaynesPro files the same group under
  several parents — a T-Roc has four distinct "Clutch" nodes. Four identical
  rows isn't a search result, it's noise.
- **Bookable repairs sort above _all_ groups**, not merely at equal rank. A
  group named exactly "Clutch" scores a whole-name match while "Renew the
  clutch" only has all-tokens-present, so ranking alone buried every priced row
  under a wall of folders. Groups stay on as the browse-instead fallback.

`truncated` means the queue wasn't drained, which for a tree this size is the
normal outcome — both clients must render "closest matches", never "all
matches". The app already does.

A vocabulary gap remains and is not a bug: HaynesPro names nothing "service"
(it's "Additional maintenance work", "Inspection"), so that query returns
nothing. The app's empty state already says "try a different word, or browse the
categories instead".

### Rate limiting (migration `0044` — data only)

`0044` inserts `platform_settings` rows. **No schema change**, so nothing here
affects the types the app generates from the schema.

| Setting | Limit | Window | Applies to |
|---|---|---|---|
| `mobile_catalogue_ip_burst` | 60 | 1 min | IP |
| `mobile_catalogue_ip_daily` | 1500 | 24 h | IP |
| `mobile_catalogue_user_burst` | 40 | 1 min | signed-in caller |
| `mobile_catalogue_user_daily` | 600 | 24 h | signed-in caller |
| `mobile_catalogue_global_daily` | 30000 | 24 h | everyone |
| `mobile_search_ip_burst` | 15 | 1 min | IP |
| `mobile_search_ip_daily` | 300 | 24 h | IP |
| `mobile_search_user_burst` | 10 | 1 min | signed-in caller |
| `mobile_search_user_daily` | 150 | 24 h | signed-in caller |

Deliberately **far looser than `/vehicle/lookup`**: drilling through the tree is
several requests in a row during normal use and almost all are served from the
memo in `lib/haynespro/tree.ts`, costing HaynesPro nothing. A 10/minute
lookup-style limit would refuse ordinary browsing. Search carries its own
tighter bucket **on top** of the catalogue ones, because one query can cost up
to `SEARCH_MAX_EXPANSIONS` upstream calls where a browse costs one.

A GET isn't protected by our refusal to answer preflights the way a JSON POST
is — any page can trigger one from a victim's browser, and though it can't read
the reply it can still spend our metered HaynesPro credit. These limits are the
cost ceiling, not a nicety. Shared by all three routes via
`lib/mobile/catalogue-limits.ts`.

### Verified live (2026-08-04, dev Supabase + `npm run dev`)

Against a real reg resolved through the live HaynesPro account:

- Root level → 43 groups with `{description, hourlyRatePence}`; drill-in →
  subgroups; leaf level → `Renew the air filter`, 1h, `pricePence: 6000`.
- Search "brake pads" → 14 priced hits, repairs first, no duplicates, ~1.1s.
  Also checked: battery, clutch, oil filter, exhaust.
- `/quote` on a node taken from the search → `totalPence` **6000, identical to
  the browse price**. That equality is the point of the shared core.
- Negative arms: unmatchable reg → 200 `vehicle_not_matched`; unknown node and
  a group node → 200 `not_priceable`. Errors: no reg → 400; 2-character query →
  400; `text/plain` on `/quote` → 415.
- Hammering search → 429 with "You've made a lot of requests just now…" and a
  decreasing `Retry-After`, **while `/repairs/tree` and `/quote` kept returning
  200** — the separate bucket does its job and search abuse doesn't block
  browsing.
- The refactored website page renders identically: same vehicle line, same 43
  groups, same `£60` leaf pricing, same "get in touch" empty state.

### Acceptance criteria

- [x] The app's booking step 2 loads a real, priced repair catalogue instead of
      "Something went wrong"
- [x] Browse, search and quote all return the exact shapes `src/lib/repairs.ts`
      in `bmt-customer-app` is already written against
- [x] A quote's total equals the price shown while browsing, and is produced by
      the same `quoteRepair` the web funnel charges from
- [x] No logic is duplicated between the website and the app — the website's
      repair browser was refactored onto the shared core, not left alongside it
- [x] Negative answers are 200 `{ok:false, code, message}`; only transport
      problems are non-2xx `{error}`; no redirects; no CORS headers
- [x] Search never presents a capped walk as a complete result set
- [x] HaynesPro spend is bounded, and browsing isn't collateral damage of the
      search limit
- [x] No mobile route reaches cookie-derived auth
- [x] Admin-hidden repairs stay hidden and unquotable through the mobile routes
      (the exclusion set is applied in the shared core, and the walk never
      descends into an excluded group)

---

## Stage 3 — booking ✅ (2026-08-04)

Authenticated. This is what the app's checkout calls; before it existed both
requests hit a 404 **HTML** page, which the app can only surface as an unknown
failure, so a customer could not complete a booking at all.

| Endpoint | Wraps |
|---|---|
| `POST /checkout/prepare` `{postcode, vehicleReg, repairNodeId}` | `prepareCheckoutFor` |
| `POST /bookings` | `createBooking` — **the cookie/Bearer trap lands here** |

### `lib/bookings/create-booking.ts` — the shared core

Both endpoints are thin wrappers over the same functions the website books
through. The price is re-quoted from `(reg, repairNodeId)` server-side in both
`prepareCheckoutFor` and `createBooking`, so no figure in a request body is
trusted — none is read.

**Why the core moved out of `app/actions/`.** The spec said to give
`createBookingAction` an explicit `customerId` argument. That would have been a
privilege-escalation hole: every export of a `"use server"` file is a public
endpoint the browser can call **with arguments of its choosing**, so a
`customerId` parameter on the Server Action would let anyone attach a booking to
anyone else's account — precisely the client-supplied customer id the rule
exists to prevent. So the logic moved to `lib/bookings/create-booking.ts`, where
`customerId` is an ordinary parameter of a function no client can reach, and
`app/actions/create-booking.ts` became two wrappers that resolve the caller from
the cookie session themselves. **`createBookingAction(input)` and
`prepareCheckout(input)` keep their exact signatures, so `slot-picker.tsx` is
unchanged.** Same shape as `createCustomerAccount` and `getRepairCatalogueLevel`.

The wrappers now use `getUser()` where `createBookingAction` used
`getSession()` — it verifies the JWT with Supabase rather than trusting the
cookie's claims, which is what you want before writing a row that owns money.

### The trap, concretely

`createBooking` never derives the customer. Mobile passes the id from the
verified Bearer token; the website passes the id from its cookie session. Had
the mobile route reached the cookie client, the booking would have been written
with `customer_id` null — a guest booking, invisible in the customer's account,
with credit and preferred-mechanic handling skipped, and **no error anywhere.**
The live check for this is the `mode: "free"` result below: credit is only ever
found when the caller was resolved.

### What the body is not allowed to say

- **`customerEmail`** — taken from the token. It is the key the guest-match half
  of the "Customers can view own bookings" RLS policy compares against
  (`customer_id is null and auth.email() = customer_email`), so accepting it
  from the client would let someone attach a booking to another person's
  dashboard. Verified: a request sending `attacker@evil.test` wrote the token's
  address.
- **`customerPhone`** — `createBooking` reads it from the caller's profile.
- **`creditAppliedPence`** — echoed from prepare as a **cap only**; the redeem
  clamps it to the ledger balance. Verified: a request claiming `99999` against
  a zero balance redeemed nothing.
- **any price, duration or total** — the server re-quotes.
- **`preferredMechanicId`** — deliberately not accepted yet. The app has no
  rebook flow, and adding a client-supplied mechanic id is additive later.

Staff accounts are refused with **403** on both endpoints, matching the web
funnel's `wrongRole` gate. A null role is read as "customer", exactly as
`book/slot/page.tsx` does, so the two clients can't disagree about who may book.

### The response convention

Same as the rest of v1, and `PrepareCheckoutResult` is returned **unchanged** so
the app can type against the shared union: an operation that ran with a negative
answer (repair not priceable, Stripe refused, insert failed) is **200**
`{ok:false, error}`. Only transport-level problems are non-2xx `{error}`: **401**
(missing/expired token, or a token with no email), **403** (staff), **400**
(missing or invalid field), **415** (wrong content type), **429**.

### Rate limiting (migration `0045` — data only)

`0045` inserts `platform_settings` rows. **No schema change**, so nothing here
affects the types the app generates from the schema.

| Setting | Limit | Window | Applies to |
|---|---|---|---|
| `mobile_checkout_user_burst` | 10 | 1 min | signed-in caller |
| `mobile_checkout_user_daily` | 60 | 24 h | signed-in caller |
| `mobile_checkout_ip_burst` | 20 | 1 min | IP |
| `mobile_checkout_ip_daily` | 300 | 24 h | IP |
| `mobile_booking_user_burst` | 5 | 1 min | signed-in caller |
| `mobile_booking_user_daily` | 25 | 24 h | signed-in caller |
| `mobile_booking_ip_burst` | 10 | 1 min | IP |
| `mobile_booking_ip_daily` | 100 | 24 h | IP |

Separate from the catalogue buckets on purpose: browsing repairs and paying for
one must not share a budget, or a customer who spent a while looking around would
be turned away at the payment step — the worst possible moment to show someone
"please wait". Both endpoints require a token, so the per-user bucket is the real
limit and per-IP is an abuse ceiling for one attacker cycling accounts; per-IP
stays generous because carriers put many genuine customers behind one CGNAT
address. Checkout is looser (an unconfirmed intent costs nothing and expires by
itself); booking create is tighter because every call writes a row, dispatches to
mechanics and sends an email and an SMS.

### Verified live (2026-08-04, dev Supabase + `npm run dev`, Stripe test mode)

Against a real reg and a node taken from `/repairs/search` (`Renew the air
filter`, £60):

- No token → **401** `{"error":"Please sign in to continue."}` on both routes —
  JSON, not the 404 HTML page the app was getting.
- `/checkout/prepare` with a valid token → **200** `{ok:true, mode:"preauth",
  clientSecret:"pi_…_secret_…", totalPence:6000, creditAppliedPence:0,
  chargePence:6000}`. The total equals the browse and `/quote` price.
- £60 of credit granted to the caller → the same request returned **200**
  `{ok:true, mode:"free", creditAppliedPence:6000, chargePence:0}`. **This is
  the cookie/Bearer proof**: a cookie-authed handler would have found no
  customer and returned `preauth` with zero credit.
- `POST /bookings` in `free` mode → `{ok:true, bookingId}`, and the row had
  `customer_id` set (**not** a guest booking), `customer_email` from the token
  despite the body sending `attacker@evil.test`, `customer_phone` null (from the
  profile, not the body's number), `total_pence` 6000 re-quoted server-side,
  `credit_applied_pence` 6000, `payment_mode` free, and the ledger showed one
  redemption tagged to the booking.
- `POST /bookings` in `preauth` mode, against a PaymentIntent confirmed with a
  test card (status `requires_capture`, £60 capturable, nothing taken) →
  `{ok:true, bookingId}` with the intent id on the row, and the inflated
  `creditAppliedPence: 99999` redeemed **0** against a zero balance.
- Negative arms are 200 JSON: an unknown node returns `{ok:false, error}` from
  both routes. Error arms: staff session → **403** on both; bad token → **401**;
  `text/plain` → **415**; unknown parking type, unparseable `scheduledAt`, and
  `preauth` with no intent id → **400**, each with customer-facing copy.
- Hammering `/checkout/prepare` → **429** with a decreasing `Retry-After`, while
  `/quote` kept returning 200 — the separate bucket does its job.
- The website funnel is unchanged: `/book/slot` renders the same repair and the
  same £60 total, and `slot-picker.tsx` was not edited.
- The probe account, its bookings and its credit rows were deleted afterwards,
  and the test hold was cancelled.

### Acceptance criteria

- [x] The app's checkout gets JSON from both endpoints instead of a 404 HTML page
- [x] `/checkout/prepare` returns the `PrepareCheckoutResult` union unchanged,
      including the `free` and `{ok:false}` arms
- [x] The hold is manual-capture, on the same Stripe account as the app's
      publishable key, for `total − credit`
- [x] `POST /bookings` writes a booking owned by the token's customer, never a
      guest booking
- [x] Email comes from the token, phone from the profile; neither is accepted
      from the body
- [x] Prices are re-quoted server-side; no client figure is trusted
- [x] Staff accounts can't book, matching the web funnel's gate
- [x] No logic is duplicated between the website and the app — the two Server
      Actions were refactored onto the shared core, not left alongside it
- [x] The web funnel's Server Actions keep their signatures and behaviour, and
      no client-supplied `customerId` was introduced
- [x] No mobile route reaches cookie-derived auth
- [x] Errors are `{"error": "…"}` with a real status code and customer-facing
      copy; success is JSON; no redirects; no CORS headers
- [ ] Verify the confirmed PaymentIntent belongs to the booking and covers it —
      **deliberately deferred**, see "Follow-ups"

---

## Stage 5 — customer actions ✅ (2026-08-05)

Everything a customer does to a booking *after* it exists. All authenticated,
all thin wrappers, all following the same rule as Stage 3: the caller is
resolved from the verified Bearer token in the route handler and threaded into a
shared core in `lib/`, and ownership is decided there from that caller — never
from the path or the body.

Numbered Stage **5** rather than 4 because it is a superset of what the old
"Stage 4 — manage a booking" section specced, and shipping it as a new stage
keeps that spec's history readable rather than rewriting it.

| Endpoint | Wraps | Core |
|---|---|---|
| `GET /bookings/:id/cancel-quote` | `quoteCancellation` | `lib/bookings/manage-booking.ts` |
| `POST /bookings/:id/cancel` `{reason}` | `cancelBooking` | ″ |
| `POST /bookings/:id/reschedule` `{scheduledAt, reason}` | `rescheduleBooking` | ″ |
| `POST /bookings/:id/reschedule-response` `{decision}` | `respondToReschedule` | ″ |
| `POST /bookings/:id/review` `{rating, tags?, comment?}` | `submitReview` | `lib/reviews/submit-review.ts` |
| `POST /bookings/:id/disputes` | `openDispute` | `lib/disputes/core.ts` |
| `POST /disputes/:id/messages` `{body}` | `sendDisputeMessage` | ″ |
| `POST /disputes/:id/withdraw` | `withdrawDispute` | ″ |
| `POST /disputes/photos` (multipart) | `uploadDisputePhoto` | ″ |
| `POST /checkout/cancel` `{paymentIntentId}` | *(new)* | `lib/stripe/release-hold.ts` |

### Three cores extracted, three `app/actions/` files thinned

Same move as Stage 3, for the same reason: `quoteCancellation`, `cancelBooking`,
`rescheduleBooking`, `openDispute`, `sendDisputeMessage` and `withdrawDispute`
all resolved their caller through `requireBookingCustomer` / `requireUser`,
which read the **cookie** session. Called from a route handler they resolve to
null and refuse every mobile request with "Please sign in." no matter how good
the token is.

- **`lib/bookings/manage-booking.ts`** — cancel, cancel-quote, reschedule,
  reschedule-response. `app/actions/customer-bookings.ts` is now four wrappers.
- **`lib/reviews/submit-review.ts`** — `app/actions/reviews.ts` keeps
  `submitReview` as a one-line wrapper and `respondToReview` unchanged.
- **`lib/disputes/core.ts`** — the whole party-facing lifecycle plus the shared
  helpers (`partyForDispute`, `releaseMechanicPayout`, `revalidateDispute`,
  `mechanicEmail`, `serviceName`). `app/actions/disputes.ts` keeps
  `escalateDispute` and `resolveDispute` whole — they're staff/cron paths the
  app deliberately can't reach — and both now call `partyForDispute` with a
  cookie-resolved caller.

**No `"use server"` export gained a caller argument.** Every export of such a
file is browser-reachable with arguments of the caller's choosing, so
`cancelBooking(id, reason, userId)` would let anyone cancel anyone's booking.
Every web action keeps its exact signature; no calling component was edited.

### `lib/bookings/ownership.ts` — one predicate, tested exhaustively

The rule that keeps a customer out of someone else's job is now a pure function
shared by the cancel/reschedule and review paths, with its own unit tests
(`ownership.test.ts`, 10 cases). It mirrors the "Customers can view own
bookings" RLS policy, **with one hardening the SQL doesn't need**: in Postgres
`null = null` is null and the policy fails closed, but in TypeScript
`null === null` is *true*, so a caller whose token carries no email would have
matched every guest booking that also has no email. Both sides are required
non-null. The email compare is case-sensitive, matching `auth.email()` — looser
would let an action reach a booking the same caller cannot *read*.

### Two paths pass a NULL caller, deliberately

`respondToReschedule` and `submitReview` are reachable on the website from pages
where the customer may have **no account at all** — the guest confirmation page
and the emailed review link — and are trusted on possession of the booking's
full UUID. Those wrappers pass `null` and the ownership check is skipped, exactly
as before. Tightening them would refuse a real case: someone who booked as a
guest on one email, signed up on another, and followed their own link.

The mobile routes always pass a verified caller, so ownership **is** enforced
there. A bare booking id must not be enough to answer someone else's reschedule
or post a review under their name.

### Statuses each action accepts

Exported from the core as `CANCELLABLE` and `RESCHEDULABLE` so both clients can
hide a button rather than offer one that always errors:

- **`CANCELLABLE`** — `sourcing_mechanic`, `confirmed`, `en_route`
- **`RESCHEDULABLE`** — `sourcing_mechanic`, `confirmed` (not `en_route`: the
  mechanic is already driving)
- **reschedule-response** — no status gate; it gates on
  `reschedule_status === 'proposed'`
- **review** — `completed` only, and one per booking, **refused** on a second
  attempt rather than updated
- **dispute (customer)** — `completed`, within 48 hours of `completed_at`

### The quote is a separate call, and a preview only

`/cancel-quote` exists so the app can put a number next to "Cancel this
booking?". `cancelBooking` recomputes the fee at cancel time and never reads it —
the tier genuinely moves between the two calls (the 24-hour boundary passes, the
mechanic sets off), and what is charged must be what was true when the money
moved.

### Reviews — the first write path there has ever been

`reviews` has no INSERT policy and can't have one: submitting recomputes
`mechanics.rating`, which no customer may write. So the checks in the core are
the whole of the protection, with no RLS backstop underneath.

Two things changed beyond wrapping:

- **`job_count` is now recomputed** alongside `rating`, from the mechanic's
  **completed bookings** (not their review count — most jobs are never reviewed).
  Nothing in the codebase had ever written this column; it sat at 0 while
  `/admin/mechanics`, `/mechanic/profile` and the analytics page all displayed
  it. Recompute rather than increment, so it is idempotent and repairs whatever
  was there. **This is the wrong place for it long-term** — see Follow-ups.
- **A 2000-character cap on the comment.** It was uncapped, which is defensible
  for a form and not for an endpoint.

Tag vocabulary is unchanged (`lib/reviews/tags.ts`): Punctual · Friendly · Great
value · Knowledgeable · Tidy & clean · Went the extra mile. Unrecognised tags are
**dropped, not refused**, so an old build offering a retired tag can still leave
a review.

### Disputes — photos go through us, reads go direct

`uploadDisputePhoto` takes a `File`. The mobile route takes
`multipart/form-data` with a single `file` part (RN's `FormData` appends
`{uri, name, type}` directly) and returns `{ok: true, url}`; that URL then goes
in the `photos` array when opening the dispute.

**Not** a direct client upload under Storage RLS: `job-media` is a public bucket
whose writes are service-role only (0011) and it holds every job's media, so a
policy letting customers write to it would open all of that, not a `disputes/`
prefix. Object paths are keyed by the verified caller's id.

That route can't do the `application/json` CSRF check the JSON routes do
(`multipart/form-data` is CORS-simple, so it can't be preflighted into). The
Bearer requirement covers it: the route reads no cookies, so a cross-origin page
has no ambient credential to replay.

**Reads need no endpoints.** `disputes` and `dispute_messages` already carry
"parties read" SELECT policies (0025) — verified live below.

### `POST /checkout/cancel` — releasing a stranded hold

The mirror of `reportOrphanedHold`: that one tells ops, this one gives the money
back. Same "re-read the truth from Stripe rather than trusting the caller"
reasoning, plus two gates it doesn't need, because this **cancels** rather than
emails:

1. **Ownership is proved from Stripe.** `prepareCheckoutFor` now stamps
   `metadata.customer_id` on every hold it opens for a signed-in customer, and
   the release refuses unless it matches the caller. Without that, anyone who
   came by an intent id could release a stranger's authorisation. Holds opened
   before this metadata existed, and guest holds, carry no stamp and so can only
   be released by ops or Stripe's own 7-day expiry — the safe direction to fail.
2. **A hold with a booking row against it is not stranded.** Cancelling it would
   leave a confirmed job with nothing to capture on completion.

Idempotent: an already-cancelled intent returns `{ok: true, released: false}`
without calling Stripe again. A **captured** intent is refused with a
contact-us message rather than guessed at.

The metadata addition is the only change to the website's money path, and it is
additive — nothing reads it during checkout.

### Rate limiting (migration `0047` — data only)

Three new bucket families on the same Postgres limiter, seeded in
`platform_settings` with identical code defaults in `lib/rate-limit/limiter.ts`.
`enforceBookingLimits` became table-driven over a `MobileLimitFamily` union, and
the key names are built with a template literal type checked against
`RateLimitKey` — adding a family without seeding its four limits is a type
error, not a runtime surprise.

| Family | Endpoints | user burst / daily | ip burst / daily |
|---|---|---|---|
| `action` | cancel, reschedule, review, dispute open/withdraw, hold release | 8 / 40 | 20 / 200 |
| `message` | dispute thread messages | 20 / 200 | 40 / 600 |
| `upload` | dispute photos | 10 / 60 | 20 / 200 |

### Verified live (2026-08-05, dev Supabase + `npm run dev`, Stripe test mode)

Three throwaway-account probes, all data deleted afterwards.

**Ownership — 19/19.** An INTRUDER account with a valid token, against an OWNER's
booking, dispute and PaymentIntent. Every one of the nine endpoints refused:
cancel-quote, cancel, reschedule, reschedule-response (against a **live**
`reschedule_status = 'proposed'`, so a pass would have been a real breach),
review, dispute open, dispute message, dispute withdraw, and `checkout/cancel`
against the owner's live hold. State was then re-read: booking still `confirmed`,
proposal still live, no review row, no dispute message, dispute still `opened`,
hold still uncaptured. Positive controls prove the refusals aren't blanket — the
owner's own `cancel-quote` returned `{ok:true, feePence:0, tier:"before_24h",
totalPence:12000}`, their own `checkout/cancel` returned `released: true`, and a
second call returned `released: false`. No token → **401**.

*(The first run failed one probe with a **429** — nine `action`-family calls in a
minute against an 8/min burst. The limiter working, not a defect; the probe was
split across two intruder identities.)*

**Reviews — 11/11.** Valid review accepted; comment trimmed; unrecognised tags
dropped and offered ones kept; `customer_id` and `mechanic_id` stamped; a second
review on the same booking **refused**; a review on a different booking accepted;
`mechanics.rating` recomputed to the mean (5, 2 → **3.50**) and `job_count` to
**3** completed bookings (not 2 reviews); rating outside 1–5 refused; missing
rating → 400; an unfinished job refused.

**Customer RLS reads — 8/8.** `reschedule_status`, `reschedule_proposed_at` and
`reschedule_note` all read back by the owning customer with the anon key and a
real token — **confirmed readable**, no policy needed. `disputes` and
`dispute_messages` likewise. A second customer read zero rows from every one.

`npm run build` compiles all ten routes; `npx tsc --noEmit` clean; 109 unit tests
pass (10 of them new).

### The `reviews` policy that isn't in any migration

The live dev project **does** let a customer read their own reviews — both
account-owned and guest (verified above) — but **no migration in this repo
creates that policy**; 0012 only grants SELECT to mechanics and admins. It was
added by hand and never written down.

`0046_customer_review_reads.sql` records it. Expect it to be a **no-op on dev**
and load-bearing on any environment that never got the manual edit — including,
possibly, production. Left undone it fails silently: RLS returns zero rows rather
than an error, so the app would read "you haven't reviewed this yet" and put a
customer through leaving the same review twice.

### Acceptance criteria

- [x] A customer can cancel, reschedule and answer a proposed reschedule from the app
- [x] The cancellation fee is previewable before confirming, and recomputed at cancel time
- [x] `CANCELLABLE` and `RESCHEDULABLE` are exported so both clients can hide buttons
- [x] A customer can review a completed job, once, and the mechanic's aggregates update
- [x] A customer can open, discuss and withdraw a dispute, and attach photos
- [x] A customer can release a hold that was left stranded by a failed booking write
- [x] Ownership comes from the verified caller on every endpoint, and is **proved**
      against another customer's booking, dispute and PaymentIntent
- [x] No logic is duplicated — three cores extracted, the web actions refactored
      onto them, signatures unchanged, no calling component edited
- [x] No `"use server"` export gained a caller argument
- [x] No mobile route reaches cookie-derived auth
- [x] Errors are `{"error": "…"}` with a real status code and customer-facing
      copy; success is JSON; no redirects; no CORS headers
- [x] Customer RLS reads confirmed live for `reschedule_*`, `disputes` and
      `dispute_messages`
- [ ] `escalateDispute` / `resolveDispute` exposed to the app — **deliberately
      not**, both are staff actions

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

- **`mechanics.job_count` is recomputed in the wrong place.** Stage 5 made
  submitting a review recompute it, because the prompt asked for it and because
  the column had never been written by anything — it sat at 0 while
  `/admin/mechanics`, `/mechanic/profile`, `/admin/analytics` and the disputes
  detail page all displayed it as "jobs done". That's a real fix, but it means
  the figure only refreshes when a customer happens to leave a review, so a
  mechanic with fifty completed jobs and no reviews still reads 0. **It belongs
  at job completion** — `completeJob` in `app/actions/job-progress.ts`, which
  already stamps `completed_at`. The recompute is a single query
  (`recomputeMechanicAggregates` in `lib/reviews/submit-review.ts`) and is
  idempotent, so calling it from there as well is safe and the two can't
  disagree. Left out of Stage 5 deliberately: it touches the mechanic's job flow,
  which wants its own testing rather than riding along with the customer
  endpoints.
- **A `reviews` RLS policy exists on the live database that no migration
  creates.** See "The `reviews` policy that isn't in any migration" above.
  `0046` records it. Worth checking whether anything else has drifted the same
  way — the whole `supabase/migrations/` directory is only trustworthy as a
  description of a fresh environment, not of the live one, until someone diffs
  the two.
- **`escalateDispute` is not reachable from the app.** Deliberate for Stage 5 —
  it's a party action, not a staff one, so unlike `resolveDispute` there's no
  reason of principle to withhold it. The 48-hour cron escalates automatically,
  so a customer whose mechanic goes quiet is not stuck; they just can't *ask* for
  a mediator early. One more thin wrapper if the app wants it.
- **Withdrawing a dispute is final and the app should say so.** `disputes` has
  `unique(booking_id)`, so a withdrawn case cannot be reopened and the booking
  has used up its one dispute. The endpoint refuses a second open with "There's
  already an open dispute for this booking", which is accurate but reads oddly
  when the dispute is closed.
- **Holds opened before Stage 5 can't be released by their owner.**
  `POST /checkout/cancel` proves ownership from `metadata.customer_id`, which
  `prepareCheckoutFor` only started stamping now. Any hold opened before this
  deploy, and every guest hold, has no stamp and is refused — released only by
  ops or Stripe's 7-day expiry. Self-clearing within a week of deploying, and the
  safe direction to fail, but worth knowing if someone reports it in the first
  few days.
- **`releaseStrandedHold` races a concurrent retry, narrowly.** It checks for a
  booking row and then cancels; a retry that writes the row and captures in
  between would make the cancel fail, and the customer is told the money is still
  held and to contact us. That's the correct outcome, but it is a message rather
  than a lock. Closing it properly needs the booking write and the intent to move
  together, which is a bigger change than this endpoint.
- **`stripePaymentIntentId` is client-supplied and unverified — on the website
  too.** Both clients confirm the hold on the device and then post the intent id
  back, and nothing checks that the id names an intent we created for *this*
  booking, in `requires_capture`, for at least the booking total. A caller could
  post the id of a cheaper hold of their own, and `job-progress.ts` would later
  capture that smaller amount. This is **pre-existing** — the web funnel has the
  identical exposure since Stage 3 of Task 08 — but the mobile route makes it
  reachable with nothing more than a bearer token and curl, so it is worth
  closing. The fix belongs in `createBooking` so both clients get it at once:
  retrieve the intent, and reject unless `status === 'requires_capture'`,
  `currency === 'gbp'` and `amount >= totalPence − creditApplied`. It was left
  out of this stage deliberately, because it changes the website's money path and
  wants its own testing rather than riding along with the mobile endpoints.
- **Mobile bookings record a funnel event with a null `user_id`.**
  `createBooking` calls `trackEvent`, which resolves the visitor from the session
  cookie and mints a fresh `bmt_sid` per request. From a mobile route there are
  no cookies, so every app booking lands in `funnel_events` as a brand-new
  anonymous session. Harmless (tracking is best-effort and swallowed) but it
  quietly understates app conversion in `/admin/analytics`. The fix is to let
  `trackEvent` take an optional caller instead of always deriving one.
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
- **No mobile route HANDLER is covered by a REPEATABLE automated test yet.**
  Stage 5 changes the picture but doesn't close it: its ownership, review and
  RLS-read probes were real scripts hitting real routes against the dev project
  (19 + 11 + 8 assertions, all green), and `lib/bookings/ownership.test.ts` pins
  the ownership predicate in the permanent suite. But the probes themselves were
  throwaway — they lived in a scratch directory and are gone. They should be
  Playwright API specs alongside `tests/e2e/`, because the checks they make are
  exactly the kind a later refactor drops silently. Note when porting them: the
  `action` bucket is 8/min per user, so a probe that hits nine endpoints in a row
  on one account gets a 429 rather than the answer it was testing for.
- **The rest of the paragraph below still applies.** Stages 1–3
  were verified by hand against the dev project. Stage 2 did add unit tests
  for the pure catalogue helpers (`toCatalogueNode`, `matchRank`, `affinityFor`
  in `lib/haynespro/haynespro.test.ts`) — the ranking rules are subtle enough
  that they needed pinning down — but the handlers themselves are untested. A
  route-handler suite (or Playwright API tests) should land before the app ships
  to real customers, because these responses are contracts that can't be walked
  back. **Stage 3 raises the stakes:** the booking endpoints take money and write
  the row that owns it, and the checks that keep a caller from booking as someone
  else (email from the token, credit clamped, staff refused) are exactly the kind
  that a later refactor can silently drop.
- **The search walk's caps are guesses tuned on one vehicle.**
  `SEARCH_MAX_EXPANSIONS = 40` was enough for every query tried on a T-Roc and a
  Ranger, but a make with a broader tree may truncate sooner. The lever exists
  (one constant) and the honest signal exists (`truncated`), so this is worth
  revisiting with real query logs rather than guessing harder now.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
