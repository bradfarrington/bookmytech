# Task 18 — Mobile API layer (`app/api/mobile/v1/**`)

**Status:** 🟡 Stages 1–3 complete. Stage 1 (2026-07-29) — auth helper, `/auth/signup` and `/vehicle/lookup`, Postgres-backed rate limiting (migration `0043`). Stage 2 (2026-08-04) — `/repairs/tree`, `/repairs/search` and `/quote`, on a new shared core (`lib/haynespro/catalogue.ts`) that the website's repair browser was refactored onto; migration `0044` seeds their limits (data only, no schema change). Stage 3 (2026-08-04) — `/checkout/prepare` and `/bookings`, on a new shared core (`lib/bookings/create-booking.ts`) that the website's two Server Actions were refactored onto; migration `0045` seeds their limits (data only, no schema change). **Deviation from the spec:** the customer id became a parameter of the extracted core, *not* of `createBookingAction` — see "Why the core moved out of `app/actions/`" below; the web Server Actions keep their exact signatures. All three stages verified live against the dev Supabase project. Stage 4 (manage a booking) is specced below and not built.

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

## Later stages — not built

Prompted separately. Every one of these is a thin wrapper; if the underlying
function isn't callable from a route handler, extract the shared core and have
both callers use it, as `createCustomerAccount`, `getRepairCatalogueLevel` and
now `createBooking` already do.

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
- **No mobile route HANDLER is covered by an automated test yet.** Stages 1–3
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
