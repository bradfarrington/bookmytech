# Task 18 — Mobile API layer (`app/api/mobile/v1/**`)

**Status:** 🟡 Stages 1–2 complete. Stage 1 (2026-07-29) — auth helper, `/auth/signup` and `/vehicle/lookup`, Postgres-backed rate limiting (migration `0043`). Stage 2 (2026-08-04) — `/repairs/tree`, `/repairs/search` and `/quote`, on a new shared core (`lib/haynespro/catalogue.ts`) that the website's repair browser was refactored onto; migration `0044` seeds their limits (data only, no schema change). Both verified live against the dev Supabase project. Stages 3–4 (the booking endpoints) are specced below and not built.

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

## Later stages — not built

Prompted separately. Every one of these is a thin wrapper; if the underlying
function isn't callable from a route handler, extract the shared core and have
both callers use it, as `createCustomerAccount` and now
`getRepairCatalogueLevel` already do.

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
- **No mobile route HANDLER is covered by an automated test yet.** Stages 1 and
  2 were verified by hand against the dev project. Stage 2 did add unit tests
  for the pure catalogue helpers (`toCatalogueNode`, `matchRank`, `affinityFor`
  in `lib/haynespro/haynespro.test.ts`) — the ranking rules are subtle enough
  that they needed pinning down — but the handlers themselves are untested. A
  route-handler suite (or Playwright API tests) should land before the app ships
  to real customers, because these responses are contracts that can't be walked
  back.
- **The search walk's caps are guesses tuned on one vehicle.**
  `SEARCH_MAX_EXPANSIONS = 40` was enough for every query tried on a T-Roc and a
  Ranger, but a make with a broader tree may truncate sooner. The lever exists
  (one constant) and the honest signal exists (`truncated`), so this is worth
  revisiting with real query logs rather than guessing harder now.

## When complete

Update `docs/HANDOFF.md`, set the current task, commit.
